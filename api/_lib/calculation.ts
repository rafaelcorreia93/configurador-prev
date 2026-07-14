export const contributionModels = [
  "percentual_livre",
  "fatias_aditivas",
  "idade_tempo_servico",
  "multiplicador_formula",
] as const

export type ContributionModel = (typeof contributionModels)[number]

export type ContributionRule = {
  id?: string
  ordem: number
  limiteInferior: number
  limiteSuperior: number | null
  minPercentual: number | null
  maxPercentual: number | null
  percentualFixo: number | null
  criterioSoma?: unknown
  descricao: string | null
}

export type ContributionConfiguration = {
  id: string
  tipo: string
  modelo: ContributionModel
  variavelReferencia: string
  numParcelasAnuais: number
  proporcaoPatrocinador: number
  limiteMaximoPatrocinador: number | null
  regras: ContributionRule[]
}

export type ReferenceUnit = {
  id: string
  sigla: string
  valorAtual: number
}

export type CalculationInput = {
  src: number
  percentualEscolhido?: number
  fatorEscolhido?: number
  idade?: number
  tempoServico?: number
}

export class CalculationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 422,
  ) {
    super(message)
    this.name = "CalculationError"
  }
}

type ExactParticipant = {
  modo: "fixo" | "escolhido"
  percentual: number
  fatorEscolhido?: number
  valorMensal: number
  valorAnual: number
}

type RangeParticipant = {
  modo: "faixa"
  percentualPermitido?: { minimo: number; maximo: number }
  fatorPermitido?: { minimo: number; maximo: number }
  percentualEfetivoPermitido?: { minimo: number; maximo: number }
  valorMensalPermitido: { minimo: number; maximo: number }
  valorAnualPermitido: { minimo: number; maximo: number }
}

type ParticipantResult = ExactParticipant | RangeParticipant

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundReference(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function percentageValue(base: number, percentage: number) {
  return base * (percentage / 100)
}

function isInsideRange(value: number, rule: ContributionRule) {
  return value >= rule.limiteInferior &&
    (rule.limiteSuperior === null || value < rule.limiteSuperior)
}

function findRule(value: number, rules: ContributionRule[]) {
  return [...rules]
    .sort((left, right) => left.ordem - right.ordem)
    .find((rule) => isInsideRange(value, rule))
}

function requireNumber(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new CalculationError(
      `A regra selecionada não possui ${field}.`,
      "CONFIGURACAO_INCOMPLETA",
    )
  }

  return value
}

function serializeRule(rule: ContributionRule) {
  return {
    id: rule.id,
    ordem: rule.ordem,
    limiteInferior: rule.limiteInferior,
    limiteSuperior: rule.limiteSuperior,
    descricao: rule.descricao,
  }
}

function annualRange(monthly: { minimo: number; maximo: number }, installments: number) {
  return {
    minimo: roundMoney(monthly.minimo * installments),
    maximo: roundMoney(monthly.maximo * installments),
  }
}

function calculateSponsor(
  participant: ParticipantResult,
  src: number,
  configuration: ContributionConfiguration,
) {
  const cap = configuration.limiteMaximoPatrocinador === null
    ? null
    : percentageValue(src, configuration.limiteMaximoPatrocinador)
  const applySponsor = (participantValue: number) => {
    const proportionalValue = participantValue * configuration.proporcaoPatrocinador
    return roundMoney(cap === null ? proportionalValue : Math.min(proportionalValue, cap))
  }

  const common = {
    proporcao: configuration.proporcaoPatrocinador,
    limitePercentualSrc: configuration.limiteMaximoPatrocinador,
    tetoMensal: cap === null ? null : roundMoney(cap),
  }

  if (participant.modo !== "faixa") {
    const monthly = applySponsor(participant.valorMensal)
    return {
      ...common,
      modo: "fixo" as const,
      valorMensal: monthly,
      valorAnual: roundMoney(monthly * configuration.numParcelasAnuais),
    }
  }

  const monthly = {
    minimo: applySponsor(participant.valorMensalPermitido.minimo),
    maximo: applySponsor(participant.valorMensalPermitido.maximo),
  }

  return {
    ...common,
    modo: "faixa" as const,
    valorMensalPermitido: monthly,
    valorAnualPermitido: annualRange(monthly, configuration.numParcelasAnuais),
  }
}

function resolveReference(
  input: CalculationInput,
  configuration: ContributionConfiguration,
  referenceUnit: ReferenceUnit | null,
) {
  if (configuration.modelo === "idade_tempo_servico") {
    if (input.idade === undefined || input.tempoServico === undefined) {
      throw new CalculationError(
        "Informe idade e tempoServico para calcular esta contribuição.",
        "DADOS_BIOMETRICOS_OBRIGATORIOS",
        400,
      )
    }

    return {
      value: input.idade + input.tempoServico,
      kind: "soma_idade_tempo_servico" as const,
      unitValue: null,
    }
  }

  const usesUnit = referenceUnit !== null &&
    configuration.variavelReferencia.trim().toUpperCase() === referenceUnit.sigla.trim().toUpperCase()

  if (usesUnit) {
    return {
      value: input.src / referenceUnit.valorAtual,
      kind: "unidade_referencia" as const,
      unitValue: referenceUnit.valorAtual,
    }
  }

  return {
    value: input.src,
    kind: "src" as const,
    unitValue: null,
  }
}

export function calculateContribution(
  input: CalculationInput,
  configuration: ContributionConfiguration,
  referenceUnit: ReferenceUnit | null,
) {
  if (configuration.regras.length === 0) {
    throw new CalculationError(
      "A configuração ativa não possui faixas cadastradas.",
      "CONFIGURACAO_SEM_FAIXAS",
    )
  }

  const reference = resolveReference(input, configuration, referenceUnit)
  const rule = findRule(reference.value, configuration.regras)

  if (!rule) {
    throw new CalculationError(
      "Nenhuma faixa atende aos dados informados.",
      "FAIXA_NAO_ENCONTRADA",
    )
  }

  let participant: ParticipantResult
  const appliedSlices: Array<Record<string, unknown>> = []
  const calculationMemory: string[] = []

  if (configuration.modelo === "percentual_livre") {
    const minimum = requireNumber(rule.minPercentual, "percentual mínimo")
    const maximum = requireNumber(rule.maxPercentual, "percentual máximo")

    if (input.percentualEscolhido === undefined) {
      const monthly = {
        minimo: roundMoney(percentageValue(input.src, minimum)),
        maximo: roundMoney(percentageValue(input.src, maximum)),
      }
      participant = {
        modo: "faixa",
        percentualPermitido: { minimo: minimum, maximo: maximum },
        valorMensalPermitido: monthly,
        valorAnualPermitido: annualRange(monthly, configuration.numParcelasAnuais),
      }
      calculationMemory.push(`Percentual permitido entre ${minimum}% e ${maximum}% sobre o SRC.`)
    } else {
      if (input.percentualEscolhido < minimum || input.percentualEscolhido > maximum) {
        throw new CalculationError(
          `O percentualEscolhido deve estar entre ${minimum}% e ${maximum}%.`,
          "PERCENTUAL_FORA_DA_FAIXA",
          400,
        )
      }

      const monthly = roundMoney(percentageValue(input.src, input.percentualEscolhido))
      participant = {
        modo: "escolhido",
        percentual: input.percentualEscolhido,
        valorMensal: monthly,
        valorAnual: roundMoney(monthly * configuration.numParcelasAnuais),
      }
      calculationMemory.push(`${input.percentualEscolhido}% sobre o SRC.`)
    }
  } else if (configuration.modelo === "fatias_aditivas") {
    let total = 0
    const sortedRules = [...configuration.regras].sort((left, right) => left.ordem - right.ordem)

    for (const slice of sortedRules) {
      const lower = reference.unitValue === null
        ? slice.limiteInferior
        : slice.limiteInferior * reference.unitValue
      const upper = slice.limiteSuperior === null
        ? null
        : reference.unitValue === null
          ? slice.limiteSuperior
          : slice.limiteSuperior * reference.unitValue
      const sliceBase = Math.max(Math.min(input.src, upper ?? input.src) - lower, 0)

      if (sliceBase <= 0) {
        continue
      }

      const percentage = requireNumber(slice.percentualFixo, "percentual fixo")
      const sliceValue = percentageValue(sliceBase, percentage)
      total += sliceValue
      appliedSlices.push({
        ordem: slice.ordem,
        descricao: slice.descricao,
        limiteMonetarioInferior: roundMoney(lower),
        limiteMonetarioSuperior: upper === null ? null : roundMoney(upper),
        baseCalculo: roundMoney(sliceBase),
        percentual: percentage,
        valor: roundMoney(sliceValue),
      })
      calculationMemory.push(`${percentage}% sobre ${roundMoney(sliceBase)} na fatia ${slice.ordem}.`)
    }

    const monthly = roundMoney(total)
    participant = {
      modo: "fixo",
      percentual: roundReference(input.src === 0 ? 0 : (total / input.src) * 100),
      valorMensal: monthly,
      valorAnual: roundMoney(monthly * configuration.numParcelasAnuais),
    }
  } else if (configuration.modelo === "idade_tempo_servico") {
    const percentage = requireNumber(rule.percentualFixo, "percentual fixo")
    const monthly = roundMoney(percentageValue(input.src, percentage))
    participant = {
      modo: "fixo",
      percentual: percentage,
      valorMensal: monthly,
      valorAnual: roundMoney(monthly * configuration.numParcelasAnuais),
    }
    calculationMemory.push(
      `Idade (${input.idade}) + tempo de serviço (${input.tempoServico}) = ${reference.value}; percentual ${percentage}%.`,
    )
  } else {
    const basePercentage = requireNumber(rule.percentualFixo, "percentual base")
    const minimumFactor = requireNumber(rule.minPercentual, "fator mínimo")
    const maximumFactor = requireNumber(rule.maxPercentual, "fator máximo")

    if (input.fatorEscolhido === undefined) {
      const effectiveMinimum = basePercentage * minimumFactor
      const effectiveMaximum = basePercentage * maximumFactor
      const monthly = {
        minimo: roundMoney(percentageValue(input.src, effectiveMinimum)),
        maximo: roundMoney(percentageValue(input.src, effectiveMaximum)),
      }
      participant = {
        modo: "faixa",
        fatorPermitido: { minimo: minimumFactor, maximo: maximumFactor },
        percentualEfetivoPermitido: { minimo: effectiveMinimum, maximo: effectiveMaximum },
        valorMensalPermitido: monthly,
        valorAnualPermitido: annualRange(monthly, configuration.numParcelasAnuais),
      }
      calculationMemory.push(
        `Percentual base ${basePercentage}% multiplicado por fator entre ${minimumFactor} e ${maximumFactor}.`,
      )
    } else {
      if (input.fatorEscolhido < minimumFactor || input.fatorEscolhido > maximumFactor) {
        throw new CalculationError(
          `O fatorEscolhido deve estar entre ${minimumFactor} e ${maximumFactor}.`,
          "FATOR_FORA_DA_FAIXA",
          400,
        )
      }

      const effectivePercentage = basePercentage * input.fatorEscolhido
      const monthly = roundMoney(percentageValue(input.src, effectivePercentage))
      participant = {
        modo: "escolhido",
        percentual: effectivePercentage,
        fatorEscolhido: input.fatorEscolhido,
        valorMensal: monthly,
        valorAnual: roundMoney(monthly * configuration.numParcelasAnuais),
      }
      calculationMemory.push(
        `${basePercentage}% × ${input.fatorEscolhido} = ${effectivePercentage}% sobre o SRC.`,
      )
    }
  }

  return {
    referenciaCalculo: {
      variavel: configuration.variavelReferencia,
      tipo: reference.kind,
      valor: roundReference(reference.value),
      valorUnidade: reference.unitValue,
    },
    faixaEnquadramento: serializeRule(rule),
    ...(appliedSlices.length > 0 ? { faixasAplicadas: appliedSlices } : {}),
    participante: participant,
    patrocinador: calculateSponsor(participant, input.src, configuration),
    memoriaCalculo: calculationMemory,
  }
}
