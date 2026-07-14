import { z } from "zod"

import {
  calcularElegibilidade,
  EligibilityError,
  type IncomeOption,
  type PaymentLimits,
  type RetirementRule,
} from "./_lib/eligibility.js"
import { DatabaseConfigurationError, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const eligibilitySchema = z.object({
  planoId: z.string().uuid("Plano inválido."),
  idade: z.number().int().min(0).max(120),
  tempoVinculacaoMeses: z.number().int().min(0),
  vinculoEncerrado: z.boolean(),
  salarioParticipacao: z.number().positive().optional(),
  servicoCreditadoAnos: z.number().min(0).optional(),
  saldoConta: z.number().min(0).optional(),
}).strict()

type EligibilityPlan = {
  id: string
  codPlano: string
  nome: string
  sigla: string
  regrasAposentadoria: RetirementRule[]
  configuracoesRenda: IncomeOption[]
  limitesPagamento: PaymentLimits
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = eligibilitySchema.safeParse(body)

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
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', ra.id,
                'tipo', ra.tipo,
                'idadeMinima', ra.idade_minima,
                'carenciaVinculacaoMeses', ra.carencia_vinculacao_meses,
                'exigeTerminoVinculo', ra.exige_termino_vinculo,
                'formulaMinimaCustomizada', ra.formula_minima_customizada
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
            SELECT json_agg(
              json_build_object(
                'id', cr.id,
                'modalidadeTipo', cr.modalidade_tipo,
                'permiteSaqueInicial', cr.permite_saque_inicial,
                'percentualMaxSaque', cr.percentual_max_saque::float8,
                'percentualRendaMin', cr.percentual_renda_min::float8,
                'percentualRendaMax', cr.percentual_renda_max::float8,
                'percentualMaxSaldoValorFixo', cr.percentual_max_saldo_valor_fixo::float8,
                'prazoMesesMin', cr.prazo_meses_min,
                'prazoMesesMax', cr.prazo_meses_max,
                'periodicidadeRecalculo', cr.periodicidade_recalculo
              )
              ORDER BY array_position(ARRAY['percentual_saldo', 'prazo_determinado', 'valor_fixo']::text[], cr.modalidade_tipo::text)
            )
            FROM configuracao_renda cr
            WHERE cr.plano_id = p.id AND cr.ativo = TRUE
          ),
          '[]'::json
        ) AS "configuracoesRenda",
        COALESCE(
          (
            SELECT json_build_object(
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
      WHERE p.id = ${parsed.data.planoId}
        AND p.ativo = TRUE
      LIMIT 1
    `

    const plan = rows[0] as EligibilityPlan | undefined

    if (!plan) {
      return errorResponse("Plano ativo não encontrado.", 404)
    }

    const result = calcularElegibilidade(
      parsed.data,
      plan.regrasAposentadoria,
      plan.configuracoesRenda,
      plan.limitesPagamento,
    )

    return Response.json({
      status: "success",
      data: {
        plano: {
          id: plan.id,
          codPlano: plan.codPlano,
          nome: plan.nome,
          sigla: plan.sigla,
        },
        participante: parsed.data,
        ...result,
      },
    })
  } catch (error) {
    if (error instanceof EligibilityError) {
      return errorResponse(error.message, error.status, { codigo: error.code })
    }

    console.error("Falha ao calcular elegibilidade", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível calcular a elegibilidade."
    return errorResponse(message, 500)
  }
}
