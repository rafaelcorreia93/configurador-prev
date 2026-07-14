BEGIN;

CREATE TABLE unidades_referencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sigla VARCHAR(20) NOT NULL UNIQUE,
    valor_atual NUMERIC(18, 6) NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_unidade_sigla_nao_vazia CHECK (BTRIM(sigla) <> ''),
    CONSTRAINT ck_unidade_valor_positivo CHECK (valor_atual > 0)
);

CREATE TABLE planos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cod_plano VARCHAR(50) NOT NULL UNIQUE,
    nome VARCHAR(200) NOT NULL,
    sigla VARCHAR(50) NOT NULL,
    unidade_referencia_id UUID NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_planos_unidade_referencia
        FOREIGN KEY (unidade_referencia_id)
        REFERENCES unidades_referencia(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_plano_codigo_nao_vazio CHECK (BTRIM(cod_plano) <> ''),
    CONSTRAINT ck_plano_nome_nao_vazio CHECK (BTRIM(nome) <> ''),
    CONSTRAINT ck_plano_sigla_nao_vazia CHECK (BTRIM(sigla) <> '')
);

CREATE TABLE configuracoes_contribuicao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id UUID NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    modelo VARCHAR(50) NOT NULL,
    tipo_calculo VARCHAR(50) NOT NULL,
    variavel_referencia VARCHAR(100) NOT NULL,
    num_parcelas_anuais SMALLINT NOT NULL DEFAULT 12,
    proporcao_patrocinador NUMERIC(12, 6) NOT NULL DEFAULT 0,
    limite_maximo_patrocinador NUMERIC(12, 6) NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_configuracao_plano
        FOREIGN KEY (plano_id)
        REFERENCES planos(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_configuracao_plano_tipo UNIQUE (plano_id, tipo),
    CONSTRAINT ck_configuracao_tipo_nao_vazio CHECK (BTRIM(tipo) <> ''),
    CONSTRAINT ck_configuracao_variavel_nao_vazia CHECK (BTRIM(variavel_referencia) <> ''),
    CONSTRAINT ck_configuracao_modelo CHECK (
        modelo IN (
            'percentual_livre',
            'fatias_aditivas',
            'idade_tempo_servico',
            'multiplicador_formula'
        )
    ),
    CONSTRAINT ck_configuracao_tipo_calculo CHECK (
        tipo_calculo IN (
            'por_escolha_na_faixa',
            'por_composicao',
            'por_condicao_fixa',
            'multiplicador_formula'
        )
    ),
    CONSTRAINT ck_configuracao_modelo_calculo CHECK (
        (modelo = 'percentual_livre' AND tipo_calculo = 'por_escolha_na_faixa') OR
        (modelo = 'fatias_aditivas' AND tipo_calculo = 'por_composicao') OR
        (modelo = 'idade_tempo_servico' AND tipo_calculo = 'por_condicao_fixa') OR
        (modelo = 'multiplicador_formula' AND tipo_calculo = 'multiplicador_formula')
    ),
    CONSTRAINT ck_configuracao_parcelas CHECK (num_parcelas_anuais BETWEEN 1 AND 24),
    CONSTRAINT ck_configuracao_proporcao CHECK (proporcao_patrocinador >= 0),
    CONSTRAINT ck_configuracao_limite_patrocinador CHECK (
        limite_maximo_patrocinador IS NULL OR limite_maximo_patrocinador >= 0
    )
);

CREATE TABLE regras_faixas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuracao_id UUID NOT NULL,
    ordem SMALLINT NOT NULL,
    limite_inferior NUMERIC(18, 6) NOT NULL DEFAULT 0,
    limite_superior NUMERIC(18, 6) NULL,
    min_percentual NUMERIC(12, 6) NULL,
    max_percentual NUMERIC(12, 6) NULL,
    percentual_fixo NUMERIC(12, 6) NULL,
    criterio_soma JSONB NULL,
    descricao TEXT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_regra_configuracao
        FOREIGN KEY (configuracao_id)
        REFERENCES configuracoes_contribuicao(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_regra_configuracao_ordem UNIQUE (configuracao_id, ordem),
    CONSTRAINT ck_regra_ordem CHECK (ordem > 0),
    CONSTRAINT ck_regra_limites CHECK (
        limite_inferior >= 0 AND
        (limite_superior IS NULL OR limite_superior > limite_inferior)
    ),
    CONSTRAINT ck_regra_percentual_minimo CHECK (
        min_percentual IS NULL OR min_percentual >= 0
    ),
    CONSTRAINT ck_regra_percentual_maximo CHECK (
        max_percentual IS NULL OR max_percentual >= 0
    ),
    CONSTRAINT ck_regra_percentual_fixo CHECK (
        percentual_fixo IS NULL OR percentual_fixo >= 0
    ),
    CONSTRAINT ck_regra_intervalo_percentual CHECK (
        min_percentual IS NULL OR
        max_percentual IS NULL OR
        max_percentual >= min_percentual
    ),
    CONSTRAINT ck_regra_criterio_soma CHECK (
        criterio_soma IS NULL OR jsonb_typeof(criterio_soma) = 'object'
    )
);

CREATE INDEX idx_planos_unidade_referencia
    ON planos (unidade_referencia_id);

CREATE INDEX idx_configuracoes_plano_ativo
    ON configuracoes_contribuicao (plano_id, ativo);

CREATE INDEX idx_regras_configuracao_limites
    ON regras_faixas (configuracao_id, limite_inferior, limite_superior);

COMMIT;
