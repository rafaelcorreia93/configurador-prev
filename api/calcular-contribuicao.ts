import { z } from "zod"

import {
  CalculationError,
  calculateContribution,
  contributionModels,
  type ContributionConfiguration,
  type ReferenceUnit,
} from "./_lib/calculation.js"
import { DatabaseConfigurationError, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const calculationSchema = z.object({
  codPlano: z.string().trim().min(1, "Informe o código do plano.").max(50),
  src: z.number().min(0, "O SRC não pode ser negativo."),
  tipo: z.string().trim().min(1).max(50).optional(),
  percentualEscolhido: z.number().min(0).max(100).optional(),
  fatorEscolhido: z.number().min(0).optional(),
  idade: z.number().min(0).max(150).optional(),
  tempoServico: z.number().min(0).max(100).optional(),
}).strict()

type PlanCalculationData = {
  id: string
  codPlano: string
  nome: string
  sigla: string
  unidadeReferencia: ReferenceUnit | null
  configuracoes: ContributionConfiguration[]
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = calculationSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const sql = getSql()
    const plans = await sql`
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
            WHERE cc.plano_id = p.id
              AND cc.ativo = TRUE
          ),
          '[]'::json
        ) AS configuracoes
      FROM planos p
      LEFT JOIN unidades_referencia ur ON ur.id = p.unidade_referencia_id
      WHERE UPPER(p.cod_plano) = UPPER(${parsed.data.codPlano})
        AND p.ativo = TRUE
      LIMIT 1
    `

    const plan = plans[0] as PlanCalculationData | undefined

    if (!plan) {
      return errorResponse("Plano ativo não encontrado.", 404)
    }

    const matchingConfigurations = parsed.data.tipo
      ? plan.configuracoes.filter(
          (configuration) => configuration.tipo.toLowerCase() === parsed.data.tipo?.toLowerCase(),
        )
      : plan.configuracoes

    if (matchingConfigurations.length === 0) {
      return errorResponse(
        parsed.data.tipo
          ? "Configuração ativa não encontrada para o tipo informado."
          : "O plano não possui configuração de contribuição ativa.",
        404,
      )
    }

    if (matchingConfigurations.length > 1) {
      return errorResponse(
        "Este plano possui mais de uma configuração ativa. Informe o campo tipo.",
        400,
        { tiposDisponiveis: matchingConfigurations.map((configuration) => configuration.tipo) },
      )
    }

    const configuration = matchingConfigurations[0]
    const modelValidation = z.enum(contributionModels).safeParse(configuration.modelo)

    if (!modelValidation.success) {
      return errorResponse("A configuração possui um modelo de cálculo inválido.", 422)
    }

    const result = calculateContribution(parsed.data, configuration, plan.unidadeReferencia)

    return Response.json({
      status: "success",
      data: {
        plano: {
          id: plan.id,
          codPlano: plan.codPlano,
          nome: plan.nome,
          sigla: plan.sigla,
        },
        configuracao: {
          id: configuration.id,
          tipo: configuration.tipo,
          modelo: configuration.modelo,
          numParcelasAnuais: configuration.numParcelasAnuais,
        },
        entrada: parsed.data,
        ...result,
      },
    })
  } catch (error) {
    if (error instanceof CalculationError) {
      return errorResponse(error.message, error.status, { codigo: error.code })
    }

    console.error("Falha ao calcular contribuição", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível calcular a contribuição."
    return errorResponse(message, 500)
  }
}
