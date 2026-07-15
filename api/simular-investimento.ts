import { z } from "zod"

import {
  CalculationError,
  contributionModels,
  type ContributionConfiguration,
  type ReferenceUnit,
} from "./_lib/calculation.js"
import { DatabaseConfigurationError, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"
import { calculateInvestment, InvestmentApiError } from "./_lib/investment-api.js"
import {
  buildOpenInvestmentCalculationInput,
  InvestmentSimulationError,
  type SimulationRetirementRule,
} from "./_lib/investment-simulation.js"

const isoDate = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value: string) {
  if (!isoDate.test(value)) return false

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const investmentSimulationSchema = z.object({
  cod_plano: z.string().trim().min(1, "Informe o código do plano.").max(50),
  idade_atual: z.number().int().min(0).max(120),
  data_adesao: z.string().refine(isValidIsoDate, "Use uma data válida no formato AAAA-MM-DD."),
  src: z.number().positive("O SRC deve ser maior que zero."),
  data_admissao: z.string()
    .refine(isValidIsoDate, "Use uma data válida no formato AAAA-MM-DD.")
    .optional(),
  rentabilidade_anual: z.number().min(0),
  idade_aposentadoria: z.number().int().min(0).max(120).optional(),
  tipo_contribuicao: z.string().trim().min(1).max(50).optional(),
  percentual_escolhido: z.number().min(0).max(100).optional(),
  fator_escolhido: z.number().min(0).optional(),
}).strict().superRefine((input, context) => {
  const today = new Date().toISOString().slice(0, 10)

  if (input.data_adesao > today) {
    context.addIssue({
      code: "custom",
      path: ["data_adesao"],
      message: "A data de adesão não pode estar no futuro.",
    })
  }

  if (input.data_admissao && input.data_admissao > today) {
    context.addIssue({
      code: "custom",
      path: ["data_admissao"],
      message: "A data de admissão não pode estar no futuro.",
    })
  }

  if (
    input.idade_aposentadoria !== undefined
    && input.idade_aposentadoria < input.idade_atual
  ) {
    context.addIssue({
      code: "custom",
      path: ["idade_aposentadoria"],
      message: "A idade de aposentadoria não pode ser menor que a idade atual.",
    })
  }
})

type SimulationPlan = {
  id: string
  codPlano: string
  nome: string
  sigla: string
  unidadeReferencia: ReferenceUnit | null
  configuracoes: ContributionConfiguration[]
  regrasAposentadoria: SimulationRetirementRule[]
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = investmentSimulationSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const sql = getSql()
    const rows = await sql`
      SELECT
        p.id,
        p.cod_plano AS "codPlano",
        p.nome,
        p.sigla,
        CASE
          WHEN ur.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', ur.id,
            'sigla', ur.sigla,
            'valorAtual', ur.valor_atual::float8
          )
        END AS "unidadeReferencia",
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', cc.id,
                'tipo', cc.tipo,
                'modelo', cc.modelo,
                'variavelReferencia', cc.variavel_referencia,
                'numParcelasAnuais', cc.num_parcelas_anuais,
                'proporcaoPatrocinador', cc.proporcao_patrocinador::float8,
                'limiteMaximoPatrocinador', cc.limite_maximo_patrocinador::float8,
                'regras', COALESCE(
                  (
                    SELECT json_agg(
                      json_build_object(
                        'id', rf.id,
                        'ordem', rf.ordem,
                        'limiteInferior', rf.limite_inferior::float8,
                        'limiteSuperior', rf.limite_superior::float8,
                        'minPercentual', rf.min_percentual::float8,
                        'maxPercentual', rf.max_percentual::float8,
                        'percentualFixo', rf.percentual_fixo::float8,
                        'criterioSoma', rf.criterio_soma,
                        'descricao', rf.descricao
                      )
                      ORDER BY rf.ordem
                    )
                    FROM regras_faixas rf
                    WHERE rf.configuracao_id = cc.id
                  ),
                  '[]'::json
                )
              )
              ORDER BY cc.tipo
            )
            FROM configuracoes_contribuicao cc
            WHERE cc.plano_id = p.id AND cc.ativo = TRUE
          ),
          '[]'::json
        ) AS configuracoes,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ra.id,
                'tipo', ra.tipo,
                'idadeMinima', ra.idade_minima,
                'carenciaVinculacaoMeses', ra.carencia_vinculacao_meses
              )
              ORDER BY ra.idade_minima, ra.carencia_vinculacao_meses
            )
            FROM regras_aposentadoria ra
            WHERE ra.plano_id = p.id AND ra.ativo = TRUE
          ),
          '[]'::json
        ) AS "regrasAposentadoria"
      FROM planos p
      LEFT JOIN unidades_referencia ur ON ur.id = p.unidade_referencia_id
      WHERE UPPER(p.cod_plano) = UPPER(${parsed.data.cod_plano})
        AND p.ativo = TRUE
      LIMIT 1
    `
    const plan = rows[0] as SimulationPlan | undefined

    if (!plan) {
      return errorResponse("Plano ativo não encontrado.", 404)
    }

    const matchingConfigurations = parsed.data.tipo_contribuicao
      ? plan.configuracoes.filter(
          (configuration) => configuration.tipo.toLowerCase()
            === parsed.data.tipo_contribuicao?.toLowerCase(),
        )
      : plan.configuracoes

    if (matchingConfigurations.length === 0) {
      return errorResponse(
        parsed.data.tipo_contribuicao
          ? "Configuração ativa não encontrada para o tipo informado."
          : "O plano não possui configuração de contribuição ativa.",
        404,
      )
    }

    if (matchingConfigurations.length > 1) {
      return errorResponse(
        "Este plano possui mais de uma configuração ativa. Informe tipo_contribuicao.",
        400,
        { tiposDisponiveis: matchingConfigurations.map((configuration) => configuration.tipo) },
      )
    }

    const configuration = matchingConfigurations[0]
    const modelValidation = z.enum(contributionModels).safeParse(configuration.modelo)

    if (!modelValidation.success) {
      return errorResponse("A configuração possui um modelo de cálculo inválido.", 422)
    }

    const calculationInput = buildOpenInvestmentCalculationInput(
      {
        idadeAtual: parsed.data.idade_atual,
        dataAdesao: parsed.data.data_adesao,
        dataAdmissao: parsed.data.data_admissao,
        src: parsed.data.src,
        rentabilidadeAnual: parsed.data.rentabilidade_anual,
        idadeAposentadoria: parsed.data.idade_aposentadoria,
        percentualEscolhido: parsed.data.percentual_escolhido,
        fatorEscolhido: parsed.data.fator_escolhido,
      },
      configuration,
      plan.unidadeReferencia,
      plan.regrasAposentadoria,
    )
    const result = await calculateInvestment(calculationInput)

    return Response.json(result)
  } catch (error) {
    if (
      error instanceof CalculationError
      || error instanceof InvestmentSimulationError
      || error instanceof InvestmentApiError
    ) {
      return errorResponse(error.message, error.status, { codigo: error.code })
    }

    console.error("Falha ao simular investimento", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível simular o investimento."
    return errorResponse(message, 500)
  }
}
