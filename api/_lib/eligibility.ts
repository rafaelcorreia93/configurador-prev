export type RetirementRule = {
  id: string
  tipo: "normal" | "antecipada" | "proporcional"
  idadeMinima: number
  carenciaVinculacaoMeses: number
  exigeTerminoVinculo: boolean
  formulaMinimaCustomizada: string | null
}

export type IncomeOption = {
  id: string
  modalidadeTipo: "percentual_saldo" | "prazo_determinado" | "valor_fixo"
  permiteSaqueInicial: boolean
  percentualMaxSaque: number | null
  percentualRendaMin: number | null
  percentualRendaMax: number | null
  percentualMaxSaldoValorFixo: number | null
  prazoMesesMin: number | null
  prazoMesesMax: number | null
  periodicidadeRecalculo: "mensal" | "anual"
}

export type PaymentLimits = {
  rendaMensalMinimaUnidade: number | null
  unidadeRendaMinima: string | null
  valorAtualUnidadeReferencia: number | null
  quitacaoSaldoResidualValor: number | null
  unidadeQuitacaoSaldo: string | null
}

export type EligibilityInput = {
  idade: number
  tempoVinculacaoMeses: number
  vinculoEncerrado: boolean
  salarioParticipacao?: number
  servicoCreditadoAnos?: number
  saldoConta?: number
}

export class EligibilityError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 422,
  ) {
    super(message)
    this.name = "EligibilityError"
  }
}

type FormulaVariables = {
  salarioParticipacao: number
  servicoCreditadoAnos: number
}

type Operator = "+" | "-" | "*" | "/" | "(" | ")"

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: Operator }
  | { type: "end" }

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeFormula(formula: string) {
  const compact = formula.toLowerCase().replace(/\s/g, "")

  if (compact === "3spsc/35") {
    return "3 * salario_participacao * (servico_creditado / 35)"
  }

  return formula
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  let position = 0

  while (position < formula.length) {
    const character = formula[position]

    if (/\s/.test(character)) {
      position += 1
      continue
    }

    if (/[0-9.]/.test(character)) {
      const start = position
      position += 1
      while (position < formula.length && /[0-9.]/.test(formula[position])) position += 1
      const rawNumber = formula.slice(start, position)
      const value = Number(rawNumber)
      if (!Number.isFinite(value) || (rawNumber.match(/\./g)?.length ?? 0) > 1) {
        throw new EligibilityError("A fórmula customizada possui um número inválido.", "FORMULA_INVALIDA")
      }
      tokens.push({ type: "number", value })
      continue
    }

    if (/[A-Za-z_]/.test(character)) {
      const start = position
      position += 1
      while (position < formula.length && /[A-Za-z0-9_]/.test(formula[position])) position += 1
      tokens.push({ type: "identifier", value: formula.slice(start, position) })
      continue
    }

    if (["+", "-", "*", "/", "(", ")"].includes(character)) {
      tokens.push({ type: "operator", value: character as Operator })
      position += 1
      continue
    }

    throw new EligibilityError(
      `A fórmula customizada contém o caractere não permitido "${character}".`,
      "FORMULA_INVALIDA",
    )
  }

  tokens.push({ type: "end" })
  return tokens
}

function resolveVariable(identifier: string, variables: FormulaVariables) {
  const normalized = identifier.toLowerCase().replace(/_/g, "")

  if (normalized === "salarioparticipacao" || normalized === "sps") {
    return variables.salarioParticipacao
  }

  if (normalized === "servicocreditado" || normalized === "servicocreditadoanos" || normalized === "sc") {
    return variables.servicoCreditadoAnos
  }

  throw new EligibilityError(
    `A variável "${identifier}" não é permitida na fórmula customizada.`,
    "FORMULA_VARIAVEL_INVALIDA",
  )
}

export function evaluateBenefitFormula(formula: string, variables: FormulaVariables) {
  const tokens = tokenize(normalizeFormula(formula))
  let position = 0
  const current = () => tokens[position]
  const consume = () => tokens[position++]

  function parseExpression(): number {
    let value = parseTerm()
    while (true) {
      const nextToken = current()
      if (nextToken.type !== "operator" || (nextToken.value !== "+" && nextToken.value !== "-")) break
      const operator = consume()
      const right = parseTerm()
      value = operator.type === "operator" && operator.value === "+" ? value + right : value - right
    }
    return value
  }

  function parseTerm(): number {
    let value = parseFactor()
    while (true) {
      const nextToken = current()
      if (nextToken.type !== "operator" || (nextToken.value !== "*" && nextToken.value !== "/")) break
      const operator = consume()
      const right = parseFactor()
      if (operator.type === "operator" && operator.value === "/" && right === 0) {
        throw new EligibilityError("A fórmula customizada tentou realizar uma divisão por zero.", "FORMULA_DIVISAO_ZERO")
      }
      value = operator.type === "operator" && operator.value === "*" ? value * right : value / right
    }
    return value
  }

  function parseFactor(): number {
    const token = consume()

    if (token.type === "number") return token.value
    if (token.type === "identifier") return resolveVariable(token.value, variables)

    if (token.type === "operator" && token.value === "-") return -parseFactor()
    if (token.type === "operator" && token.value === "+") return parseFactor()

    if (token.type === "operator" && token.value === "(") {
      const value = parseExpression()
      const closingToken = consume()
      if (closingToken.type !== "operator" || closingToken.value !== ")") {
        throw new EligibilityError("A fórmula customizada possui parênteses inválidos.", "FORMULA_INVALIDA")
      }
      return value
    }

    throw new EligibilityError("A fórmula customizada possui uma expressão inválida.", "FORMULA_INVALIDA")
  }

  const result = parseExpression()
  if (current().type !== "end" || !Number.isFinite(result)) {
    throw new EligibilityError("A fórmula customizada não pôde ser calculada.", "FORMULA_INVALIDA")
  }

  return roundMoney(result)
}

function calculateMinimumBenefit(rule: RetirementRule, input: EligibilityInput) {
  if (!rule.formulaMinimaCustomizada) return null

  if (
    input.salarioParticipacao === undefined ||
    input.servicoCreditadoAnos === undefined ||
    input.saldoConta === undefined
  ) {
    throw new EligibilityError(
      "Informe salarioParticipacao, servicoCreditadoAnos e saldoConta para aplicar a fórmula customizada.",
      "DADOS_FORMULA_OBRIGATORIOS",
      400,
    )
  }

  const minimumBenefit = evaluateBenefitFormula(rule.formulaMinimaCustomizada, {
    salarioParticipacao: input.salarioParticipacao,
    servicoCreditadoAnos: input.servicoCreditadoAnos,
  })
  const accountBalance = roundMoney(input.saldoConta)
  const suggestedValue = Math.max(minimumBenefit, accountBalance)

  return {
    formula: rule.formulaMinimaCustomizada,
    beneficioMinimo: minimumBenefit,
    saldoConta: accountBalance,
    valorSugerido: roundMoney(suggestedValue),
    origemValorSugerido: minimumBenefit > accountBalance ? "beneficio_minimo" : "saldo_conta",
  }
}

export function calculateEligibility(
  input: EligibilityInput,
  retirementRules: RetirementRule[],
  incomeOptions: IncomeOption[],
  paymentLimits: PaymentLimits,
) {
  if (retirementRules.length === 0) {
    throw new EligibilityError(
      "O plano não possui regras de aposentadoria ativas.",
      "PLANO_SEM_REGRAS_APOSENTADORIA",
    )
  }

  const eligibility = retirementRules.map((rule) => {
    const ageMet = input.idade >= rule.idadeMinima
    const vestingMet = input.tempoVinculacaoMeses >= rule.carenciaVinculacaoMeses
    const terminationMet = !rule.exigeTerminoVinculo || input.vinculoEncerrado
    const pendingRequirements: string[] = []

    if (!ageMet) pendingRequirements.push(`Atingir ${rule.idadeMinima} anos de idade.`)
    if (!vestingMet) pendingRequirements.push(`Completar ${rule.carenciaVinculacaoMeses} meses de vinculação.`)
    if (!terminationMet) pendingRequirements.push("Encerrar o vínculo empregatício.")

    return {
      regraId: rule.id,
      tipo: rule.tipo,
      elegivel: ageMet && vestingMet && terminationMet,
      criterios: {
        idade: { informado: input.idade, minimo: rule.idadeMinima, atendido: ageMet },
        vinculacaoMeses: {
          informado: input.tempoVinculacaoMeses,
          minimo: rule.carenciaVinculacaoMeses,
          atendido: vestingMet,
        },
        terminoVinculo: {
          obrigatorio: rule.exigeTerminoVinculo,
          informado: input.vinculoEncerrado,
          atendido: terminationMet,
        },
      },
      pendencias: pendingRequirements,
      beneficioMinimo: calculateMinimumBenefit(rule, input),
    }
  })

  const anyEligible = eligibility.some((result) => result.elegivel)
  const firstIncomeOption = incomeOptions[0]
  const minimumMonthlyAmount =
    paymentLimits.rendaMensalMinimaUnidade !== null &&
    paymentLimits.valorAtualUnidadeReferencia !== null
      ? roundMoney(
          paymentLimits.rendaMensalMinimaUnidade * paymentLimits.valorAtualUnidadeReferencia,
        )
      : null

  return {
    elegivelEmAlgumaModalidade: anyEligible,
    elegibilidade: eligibility,
    opcoesRecebimento: {
      liberadas: anyEligible,
      saqueInicial: {
        permitido: firstIncomeOption?.permiteSaqueInicial ?? false,
        percentualMaximo: firstIncomeOption?.percentualMaxSaque ?? null,
      },
      periodicidadeRecalculo: firstIncomeOption?.periodicidadeRecalculo ?? null,
      modalidades: incomeOptions.map((option) => {
        const isFixedAmount = option.modalidadeTipo === "valor_fixo"
        const maximumMonthlyAmount =
          isFixedAmount &&
          input.saldoConta !== undefined &&
          option.percentualMaxSaldoValorFixo !== null
            ? roundMoney(input.saldoConta * (option.percentualMaxSaldoValorFixo / 100))
            : null

        return {
          tipo: option.modalidadeTipo,
          percentualRendaMin: option.percentualRendaMin,
          percentualRendaMax: option.percentualRendaMax,
          percentualMaxSaldoValorFixo: option.percentualMaxSaldoValorFixo,
          prazoMesesMin: option.prazoMesesMin,
          prazoMesesMax: option.prazoMesesMax,
          valorMensalMinimo: isFixedAmount ? minimumMonthlyAmount : null,
          valorMensalMaximo: isFixedAmount ? maximumMonthlyAmount : null,
        }
      }),
      limitesPagamento: {
        rendaMensalMinimaUnidade: paymentLimits.rendaMensalMinimaUnidade,
        unidadeRendaMinima: paymentLimits.unidadeRendaMinima,
        valorAtualUnidadeReferencia: paymentLimits.valorAtualUnidadeReferencia,
        rendaMensalMinimaValor: minimumMonthlyAmount,
        quitacaoSaldoResidualValor: paymentLimits.quitacaoSaldoResidualValor,
        unidadeQuitacaoSaldo: paymentLimits.unidadeQuitacaoSaldo,
      },
    },
  }
}

export const calcularElegibilidade = calculateEligibility
