import { describe, expect, it } from "vitest"

import {
  calculateEligibility,
  EligibilityError,
  evaluateBenefitFormula,
  type IncomeOption,
  type PaymentLimits,
  type RetirementRule,
} from "./eligibility.js"

const normalRule: RetirementRule = {
  id: "rule-normal",
  tipo: "normal",
  idadeMinima: 60,
  carenciaVinculacaoMeses: 60,
  exigeTerminoVinculo: true,
  formulaMinimaCustomizada: null,
}

const incomeOptions: IncomeOption[] = [
  {
    id: "income-percentage",
    modalidadeTipo: "percentual_saldo",
    permiteSaqueInicial: true,
    percentualMaxSaque: 25,
    percentualRendaMin: 0.1,
    percentualRendaMax: 2.5,
    percentualMaxSaldoValorFixo: null,
    prazoMesesMin: null,
    prazoMesesMax: null,
    periodicidadeRecalculo: "anual",
  },
  {
    id: "income-fixed",
    modalidadeTipo: "valor_fixo",
    permiteSaqueInicial: true,
    percentualMaxSaque: 25,
    percentualRendaMin: null,
    percentualRendaMax: null,
    percentualMaxSaldoValorFixo: 3,
    prazoMesesMin: null,
    prazoMesesMax: null,
    periodicidadeRecalculo: "anual",
  },
]

const paymentLimits: PaymentLimits = {
  rendaMensalMinimaUnidade: 1,
  unidadeRendaMinima: "UR",
  valorAtualUnidadeReferencia: 500,
  quitacaoSaldoResidualValor: 5,
  unidadeQuitacaoSaldo: "UR",
}

describe("calculateEligibility", () => {
  it("considera elegível quando todos os requisitos mínimos são atendidos", () => {
    const result = calculateEligibility(
      { idade: 60, tempoVinculacaoMeses: 60, vinculoEncerrado: true, saldoConta: 200_000 },
      [normalRule],
      incomeOptions,
      paymentLimits,
    )

    expect(result.elegivelEmAlgumaModalidade).toBe(true)
    expect(result.elegibilidade[0]).toMatchObject({ elegivel: true, pendencias: [] })
    expect(result.opcoesRecebimento).toMatchObject({
      liberadas: true,
      saqueInicial: { permitido: true, percentualMaximo: 25 },
      modalidades: [
        expect.objectContaining({ tipo: "percentual_saldo" }),
        expect.objectContaining({
          tipo: "valor_fixo",
          percentualMaxSaldoValorFixo: 3,
          valorMensalMinimo: 500,
          valorMensalMaximo: 6_000,
        }),
      ],
    })
    expect(result.opcoesRecebimento.limitesPagamento).toMatchObject({
      rendaMensalMinimaValor: 500,
      valorAtualUnidadeReferencia: 500,
    })
  })

  it("retorna todas as pendências quando os critérios não são atendidos", () => {
    const result = calculateEligibility(
      { idade: 55, tempoVinculacaoMeses: 24, vinculoEncerrado: false },
      [normalRule],
      incomeOptions,
      paymentLimits,
    )

    expect(result.elegivelEmAlgumaModalidade).toBe(false)
    expect(result.elegibilidade[0].pendencias).toEqual([
      "Atingir 60 anos de idade.",
      "Completar 60 meses de vinculação.",
      "Encerrar o vínculo empregatício.",
    ])
    expect(result.opcoesRecebimento.liberadas).toBe(false)
  })

  it("aplica a fórmula Rocheprev e sugere o maior valor", () => {
    const rocheRule: RetirementRule = {
      ...normalRule,
      id: "rule-roche",
      formulaMinimaCustomizada: "3 * salario_participacao * (servico_creditado / 35)",
    }
    const result = calculateEligibility(
      {
        idade: 60,
        tempoVinculacaoMeses: 60,
        vinculoEncerrado: true,
        salarioParticipacao: 10_000,
        servicoCreditadoAnos: 20,
        saldoConta: 15_000,
      },
      [rocheRule],
      incomeOptions,
      paymentLimits,
    )

    expect(result.elegibilidade[0].beneficioMinimo).toEqual({
      formula: "3 * salario_participacao * (servico_creditado / 35)",
      beneficioMinimo: 17_142.86,
      saldoConta: 15_000,
      valorSugerido: 17_142.86,
      origemValorSugerido: "beneficio_minimo",
    })
  })

  it("aceita a notação compacta 3SPSC/35", () => {
    expect(evaluateBenefitFormula("3SPSC/35", {
      salarioParticipacao: 10_000,
      servicoCreditadoAnos: 35,
    })).toBe(30_000)
  })

  it("rejeita código e variáveis não autorizadas na fórmula", () => {
    expect(() => evaluateBenefitFormula("process.exit(1)", {
      salarioParticipacao: 10_000,
      servicoCreditadoAnos: 20,
    })).toThrowError(EligibilityError)
  })

  it("exige os dados financeiros quando existe fórmula customizada", () => {
    expect(() => calculateEligibility(
      { idade: 60, tempoVinculacaoMeses: 60, vinculoEncerrado: true },
      [{ ...normalRule, formulaMinimaCustomizada: "3SPSC/35" }],
      incomeOptions,
      paymentLimits,
    )).toThrowError(EligibilityError)
  })
})
