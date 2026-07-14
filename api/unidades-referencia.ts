import { z } from "zod"

import { DatabaseConfigurationError, getPostgresErrorCode, getSql } from "./_lib/database.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const unidadeSchema = z.object({
  sigla: z
    .string()
    .trim()
    .min(1, "Informe a sigla.")
    .max(20, "A sigla deve ter no máximo 20 caracteres.")
    .transform((value) => value.toUpperCase()),
  valorAtual: z.coerce
    .number({ error: "Informe um valor válido." })
    .positive("O valor deve ser maior que zero."),
})

export async function GET() {
  try {
    const sql = getSql()
    const unidades = await sql`
      SELECT
        id,
        sigla,
        valor_atual::text AS "valorAtual",
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
      FROM unidades_referencia
      ORDER BY sigla ASC
    `

    return Response.json({ data: unidades })
  } catch (error) {
    console.error("Falha ao listar unidades de referência", error)
    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível carregar as unidades de referência."
    return errorResponse(message, 500)
  }
}

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = unidadeSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const sql = getSql()
    const [unidade] = await sql`
      INSERT INTO unidades_referencia (sigla, valor_atual)
      VALUES (${parsed.data.sigla}, ${parsed.data.valorAtual})
      RETURNING
        id,
        sigla,
        valor_atual::text AS "valorAtual",
        criado_em AS "criadoEm",
        atualizado_em AS "atualizadoEm"
    `

    return Response.json({ data: unidade }, { status: 201 })
  } catch (error) {
    console.error("Falha ao cadastrar unidade de referência", error)

    if (getPostgresErrorCode(error) === "23505") {
      return errorResponse("Já existe uma unidade de referência com essa sigla.", 409)
    }

    const message = error instanceof DatabaseConfigurationError
      ? "Banco de dados não configurado."
      : "Não foi possível cadastrar a unidade de referência."
    return errorResponse(message, 500)
  }
}
