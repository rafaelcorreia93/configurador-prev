import { neon } from "@neondatabase/serverless"

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL não está configurada.")
    this.name = "DatabaseConfigurationError"
  }
}

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new DatabaseConfigurationError()
  }

  return neon(databaseUrl)
}

export function getPostgresErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null
  }

  return String(error.code)
}
