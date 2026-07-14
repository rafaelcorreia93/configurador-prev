export type UnidadeReferencia = {
  id: string
  sigla: string
  valorAtual: string
  criadoEm?: string
  atualizadoEm?: string
}

export type Plano = {
  id: string
  codPlano: string
  nome: string
  sigla: string
  ativo: boolean
  criadoEm: string
  unidadeReferencia: UnidadeReferencia | null
  configuracoesAtivas: number
}

export type PlanosResponse = {
  data: Plano[]
  meta: {
    totalPlanos: number
    totalConfiguracoesAtivas: number
  }
}

export type UnidadesResponse = {
  data: UnidadeReferencia[]
}

export type HealthResponse = {
  status: "ok"
  database: "connected"
  schema: {
    expectedTables: number
    availableTables: number
    ready: boolean
  }
}
