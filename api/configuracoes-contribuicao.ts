import { z } from "zod"

import { DatabaseConfigurationError, getPostgresErrorCode, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const modelos = [
  "percentual_livre",
  "fatias_aditivas",
  "idade_tempo_servico",
  "multiplicador_formula",
] as const

type Modelo = (typeof modelos)[number]

const tiposCalculo: Record<Modelo, string> = {
  percentual_livre: "por_escolha_na_faixa",
  fatias_aditivas: "por_composicao",
  idade_tempo_servico: "por_condicao_fixa",
  multiplicador_formula: "multiplicador_formula",
}

const regraSchema = z.object({
  limiteInferior: z.number().min(0, "O limite inferior não pode ser negativo."),
  limiteSuperior: z.number().positive("O limite superior deve ser maior que zero.").nullable(),
  minPercentual: z.number().min(0, "O percentual mínimo não pode ser negativo.").nullable(),
  maxPercentual: z.number().min(0, "O percentual máximo não pode ser negativo.").nullable(),
  percentualFixo: z.number().min(0, "O percentual fixo não pode ser negativo.").nullable(),
  descricao: z.string().trim().max(500, "A descrição deve ter no máximo 500 caracteres.").nullable().optional(),
})

const configuracaoSchema = z
  .object({
    planoId: z.string().uuid("Plano inválido."),
    tipo: z.string().trim().min(1, "Informe o tipo da contribuição.").max(50),
    modelo: z.enum(modelos),
    variavelReferencia: z.string().trim().min(1, "Informe a variável de referência.").max(100),
    numParcelasAnuais: z.number().int().min(1).max(24),
    proporcaoPatrocinador: z.number().min(0, "A proporção não pode ser negativa."),
    limiteMaximoPatrocinador: z
      .number()
      .min(0, "O limite não pode ser negativo.")
      .max(100, "O teto não pode ultrapassar 100% do SRC.")
      .nullable(),
    regras: z.array(regraSchema).min(1, "Cadastre ao menos uma faixa.").max(50),
  })
  .superRefine((data, context) => {
    data.regras.forEach((regra, index) => {
      const path = ["regras", index]

      if (regra.limiteSuperior !== null && regra.limiteSuperior <= regra.limiteInferior) {
        context.addIssue({
          code: "custom",
          message: "O limite superior deve ser maior que o limite inferior.",
          path: [...path, "limiteSuperior"],
        })
      }

      if (data.modelo === "percentual_livre") {
        requireRangeValues(regra.minPercentual, regra.maxPercentual, path, context)
        validatePercentage(regra.minPercentual, [...path, "minPercentual"], context)
        validatePercentage(regra.maxPercentual, [...path, "maxPercentual"], context)
      }

      if (data.modelo === "fatias_aditivas" || data.modelo === "idade_tempo_servico") {
        if (regra.percentualFixo === null) {
          context.addIssue({
            code: "custom",
            message: "Informe o percentual fixo.",
            path: [...path, "percentualFixo"],
          })
        } else {
          validatePercentage(regra.percentualFixo, [...path, "percentualFixo"], context)
        }
      }

      if (data.modelo === "multiplicador_formula") {
        requireRangeValues(regra.minPercentual, regra.maxPercentual, path, context)
        if (regra.percentualFixo === null) {
          context.addIssue({
            code: "custom",
            message: "Informe o percentual base.",
            path: [...path, "percentualFixo"],
          })
        } else {
          validatePercentage(regra.percentualFixo, [...path, "percentualFixo"], context)
        }
      }

      const previousRule = data.regras[index - 1]
      if (previousRule) {
        if (previousRule.limiteSuperior === null) {
          context.addIssue({
            code: "custom",
            message: "Uma faixa sem limite superior deve ser a última.",
            path: [...path, "limiteInferior"],
          })
        } else if (regra.limiteInferior < previousRule.limiteSuperior) {
          context.addIssue({
            code: "custom",
            message: "As faixas não podem se sobrepor.",
            path: [...path, "limiteInferior"],
          })
        }
      }
    })
  })

function requireRangeValues(
  minimum: number | null,
  maximum: number | null,
  path: Array<string | number>,
  context: z.RefinementCtx,
) {
  if (minimum === null || maximum === null) {
    context.addIssue({
      code: "custom",
      message: "Informe os valores mínimo e máximo.",
      path,
    })
  } else if (maximum < minimum) {
    context.addIssue({
      code: "custom",
      message: "O valor máximo deve ser maior ou igual ao mínimo.",
      path,
    })
  }
}

function validatePercentage(
  value: number | null,
  path: Array<string | number>,
  context: z.RefinementCtx,
) {
  if (value !== null && value > 100) {
    context.addIssue({
      code: "custom",
      message: "O percentual não pode ultrapassar 100%.",
      path,
    })
  }
}

export async function GET(request: Request) {
  const planoId = new URL(request.url).searchParams.get("planoId")
  const parsedPlanoId = z.string().uuid().safeParse(planoId)

  if (!parsedPlanoId.success) {
    return errorResponse("Informe um plano válido.", 400)
  }

  try {
    const sql = getSql()
    const configuracoes = await sql`
      SELECT
        cc.id,
        cc.plano_id AS "planoId",
        cc.tipo,
        cc.modelo,
        cc.tipo_calculo AS "tipoCalculo",
        cc.variavel_referencia AS "variavelReferencia",
        cc.num_parcelas_anuais AS "numParcelasAnuais",
        cc.proporcao_patrocinador::float8 AS "proporcaoPatrocinador",
        cc.limite_maximo_patrocinador::float8 AS "limiteMaximoPatrocinador",
        cc.ativo,
        cc.criado_em AS "criadoEm",
        cc.atualizado_em AS "atualizadoEm",
        COALESCE(
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
        ) AS regras
      FROM configuracoes_contribuicao cc
      WHERE cc.plano_id = ${parsedPlanoId.data}
      ORDER BY cc.tipo ASC
    `

    return Response.json({ data: configuracoes })
  } catch (error) {
    console.error("Falha ao listar configurações de contribuição", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível carregar as configurações."
    return errorResponse(message, 500)
  }
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = configuracaoSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const tipoCalculo = tiposCalculo[parsed.data.modelo]
  const regras = parsed.data.regras.map((regra, index) => ({
    ordem: index + 1,
    limite_inferior: regra.limiteInferior,
    limite_superior: regra.limiteSuperior,
    min_percentual:
      parsed.data.modelo === "percentual_livre" || parsed.data.modelo === "multiplicador_formula"
        ? regra.minPercentual
        : null,
    max_percentual:
      parsed.data.modelo === "percentual_livre" || parsed.data.modelo === "multiplicador_formula"
        ? regra.maxPercentual
        : null,
    percentual_fixo:
      parsed.data.modelo === "percentual_livre" ? null : regra.percentualFixo,
    criterio_soma:
      parsed.data.modelo === "idade_tempo_servico"
        ? { variaveis: ["idade", "tempo_servico"] }
        : null,
    descricao: regra.descricao || null,
  }))

  try {
    const sql = getSql()
    const [result] = await sql`
      WITH configuracao AS (
        INSERT INTO configuracoes_contribuicao (
          plano_id,
          tipo,
          modelo,
          tipo_calculo,
          variavel_referencia,
          num_parcelas_anuais,
          proporcao_patrocinador,
          limite_maximo_patrocinador
        )
        VALUES (
          ${parsed.data.planoId},
          ${parsed.data.tipo},
          ${parsed.data.modelo},
          ${tipoCalculo},
          ${parsed.data.variavelReferencia},
          ${parsed.data.numParcelasAnuais},
          ${parsed.data.proporcaoPatrocinador},
          ${parsed.data.limiteMaximoPatrocinador}
        )
        ON CONFLICT (plano_id, tipo) DO UPDATE SET
          modelo = EXCLUDED.modelo,
          tipo_calculo = EXCLUDED.tipo_calculo,
          variavel_referencia = EXCLUDED.variavel_referencia,
          num_parcelas_anuais = EXCLUDED.num_parcelas_anuais,
          proporcao_patrocinador = EXCLUDED.proporcao_patrocinador,
          limite_maximo_patrocinador = EXCLUDED.limite_maximo_patrocinador,
          ativo = TRUE,
          atualizado_em = NOW()
        RETURNING id
      ),
      faixas_salvas AS (
        INSERT INTO regras_faixas (
          configuracao_id,
          ordem,
          limite_inferior,
          limite_superior,
          min_percentual,
          max_percentual,
          percentual_fixo,
          criterio_soma,
          descricao
        )
        SELECT
          configuracao.id,
          faixa.ordem,
          faixa.limite_inferior,
          faixa.limite_superior,
          faixa.min_percentual,
          faixa.max_percentual,
          faixa.percentual_fixo,
          faixa.criterio_soma,
          faixa.descricao
        FROM configuracao
        CROSS JOIN jsonb_to_recordset(${JSON.stringify(regras)}::jsonb) AS faixa(
          ordem SMALLINT,
          limite_inferior NUMERIC,
          limite_superior NUMERIC,
          min_percentual NUMERIC,
          max_percentual NUMERIC,
          percentual_fixo NUMERIC,
          criterio_soma JSONB,
          descricao TEXT
        )
        ON CONFLICT (configuracao_id, ordem) DO UPDATE SET
          limite_inferior = EXCLUDED.limite_inferior,
          limite_superior = EXCLUDED.limite_superior,
          min_percentual = EXCLUDED.min_percentual,
          max_percentual = EXCLUDED.max_percentual,
          percentual_fixo = EXCLUDED.percentual_fixo,
          criterio_soma = EXCLUDED.criterio_soma,
          descricao = EXCLUDED.descricao,
          atualizado_em = NOW()
        RETURNING id
      ),
      faixas_removidas AS (
        DELETE FROM regras_faixas
        WHERE configuracao_id = (SELECT id FROM configuracao)
          AND ordem > ${regras.length}
        RETURNING id
      )
      SELECT
        configuracao.id,
        (SELECT COUNT(*)::int FROM faixas_salvas) AS "faixasSalvas"
      FROM configuracao
    `

    return Response.json({ data: result }, { status: 201 })
  } catch (error) {
    console.error("Falha ao salvar configuração de contribuição", error)
    const code = getPostgresErrorCode(error)

    if (code === "23503") {
      return errorResponse("O plano informado não existe.", 400)
    }

    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível salvar a configuração."
    return errorResponse(message, 500)
  }
}
