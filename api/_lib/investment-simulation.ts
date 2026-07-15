import {
  CalculationError,
  calculateContribution,
  type ContributionConfiguration,
  type ReferenceUnit,
} from "./calculation.js"

export type SimulationRetirementRule = {
  id: string
  tipo: "normal" | "antecipada" | "proporcional"
  idadeMinima: number
  carenciaVinculacaoMeses: number
}

export type InvestmentSimulationInput = {
  idadeAtual: number
  dataAdesao: string
  dataAdmissao?: string
  src: number
  rentabilidadeAnual: number
  percentualEscolhido?: number
  fatorEscolhido?: number
}

export type OpenInvestmentCalculationInput = {
  vp: number
  basicaParticipante: number
  basicaEmpresa: number
  voluntariaParticipante: number
  voluntariaEmpresa: number
  r_anual: number
  dataInicio: string
  dataFim: string
  pmt_extra: number
  freq_extra: "12 meses"
  considerar_decimo: boolean
}

export class InvestmentSimulationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 422,
  ) {
    super(message)
    this.name = "InvestmentSimulationError"
  }
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function addYears(value: Date, years: number) {
  const result = new Date(value)
  result.setUTCFullYear(result.getUTCFullYear() + years)
  return result
}

function addMonths(value: Date, months: number) {
  const result = new Date(value)
  const originalDay = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate()
  result.setUTCDate(Math.min(originalDay, lastDay))
  return result
}

function completedMonths(start: Date, end: Date) {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + end.getUTCMonth() - start.getUTCMonth()

  if (end.getUTCDate() < start.getUTCDate()) months -= 1
  return Math.max(0, months)
}

function latestDate(...dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

function resolveMinimumEligibilityDate(
  input: InvestmentSimulationInput,
  rules: SimulationRetirementRule[],
  calculationStart: Date,
) {
  if (rules.length === 0) {
    throw new InvestmentSimulationError(
      "O plano não possui regras de aposentadoria ativas.",
      "PLANO_SEM_REGRAS_APOSENTADORIA",
    )
  }

  const adhesionDate = parseIsoDate(input.dataAdesao)
  const candidates = rules.map((rule) => {
    const remainingYears = Math.max(0, rule.idadeMinima - input.idadeAtual)
    const ageDate = addYears(calculationStart, remainingYears)
    const vestingDate = addMonths(adhesionDate, rule.carenciaVinculacaoMeses)

    return latestDate(calculationStart, ageDate, vestingDate)
  })

  return candidates.reduce((earliest, candidate) => (
    candidate.getTime() < earliest.getTime() ? candidate : earliest
  ))
}

function exactMonthlyValue(
  value: { modo: string; valorMensal?: number; valorMensalPermitido?: { minimo: number } },
) {
  if (value.modo === "faixa") {
    if (!value.valorMensalPermitido) {
      throw new CalculationError(
        "A regra de contribuição não retornou a faixa mensal esperada.",
        "RESULTADO_CONTRIBUICAO_INVALIDO",
      )
    }

    return value.valorMensalPermitido.minimo
  }

  if (value.valorMensal === undefined) {
    throw new CalculationError(
      "A regra de contribuição não retornou o valor mensal esperado.",
      "RESULTADO_CONTRIBUICAO_INVALIDO",
    )
  }

  return value.valorMensal
}

export function buildOpenInvestmentCalculationInput(
  input: InvestmentSimulationInput,
  configuration: ContributionConfiguration,
  referenceUnit: ReferenceUnit | null,
  retirementRules: SimulationRetirementRule[],
  calculationStart = new Date(),
): OpenInvestmentCalculationInput {
  if (![12, 13].includes(configuration.numParcelasAnuais)) {
    throw new InvestmentSimulationError(
      "A API de investimento aceita somente planos com 12 ou 13 parcelas anuais.",
      "NUMERO_PARCELAS_NAO_SUPORTADO",
    )
  }

  const start = parseIsoDate(formatIsoDate(calculationStart))
  let serviceYears: number | undefined

  if (configuration.modelo === "idade_tempo_servico") {
    if (!input.dataAdmissao) {
      throw new InvestmentSimulationError(
        "Informe data_admissao para este plano.",
        "DATA_ADMISSAO_OBRIGATORIA",
        400,
      )
    }

    serviceYears = completedMonths(parseIsoDate(input.dataAdmissao), start) / 12
  }

  const contribution = calculateContribution(
    {
      src: input.src,
      idade: input.idadeAtual,
      tempoServico: serviceYears,
      percentualEscolhido: input.percentualEscolhido,
      fatorEscolhido: input.fatorEscolhido,
    },
    configuration,
    referenceUnit,
  )
  const eligibilityDate = resolveMinimumEligibilityDate(input, retirementRules, start)

  return {
    vp: 0,
    basicaParticipante: exactMonthlyValue(contribution.participante),
    basicaEmpresa: exactMonthlyValue(contribution.patrocinador),
    voluntariaParticipante: 0,
    voluntariaEmpresa: 0,
    r_anual: input.rentabilidadeAnual,
    dataInicio: formatIsoDate(start),
    dataFim: formatIsoDate(eligibilityDate),
    pmt_extra: 0,
    freq_extra: "12 meses",
    considerar_decimo: configuration.numParcelasAnuais === 13,
  }
}
