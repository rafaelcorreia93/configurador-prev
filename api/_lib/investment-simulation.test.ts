import { describe, expect, it } from "vitest"

import type { ContributionConfiguration, ContributionRule } from "./calculation.js"
import {
  buildOpenInvestmentCalculationInput,
  InvestmentSimulationError,
  type SimulationRetirementRule,
} from "./investment-simulation.js"

function rule(overrides: Partial<ContributionRule> = {}): ContributionRule {
  return {
    ordem: 1,
    limiteInferior: 0,
    limiteSuperior: null,
    minPercentual: 3,
    maxPercentual: 5,
    percentualFixo: null,
    descricao: null,
    ...overrides,
  }
}

function configuration(
  overrides: Partial<ContributionConfiguration> = {},
): ContributionConfiguration {
  return {
    id: "configuration-1",
    tipo: "normal",
    modelo: "percentual_livre",
    variavelReferencia: "SRC",
    numParcelasAnuais: 12,
    proporcaoPatrocinador: 1,
    limiteMaximoPatrocinador: null,
    regras: [rule()],
    ...overrides,
  }
}

const retirementRules: SimulationRetirementRule[] = [{
  id: "retirement-1",
  tipo: "normal",
  idadeMinima: 60,
  carenciaVinculacaoMeses: 60,
}]

describe("buildOpenInvestmentCalculationInput", () => {
  it("usa a contribuição mínima da faixa e projeta até a primeira elegibilidade", () => {
    const result = buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 50,
        dataAdesao: "2024-01-15",
        src: 10_000,
        rentabilidadeAnual: 0.04,
      },
      configuration(),
      null,
      retirementRules,
      new Date("2026-07-15T12:00:00.000Z"),
    )

    expect(result).toEqual({
      vp: 0,
      basicaParticipante: 300,
      basicaEmpresa: 300,
      voluntariaParticipante: 0,
      voluntariaEmpresa: 0,
      r_anual: 0.04,
      dataInicio: "2026-07-15",
      dataFim: "2036-07-15",
      pmt_extra: 0,
      freq_extra: "12 meses",
      considerar_decimo: false,
    })
  })

  it("respeita o percentual escolhido dentro da faixa", () => {
    const result = buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 60,
        dataAdesao: "2010-01-01",
        src: 10_000,
        rentabilidadeAnual: 0.04,
        percentualEscolhido: 4,
      },
      configuration(),
      null,
      retirementRules,
      new Date("2026-07-15T12:00:00.000Z"),
    )

    expect(result).toMatchObject({
      basicaParticipante: 400,
      basicaEmpresa: 400,
      dataFim: "2026-07-15",
    })
  })

  it("permite postergar a projeção para a idade de aposentadoria escolhida", () => {
    const result = buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 50,
        idadeAposentadoria: 65,
        dataAdesao: "2024-01-15",
        src: 10_000,
        rentabilidadeAnual: 0.04,
      },
      configuration(),
      null,
      retirementRules,
      new Date("2026-07-15T12:00:00.000Z"),
    )

    expect(result.dataFim).toBe("2041-07-15")
  })

  it("não permite que a escolha antecipe a elegibilidade mínima", () => {
    const result = buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 50,
        idadeAposentadoria: 55,
        dataAdesao: "2024-01-15",
        src: 10_000,
        rentabilidadeAnual: 0.04,
      },
      configuration(),
      null,
      retirementRules,
      new Date("2026-07-15T12:00:00.000Z"),
    )

    expect(result.dataFim).toBe("2036-07-15")
  })

  it("usa a data de admissão nas regras de idade e tempo de serviço", () => {
    const result = buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 35,
        dataAdesao: "2016-01-01",
        dataAdmissao: "2016-07-15",
        src: 10_000,
        rentabilidadeAnual: 0.04,
      },
      configuration({
        modelo: "idade_tempo_servico",
        numParcelasAnuais: 13,
        regras: [
          rule({ limiteSuperior: 45, minPercentual: null, maxPercentual: null, percentualFixo: 2 }),
          rule({
            ordem: 2,
            limiteInferior: 45,
            minPercentual: null,
            maxPercentual: null,
            percentualFixo: 3,
          }),
        ],
      }),
      null,
      [{ ...retirementRules[0], idadeMinima: 40 }],
      new Date("2026-07-15T12:00:00.000Z"),
    )

    expect(result).toMatchObject({
      basicaParticipante: 300,
      basicaEmpresa: 300,
      dataFim: "2031-07-15",
      considerar_decimo: true,
    })
  })

  it("exige data de admissão apenas para idade e tempo de serviço", () => {
    expect(() => buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 35,
        dataAdesao: "2016-01-01",
        src: 10_000,
        rentabilidadeAnual: 0.04,
      },
      configuration({ modelo: "idade_tempo_servico" }),
      null,
      retirementRules,
      new Date("2026-07-15T12:00:00.000Z"),
    )).toThrowError(InvestmentSimulationError)
  })

  it("rejeita quantidade de parcelas incompatível com a API aberta", () => {
    expect(() => buildOpenInvestmentCalculationInput(
      {
        idadeAtual: 50,
        dataAdesao: "2024-01-15",
        src: 10_000,
        rentabilidadeAnual: 0.04,
      },
      configuration({ numParcelasAnuais: 14 }),
      null,
      retirementRules,
      new Date("2026-07-15T12:00:00.000Z"),
    )).toThrowError(InvestmentSimulationError)
  })
})
