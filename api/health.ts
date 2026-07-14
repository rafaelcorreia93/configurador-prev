import { neon } from "@neondatabase/serverless"

const EXPECTED_TABLES = [
  "configuracoes_contribuicao",
  "planos",
  "regras_faixas",
  "unidades_referencia",
]

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return Response.json(
      {
        status: "error",
        database: "not_configured",
        message: "DATABASE_URL não está configurada no ambiente da função.",
      },
      { status: 503 },
    )
  }

  try {
    const sql = neon(databaseUrl)
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
    return Response.json(
      {
        status: "error",
        database: "unavailable",
        message: "Não foi possível consultar o banco de dados.",
      },
      { status: 500 },
    )
  }
}
