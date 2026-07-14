import { DatabaseConfigurationError, getSql } from "./_lib/database.js"

const EXPECTED_TABLES = [
  "configuracoes_contribuicao",
  "configuracao_renda",
  "limites_pagamento",
  "planos",
  "regras_aposentadoria",
  "regras_faixas",
  "unidades_referencia",
]

export async function GET() {
  try {
    const sql = getSql()
    const rows = await sql`
      SELECT COUNT(*)::int AS available_tables
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${EXPECTED_TABLES})
    `
    const availableTables = Number(rows[0]?.available_tables ?? 0)

    return Response.json({
      status: "ok",
      database: "connected",
      schema: {
        expectedTables: EXPECTED_TABLES.length,
        availableTables,
        ready: availableTables === EXPECTED_TABLES.length,
      },
    })
  } catch (error) {
    console.error("Falha ao consultar o Neon", error)
    const notConfigured = error instanceof DatabaseConfigurationError
    return Response.json(
      {
        status: "error",
        database: notConfigured ? "not_configured" : "unavailable",
        message: notConfigured
          ? "DATABASE_URL não está configurada no ambiente da função."
          : "Não foi possível consultar o banco de dados.",
      },
      { status: notConfigured ? 503 : 500 },
    )
  }
}
