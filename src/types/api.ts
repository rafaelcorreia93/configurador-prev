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
  recebimentoConfigurado: boolean
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

export type TipoAposentadoria = "normal" | "antecipada" | "proporcional"
export type ModalidadeRenda = "percentual_saldo" | "prazo_determinado" | "valor_fixo"
export type PeriodicidadeRecalculo = "mensal" | "anual"

export type RegraAposentadoria = {
  id: string
  tipo: TipoAposentadoria
  idadeMinima: number
  carenciaVinculacaoMeses: number
  exigeTerminoVinculo: boolean
  formulaMinimaCustomizada: string | null
  ativo: boolean
}

export type ModalidadeRendaConfigurada = {
  id: string
  modalidadeTipo: ModalidadeRenda
  percentualRendaMin: number | null
  percentualRendaMax: number | null
  percentualMaxSaldoValorFixo: number | null
  prazoMesesMin: number | null
  prazoMesesMax: number | null
  ativo: boolean
}

export type RegrasRecebimento = {
  planoId: string
  regrasAposentadoria: RegraAposentadoria[]
  configuracaoRenda: {
    permiteSaqueInicial: boolean
    percentualMaxSaque: number | null
    periodicidadeRecalculo: PeriodicidadeRecalculo
    modalidades: ModalidadeRendaConfigurada[]
  }
  limitesPagamento: {
    id?: string
    rendaMensalMinimaUnidade: number | null
    unidadeRendaMinima: string | null
    quitacaoSaldoResidualValor: number | null
    unidadeQuitacaoSaldo: string | null
  }
}

export type RegrasRecebimentoResponse = {
  data: RegrasRecebimento
}

export type CalculoInvestimentoInput = {
  vp?: number
  basicaParticipante: number
  basicaEmpresa: number
  voluntariaParticipante?: number
  voluntariaEmpresa?: number
  r_anual: number
  dataInicio: string
  dataFim: string
  pmt_extra?: number
  freq_extra?: "12 meses"
  considerar_decimo: boolean
}

export type CalculoInvestimentoResponse = {
  success: boolean
  valorFuturoTotal: number
  detalhes: {
    vfAporteInicial: number
    vfBasicaParticipante: number
    vfBasicaEmpresa: number
    vfVoluntariaParticipante: number
    vfVoluntariaEmpresa: number
    vfAportesExtrasOpcionais: number
  }
  totaisAportes: {
    aporteInicial: number
    totalBasicaParticipante: number
    totalBasicaEmpresa: number
    totalVoluntariaParticipante: number
    totalVoluntariaEmpresa: number
    totalAportesExtrasOpcionais: number
    totalAportadoSemRentabilidade: number
  }
  rentabilidade: {
    valorRendimento: number
    percentualSobreAportado: number
  }
  parametrosEntrada: Required<CalculoInvestimentoInput>
  periodosCalculados: {
    anosCompletos: number
    mesesCompletos: number
    decimosAplicados: number
  }
}
