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

export type ModeloContribuicao =
  | "percentual_livre"
  | "fatias_aditivas"
  | "idade_tempo_servico"
  | "multiplicador_formula"

export type RegraFaixa = {
  id: string
  ordem: number
  limiteInferior: number
  limiteSuperior: number | null
  minPercentual: number | null
  maxPercentual: number | null
  percentualFixo: number | null
  criterioSoma: { variaveis?: string[] } | null
  descricao: string | null
}

export type ConfiguracaoContribuicao = {
  id: string
  planoId: string
  tipo: string
  modelo: ModeloContribuicao
  tipoCalculo: string
  variavelReferencia: string
  numParcelasAnuais: number
  proporcaoPatrocinador: number
  limiteMaximoPatrocinador: number | null
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
  regras: RegraFaixa[]
}

export type ConfiguracoesResponse = {
  data: ConfiguracaoContribuicao[]
}
