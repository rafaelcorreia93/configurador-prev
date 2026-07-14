import { describe, expect, it } from "vitest"

import { receiptRulesSchema } from "./regras-recebimento.js"

function validPayload() {
  return {
    planoId: "6db37d58-76cb-4ed2-b612-f626aec42f29",
    regrasAposentadoria: [{
      tipo: "normal",
      idadeMinima: 60,
      carenciaVinculacaoMeses: 60,
      exigeTerminoVinculo: true,
      formulaMinimaCustomizada: "3 * salario_participacao * (servico_creditado / 35)",
    }],
    configuracaoRenda: {
      permiteSaqueInicial: true,
      percentualMaxSaque: 25,
      periodicidadeRecalculo: "anual",
      modalidades: [{
        modalidadeTipo: "percentual_saldo",
        percentualRendaMin: 0.1,
        percentualRendaMax: 2.5,
        percentualMaxSaldoValorFixo: null,
        prazoMesesMin: null,
        prazoMesesMax: null,
      }],
    },
    limitesPagamento: {
      rendaMensalMinimaUnidade: 1,
      unidadeRendaMinima: "URMM",
      quitacaoSaldoResidualValor: 5,
      unidadeQuitacaoSaldo: "UR",
    },
  }
}

describe("receiptRulesSchema", () => {
  it("aceita uma configuração completa com fórmula customizada", () => {
    expect(receiptRulesSchema.safeParse(validPayload()).success).toBe(true)
  })

  it("exige percentual quando o saque inicial está habilitado", () => {
    const payload = validPayload()
    payload.configuracaoRenda.percentualMaxSaque = null as unknown as number

    expect(receiptRulesSchema.safeParse(payload).success).toBe(false)
  })

  it("rejeita intervalo percentual invertido", () => {
    const payload = validPayload()
    payload.configuracaoRenda.modalidades[0].percentualRendaMin = 5
    payload.configuracaoRenda.modalidades[0].percentualRendaMax = 2.5

    expect(receiptRulesSchema.safeParse(payload).success).toBe(false)
  })

  it("exige valor e unidade em conjunto nos limites", () => {
    const payload = validPayload()
    payload.limitesPagamento.unidadeRendaMinima = null as unknown as string

    expect(receiptRulesSchema.safeParse(payload).success).toBe(false)
  })

  it("exige limite sobre o saldo para a modalidade de valor fixo", () => {
    const payload = validPayload()
    payload.configuracaoRenda.modalidades = [{
      modalidadeTipo: "valor_fixo",
      percentualRendaMin: null as unknown as number,
      percentualRendaMax: null as unknown as number,
      percentualMaxSaldoValorFixo: null,
      prazoMesesMin: null,
      prazoMesesMax: null,
    }]

    expect(receiptRulesSchema.safeParse(payload).success).toBe(false)
  })
})
