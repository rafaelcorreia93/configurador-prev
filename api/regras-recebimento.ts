import { z } from "zod"

import { DatabaseConfigurationError, getPostgresErrorCode, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const retirementTypes = ["normal", "antecipada", "proporcional"] as const
const incomeTypes = ["percentual_saldo", "prazo_determinado", "valor_fixo"] as const
const recalculationPeriods = ["mensal", "anual"] as const

const retirementRuleSchema = z.object({
  tipo: z.enum(retirementTypes),
  idadeMinima: z.number().int().min(0).max(120),
  carenciaVinculacaoMeses: z.number().int().min(0).max(1_440),
  exigeTerminoVinculo: z.boolean(),
  formulaMinimaCustomizada: z.string().trim().min(1).max(2_000).nullable(),
})

const incomeModalitySchema = z.object({
  modalidadeTipo: z.enum(incomeTypes),
  percentualRendaMin: z.number().min(0).max(100).nullable(),
  percentualRendaMax: z.number().min(0).max(100).nullable(),
  prazoMesesMin: z.number().int().positive().nullable(),
  prazoMesesMax: z.number().int().positive().nullable(),
}).superRefine((data, context) => {
  if (data.modalidadeTipo === "percentual_saldo") {
    if (data.percentualRendaMin === null || data.percentualRendaMax === null) {
      context.addIssue({ code: "custom", message: "Informe os percentuais mínimo e máximo.", path: ["percentualRendaMin"] })
    } else if (data.percentualRendaMax < data.percentualRendaMin) {
      context.addIssue({ code: "custom", message: "O percentual máximo deve ser maior ou igual ao mínimo.", path: ["percentualRendaMax"] })
    }
  }

  if (data.modalidadeTipo === "prazo_determinado") {
    if (data.prazoMesesMin === null || data.prazoMesesMax === null) {
      context.addIssue({ code: "custom", message: "Informe os prazos mínimo e máximo.", path: ["prazoMesesMin"] })
    } else if (data.prazoMesesMax < data.prazoMesesMin) {
      context.addIssue({ code: "custom", message: "O prazo máximo deve ser maior ou igual ao mínimo.", path: ["prazoMesesMax"] })
    }
  }
})

const nullableLimitSchema = z.object({
  rendaMensalMinimaUnidade: z.number().positive().nullable(),
  unidadeRendaMinima: z.string().trim().min(1).max(20).nullable(),
  quitacaoSaldoResidualValor: z.number().positive().nullable(),
  unidadeQuitacaoSaldo: z.string().trim().min(1).max(20).nullable(),
}).superRefine((data, context) => {
  validatePair(data.rendaMensalMinimaUnidade, data.unidadeRendaMinima, "renda mensal mínima", "rendaMensalMinimaUnidade", context)
  validatePair(data.quitacaoSaldoResidualValor, data.unidadeQuitacaoSaldo, "quitação do saldo", "quitacaoSaldoResidualValor", context)
})

export const receiptRulesSchema = z.object({
  planoId: z.string().uuid("Plano inválido."),
  regrasAposentadoria: z.array(retirementRuleSchema).min(1).max(3),
  configuracaoRenda: z.object({
    permiteSaqueInicial: z.boolean(),
    percentualMaxSaque: z.number().positive().max(100).nullable(),
    periodicidadeRecalculo: z.enum(recalculationPeriods),
    modalidades: z.array(incomeModalitySchema).min(1).max(3),
  }),
  limitesPagamento: nullableLimitSchema,
}).superRefine((data, context) => {
  const retirementSet = new Set(data.regrasAposentadoria.map((rule) => rule.tipo))
  if (retirementSet.size !== data.regrasAposentadoria.length) {
    context.addIssue({ code: "custom", message: "Não repita tipos de aposentadoria.", path: ["regrasAposentadoria"] })
  }

  const modalitySet = new Set(data.configuracaoRenda.modalidades.map((item) => item.modalidadeTipo))
  if (modalitySet.size !== data.configuracaoRenda.modalidades.length) {
    context.addIssue({ code: "custom", message: "Não repita modalidades de renda.", path: ["configuracaoRenda", "modalidades"] })
  }

  if (data.configuracaoRenda.permiteSaqueInicial && data.configuracaoRenda.percentualMaxSaque === null) {
    context.addIssue({ code: "custom", message: "Informe o percentual máximo do saque.", path: ["configuracaoRenda", "percentualMaxSaque"] })
  }

  if (!data.configuracaoRenda.permiteSaqueInicial && data.configuracaoRenda.percentualMaxSaque !== null) {
    context.addIssue({ code: "custom", message: "Remova o percentual ou habilite o saque inicial.", path: ["configuracaoRenda", "percentualMaxSaque"] })
  }
})

function validatePair(
  value: number | null,
  unit: string | null,
  label: string,
  path: string,
  context: z.RefinementCtx,
) {
  if ((value === null) !== (unit === null)) {
    context.addIssue({ code: "custom", message: `Informe o valor e a unidade para ${label}.`, path: [path] })
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
    const rows = await sql`
      SELECT
        p.id AS "planoId",
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ra.id,
                'tipo', ra.tipo,
                'idadeMinima', ra.idade_minima,
                'carenciaVinculacaoMeses', ra.carencia_vinculacao_meses,
                'exigeTerminoVinculo', ra.exige_termino_vinculo,
                'formulaMinimaCustomizada', ra.formula_minima_customizada,
                'ativo', ra.ativo
              )
              ORDER BY array_position(ARRAY['normal', 'antecipada', 'proporcional']::text[], ra.tipo::text)
            )
            FROM regras_aposentadoria ra
            WHERE ra.plano_id = p.id AND ra.ativo = TRUE
          ),
          '[]'::json
        ) AS "regrasAposentadoria",
        COALESCE(
          (
            SELECT CASE
              WHEN COUNT(*) = 0 THEN NULL
              ELSE json_build_object(
                'permiteSaqueInicial', BOOL_OR(cr.permite_saque_inicial),
                'percentualMaxSaque', MAX(cr.percentual_max_saque)::float8,
                'periodicidadeRecalculo', MIN(cr.periodicidade_recalculo::text),
                'modalidades', json_agg(
                  json_build_object(
                    'id', cr.id,
                    'modalidadeTipo', cr.modalidade_tipo,
                    'percentualRendaMin', cr.percentual_renda_min::float8,
                    'percentualRendaMax', cr.percentual_renda_max::float8,
                    'prazoMesesMin', cr.prazo_meses_min,
                    'prazoMesesMax', cr.prazo_meses_max,
                    'ativo', cr.ativo
                  )
                  ORDER BY array_position(ARRAY['percentual_saldo', 'prazo_determinado', 'valor_fixo']::text[], cr.modalidade_tipo::text)
                )
              )
            END
            FROM configuracao_renda cr
            WHERE cr.plano_id = p.id AND cr.ativo = TRUE
          ),
          json_build_object(
            'permiteSaqueInicial', FALSE,
            'percentualMaxSaque', NULL,
            'periodicidadeRecalculo', 'anual',
            'modalidades', '[]'::json
          )
        ) AS "configuracaoRenda",
        COALESCE(
          (
            SELECT json_build_object(
              'id', lp.id,
              'rendaMensalMinimaUnidade', lp.renda_mensal_minima_unidade::float8,
              'unidadeRendaMinima', CASE
                WHEN lp.renda_mensal_minima_unidade IS NULL THEN NULL
                ELSE ur.sigla
              END,
              'quitacaoSaldoResidualValor', lp.quitacao_saldo_residual_valor::float8,
              'unidadeQuitacaoSaldo', CASE
                WHEN lp.quitacao_saldo_residual_valor IS NULL THEN NULL
                ELSE ur.sigla
              END
            )
            FROM limites_pagamento lp
            WHERE lp.plano_id = p.id
          ),
          json_build_object(
            'rendaMensalMinimaUnidade', NULL,
            'unidadeRendaMinima', NULL,
            'quitacaoSaldoResidualValor', NULL,
            'unidadeQuitacaoSaldo', NULL
          )
        ) AS "limitesPagamento"
      FROM planos p
      LEFT JOIN unidades_referencia ur ON ur.id = p.unidade_referencia_id
      WHERE p.id = ${parsedPlanoId.data}
      LIMIT 1
    `

    if (!rows[0]) {
      return errorResponse("Plano não encontrado.", 404)
    }

    return Response.json({ data: rows[0] })
  } catch (error) {
    console.error("Falha ao carregar regras de recebimento", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível carregar as regras de recebimento."
    return errorResponse(message, 500)
  }
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = receiptRulesSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const retirementRules = parsed.data.regrasAposentadoria.map((rule) => ({
    tipo: rule.tipo,
    idade_minima: rule.idadeMinima,
    carencia_vinculacao_meses: rule.carenciaVinculacaoMeses,
    exige_termino_vinculo: rule.exigeTerminoVinculo,
    formula_minima_customizada: rule.formulaMinimaCustomizada,
  }))
  const incomeSettings = parsed.data.configuracaoRenda.modalidades.map((modality) => ({
    modalidade_tipo: modality.modalidadeTipo,
    permite_saque_inicial: parsed.data.configuracaoRenda.permiteSaqueInicial,
    percentual_max_saque: parsed.data.configuracaoRenda.percentualMaxSaque,
    percentual_renda_min: modality.modalidadeTipo === "percentual_saldo" ? modality.percentualRendaMin : null,
    percentual_renda_max: modality.modalidadeTipo === "percentual_saldo" ? modality.percentualRendaMax : null,
    prazo_meses_min: modality.modalidadeTipo === "prazo_determinado" ? modality.prazoMesesMin : null,
    prazo_meses_max: modality.modalidadeTipo === "prazo_determinado" ? modality.prazoMesesMax : null,
    periodicidade_recalculo: parsed.data.configuracaoRenda.periodicidadeRecalculo,
  }))

  try {
    const sql = getSql()
    const rows = await sql`
      WITH plano AS (
        SELECT p.id, ur.sigla AS unidade_sigla
        FROM planos p
        LEFT JOIN unidades_referencia ur ON ur.id = p.unidade_referencia_id
        WHERE p.id = ${parsed.data.planoId}
      ),
      regras_input AS (
        SELECT *
        FROM jsonb_to_recordset(${JSON.stringify(retirementRules)}::jsonb) AS item(
          tipo TEXT,
          idade_minima SMALLINT,
          carencia_vinculacao_meses INTEGER,
          exige_termino_vinculo BOOLEAN,
          formula_minima_customizada TEXT
        )
      ),
      regras_salvas AS (
        INSERT INTO regras_aposentadoria (
          plano_id, tipo, idade_minima, carencia_vinculacao_meses,
          exige_termino_vinculo, formula_minima_customizada
        )
        SELECT
          plano.id, regras_input.tipo::tipo_aposentadoria_enum,
          regras_input.idade_minima, regras_input.carencia_vinculacao_meses,
          regras_input.exige_termino_vinculo, regras_input.formula_minima_customizada
        FROM plano CROSS JOIN regras_input
        ON CONFLICT (plano_id, tipo) DO UPDATE SET
          idade_minima = EXCLUDED.idade_minima,
          carencia_vinculacao_meses = EXCLUDED.carencia_vinculacao_meses,
          exige_termino_vinculo = EXCLUDED.exige_termino_vinculo,
          formula_minima_customizada = EXCLUDED.formula_minima_customizada,
          ativo = TRUE,
          atualizado_em = NOW()
        RETURNING id
      ),
      regras_desativadas AS (
        UPDATE regras_aposentadoria ra
        SET ativo = FALSE, atualizado_em = NOW()
        FROM plano
        WHERE ra.plano_id = plano.id
          AND NOT EXISTS (SELECT 1 FROM regras_input input WHERE input.tipo = ra.tipo::text)
        RETURNING ra.id
      ),
      rendas_input AS (
        SELECT *
        FROM jsonb_to_recordset(${JSON.stringify(incomeSettings)}::jsonb) AS item(
          modalidade_tipo TEXT,
          permite_saque_inicial BOOLEAN,
          percentual_max_saque NUMERIC,
          percentual_renda_min NUMERIC,
          percentual_renda_max NUMERIC,
          prazo_meses_min INTEGER,
          prazo_meses_max INTEGER,
          periodicidade_recalculo TEXT
        )
      ),
      rendas_salvas AS (
        INSERT INTO configuracao_renda (
          plano_id, permite_saque_inicial, percentual_max_saque, modalidade_tipo,
          percentual_renda_min, percentual_renda_max, prazo_meses_min,
          prazo_meses_max, periodicidade_recalculo
        )
        SELECT
          plano.id, rendas_input.permite_saque_inicial, rendas_input.percentual_max_saque,
          rendas_input.modalidade_tipo::modalidade_renda_enum,
          rendas_input.percentual_renda_min, rendas_input.percentual_renda_max,
          rendas_input.prazo_meses_min, rendas_input.prazo_meses_max,
          rendas_input.periodicidade_recalculo::periodicidade_recalculo_enum
        FROM plano CROSS JOIN rendas_input
        ON CONFLICT (plano_id, modalidade_tipo) DO UPDATE SET
          permite_saque_inicial = EXCLUDED.permite_saque_inicial,
          percentual_max_saque = EXCLUDED.percentual_max_saque,
          percentual_renda_min = EXCLUDED.percentual_renda_min,
          percentual_renda_max = EXCLUDED.percentual_renda_max,
          prazo_meses_min = EXCLUDED.prazo_meses_min,
          prazo_meses_max = EXCLUDED.prazo_meses_max,
          periodicidade_recalculo = EXCLUDED.periodicidade_recalculo,
          ativo = TRUE,
          atualizado_em = NOW()
        RETURNING id
      ),
      rendas_desativadas AS (
        UPDATE configuracao_renda cr
        SET ativo = FALSE, atualizado_em = NOW()
        FROM plano
        WHERE cr.plano_id = plano.id
          AND NOT EXISTS (SELECT 1 FROM rendas_input input WHERE input.modalidade_tipo = cr.modalidade_tipo::text)
        RETURNING cr.id
      ),
      limites_salvos AS (
        INSERT INTO limites_pagamento (
          plano_id, renda_mensal_minima_unidade, unidade_renda_minima,
          quitacao_saldo_residual_valor, unidade_quitacao_saldo
        )
        SELECT
          plano.id,
          ${parsed.data.limitesPagamento.rendaMensalMinimaUnidade},
          CASE
            WHEN ${parsed.data.limitesPagamento.rendaMensalMinimaUnidade}::numeric IS NULL THEN NULL
            ELSE plano.unidade_sigla
          END,
          ${parsed.data.limitesPagamento.quitacaoSaldoResidualValor},
          CASE
            WHEN ${parsed.data.limitesPagamento.quitacaoSaldoResidualValor}::numeric IS NULL THEN NULL
            ELSE plano.unidade_sigla
          END
        FROM plano
        ON CONFLICT (plano_id) DO UPDATE SET
          renda_mensal_minima_unidade = EXCLUDED.renda_mensal_minima_unidade,
          unidade_renda_minima = EXCLUDED.unidade_renda_minima,
          quitacao_saldo_residual_valor = EXCLUDED.quitacao_saldo_residual_valor,
          unidade_quitacao_saldo = EXCLUDED.unidade_quitacao_saldo,
          atualizado_em = NOW()
        RETURNING id
      )
      SELECT
        plano.id AS "planoId",
        (SELECT COUNT(*)::int FROM regras_salvas) AS "regrasSalvas",
        (SELECT COUNT(*)::int FROM rendas_salvas) AS "modalidadesSalvas",
        (SELECT COUNT(*)::int FROM limites_salvos) AS "limitesSalvos"
      FROM plano
    `

    if (!rows[0]) {
      return errorResponse("O plano informado não existe.", 400)
    }

    return Response.json({ data: rows[0] }, { status: 201 })
  } catch (error) {
    console.error("Falha ao salvar regras de recebimento", error)
    const code = getPostgresErrorCode(error)

    if (code === "23503") {
      return errorResponse("O plano informado não existe.", 400)
    }

    if (code === "23514") {
      return errorResponse("Associe uma unidade de referência ao plano antes de configurar os limites de pagamento.", 400)
    }

    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível salvar as regras de recebimento."
    return errorResponse(message, 500)
  }
}
