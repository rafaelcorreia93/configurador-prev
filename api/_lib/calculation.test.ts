import { describe, expect, it } from "vitest"

import {
  CalculationError,
  calculateContribution,
  type ContributionConfiguration,
  type ContributionRule,
  type ReferenceUnit,
} from "./calculation.js"

const unit: ReferenceUnit = {
  id: "ur-1",
  sigla: "UR",
  valorAtual: 5_000,
}

function rule(overrides: Partial<ContributionRule>): ContributionRule {
  return {
    ordem: 1,
    limiteInferior: 0,
    limiteSuperior: null,
    minPercentual: null,
    maxPercentual: null,
    percentualFixo: null,
    descricao: null,
    ...overrides,
  }
}

function configuration(
  overrides: Partial<ContributionConfiguration>,
): ContributionConfiguration {
  return {
    id: "configuration-1",
    tipo: "normal",
    modelo: "fatias_aditivas",
    variavelReferencia: "UR",
    numParcelasAnuais: 12,
    proporcaoPatrocinador: 1,
    limiteMaximoPatrocinador: null,
    regras: [],
    ...overrides,
  }
}

describe("calculateContribution", () => {
  it("soma as fatias aditivas usando o valor monetário da unidade", () => {
    const result = calculateContribution(
      { src: 10_000 },
      configuration({
        modelo: "fatias_aditivas",
        limiteMaximoPatrocinador: 5,
        regras: [
          rule({ ordem: 1, limiteSuperior: 1, percentualFixo: 2 }),
          rule({ ordem: 2, limiteInferior: 1, percentualFixo: 6.5 }),
        ],
      }),
      unit,
    )

    expect(result.participante).toMatchObject({
      modo: "fixo",
      valorMensal: 425,
      valorAnual: 5_100,
    })
    expect(result.patrocinador).toMatchObject({
      valorMensal: 425,
      tetoMensal: 500,
    })
    expect(result.faixasAplicadas).toEqual([
      expect.objectContaining({ baseCalculo: 5_000, percentual: 2, valor: 100 }),
      expect.objectContaining({ baseCalculo: 5_000, percentual: 6.5, valor: 325 }),
    ])
  })

  it("retorna o intervalo livre e limita a contrapartida do patrocinador", () => {
    const result = calculateContribution(
      { src: 6_000 },
      configuration({
        modelo: "percentual_livre",
        proporcaoPatrocinador: 1,
        limiteMaximoPatrocinador: 4,
        regras: [rule({ minPercentual: 3, maxPercentual: 5 })],
      }),
      null,
    )

    expect(result.participante).toEqual({
      modo: "faixa",
      percentualPermitido: { minimo: 3, maximo: 5 },
      valorMensalPermitido: { minimo: 180, maximo: 300 },
      valorAnualPermitido: { minimo: 2_160, maximo: 3_600 },
    })
    expect(result.patrocinador).toMatchObject({
      valorMensalPermitido: { minimo: 180, maximo: 240 },
      tetoMensal: 240,
    })
  })

  it("calcula o percentual escolhido quando ele está na faixa", () => {
    const result = calculateContribution(
      { src: 6_000, percentualEscolhido: 4 },
      configuration({
        modelo: "percentual_livre",
        regras: [rule({ minPercentual: 3, maxPercentual: 5 })],
      }),
      null,
    )

    expect(result.participante).toMatchObject({
      modo: "escolhido",
      percentual: 4,
      valorMensal: 240,
    })
  })

  it("usa a soma de idade e tempo de serviço para localizar a faixa", () => {
    const result = calculateContribution(
      { src: 10_000, idade: 30, tempoServico: 10 },
      configuration({
        modelo: "idade_tempo_servico",
        variavelReferencia: "idade_tempo_servico",
        regras: [
          rule({ limiteSuperior: 45, percentualFixo: 2 }),
          rule({ ordem: 2, limiteInferior: 45, percentualFixo: 3 }),
        ],
      }),
      null,
    )

    expect(result.referenciaCalculo.valor).toBe(40)
    expect(result.faixaEnquadramento.ordem).toBe(1)
    expect(result.participante).toMatchObject({ percentual: 2, valorMensal: 200 })
  })

  it("considera o limite superior exclusivo", () => {
    const result = calculateContribution(
      { src: 10_000, idade: 35, tempoServico: 10 },
      configuration({
        modelo: "idade_tempo_servico",
        regras: [
          rule({ limiteSuperior: 45, percentualFixo: 2 }),
          rule({ ordem: 2, limiteInferior: 45, percentualFixo: 3 }),
        ],
      }),
      null,
    )

    expect(result.faixaEnquadramento.ordem).toBe(2)
    expect(result.participante).toMatchObject({ percentual: 3, valorMensal: 300 })
  })

  it("aplica o fator escolhido ao percentual base", () => {
    const result = calculateContribution(
      { src: 10_000, fatorEscolhido: 1.5 },
      configuration({
        modelo: "multiplicador_formula",
        regras: [
          rule({ minPercentual: 0.5, maxPercentual: 2, percentualFixo: 2 }),
        ],
      }),
      null,
    )

    expect(result.participante).toMatchObject({
      modo: "escolhido",
      fatorEscolhido: 1.5,
      percentual: 3,
      valorMensal: 300,
    })
  })

  it("rejeita uma escolha fora do intervalo permitido", () => {
    expect(() => calculateContribution(
      { src: 6_000, percentualEscolhido: 6 },
      configuration({
        modelo: "percentual_livre",
        regras: [rule({ minPercentual: 3, maxPercentual: 5 })],
      }),
      null,
    )).toThrowError(CalculationError)
  })
})
