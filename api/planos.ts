import { z } from "zod"

import { DatabaseConfigurationError, getPostgresErrorCode, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const planoSchema = z.object({
  codPlano: z
    .string()
    .trim()
    .min(1, "Informe o código do plano.")
    .max(50, "O código deve ter no máximo 50 caracteres.")
    .transform((value) => value.toUpperCase()),
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome do plano.")
    .max(200, "O nome deve ter no máximo 200 caracteres."),
  sigla: z
    .string()
    .trim()
    .min(1, "Informe a sigla do plano.")
    .max(50, "A sigla deve ter no máximo 50 caracteres.")
    .transform((value) => value.toUpperCase()),
  unidadeReferenciaId: z.string().uuid("Selecione uma unidade válida.").nullable().optional(),
})

export async function GET() {
  try {
    const sql = getSql()
    const planos = await sql`
      SELECT
        p.id,
        p.cod_plano AS "codPlano",
        p.nome,
        p.sigla,
        p.ativo,
        p.criado_em AS "criadoEm",
        CASE
          WHEN ur.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', ur.id,
            'sigla', ur.sigla,
            'valorAtual', ur.valor_atual::text
          )
        END AS "unidadeReferencia",
        COUNT(cc.id) FILTER (WHERE cc.ativo)::int AS "configuracoesAtivas"
      FROM planos p
      LEFT JOIN unidades_referencia ur ON ur.id = p.unidade_referencia_id
      LEFT JOIN configuracoes_contribuicao cc ON cc.plano_id = p.id
      GROUP BY p.id, ur.id
      ORDER BY p.nome ASC
    `

    const totalConfiguracoesAtivas = planos.reduce(
      (total, plano) => total + Number(plano.configuracoesAtivas ?? 0),
      0,
    )

    return Response.json({
      data: planos,
      meta: {
        totalPlanos: planos.length,
        totalConfiguracoesAtivas,
      },
    })
  } catch (error) {
    console.error("Falha ao listar planos", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível carregar os planos."
    return errorResponse(message, 500)
  }
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = planoSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const sql = getSql()
    const [plano] = await sql`
      INSERT INTO planos (cod_plano, nome, sigla, unidade_referencia_id)
      VALUES (
        ${parsed.data.codPlano},
        ${parsed.data.nome},
        ${parsed.data.sigla},
        ${parsed.data.unidadeReferenciaId ?? null}
      )
      RETURNING
        id,
        cod_plano AS "codPlano",
        nome,
        sigla,
        ativo,
        criado_em AS "criadoEm"
    `

    return Response.json({ data: plano }, { status: 201 })
  } catch (error) {
    console.error("Falha ao cadastrar plano", error)
    const code = getPostgresErrorCode(error)

    if (code === "23505") {
      return errorResponse("Já existe um plano com esse código.", 409)
    }

    if (code === "23503") {
      return errorResponse("A unidade de referência selecionada não existe.", 400)
    }

    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível cadastrar o plano."
    return errorResponse(message, 500)
  }
}
