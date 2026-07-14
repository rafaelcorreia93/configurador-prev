BEGIN;

CREATE TYPE tipo_aposentadoria_enum AS ENUM (
    'normal',
    'antecipada',
    'proporcional'
);

CREATE TYPE modalidade_renda_enum AS ENUM (
    'percentual_saldo',
    'prazo_determinado',
    'valor_fixo'
);

CREATE TYPE periodicidade_recalculo_enum AS ENUM (
    'mensal',
    'anual'
);

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

CREATE TABLE regras_aposentadoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id UUID NOT NULL,
    tipo tipo_aposentadoria_enum NOT NULL,
    idade_minima SMALLINT NOT NULL,
    carencia_vinculacao_meses INTEGER NOT NULL,
    exige_termino_vinculo BOOLEAN NOT NULL DEFAULT TRUE,
    formula_minima_customizada TEXT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_regra_aposentadoria_plano
        FOREIGN KEY (plano_id) REFERENCES planos(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT uq_regra_aposentadoria_plano_tipo UNIQUE (plano_id, tipo),
    CONSTRAINT ck_regra_aposentadoria_idade CHECK (idade_minima BETWEEN 0 AND 120),
    CONSTRAINT ck_regra_aposentadoria_carencia CHECK (carencia_vinculacao_meses >= 0),
    CONSTRAINT ck_regra_aposentadoria_formula CHECK (
        formula_minima_customizada IS NULL OR BTRIM(formula_minima_customizada) <> ''
    )
);

CREATE TABLE configuracao_renda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id UUID NOT NULL,
    permite_saque_inicial BOOLEAN NOT NULL DEFAULT FALSE,
    percentual_max_saque NUMERIC(7, 4) NULL,
    modalidade_tipo modalidade_renda_enum NOT NULL,
    percentual_renda_min NUMERIC(9, 6) NULL,
    percentual_renda_max NUMERIC(9, 6) NULL,
    percentual_max_saldo_valor_fixo NUMERIC(9, 6) NULL,
    prazo_meses_min INTEGER NULL,
    prazo_meses_max INTEGER NULL,
    periodicidade_recalculo periodicidade_recalculo_enum NOT NULL DEFAULT 'anual',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_configuracao_renda_plano
        FOREIGN KEY (plano_id) REFERENCES planos(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT uq_configuracao_renda_plano_modalidade UNIQUE (plano_id, modalidade_tipo),
    CONSTRAINT ck_configuracao_renda_saque CHECK (
        (permite_saque_inicial = TRUE AND percentual_max_saque IS NOT NULL AND percentual_max_saque > 0 AND percentual_max_saque <= 100) OR
        (permite_saque_inicial = FALSE AND (percentual_max_saque IS NULL OR percentual_max_saque = 0))
    ),
    CONSTRAINT ck_configuracao_renda_percentuais CHECK (
        (percentual_renda_min IS NULL AND percentual_renda_max IS NULL) OR
        (percentual_renda_min IS NOT NULL AND percentual_renda_max IS NOT NULL AND percentual_renda_min >= 0 AND percentual_renda_max >= percentual_renda_min AND percentual_renda_max <= 100)
    ),
    CONSTRAINT ck_configuracao_renda_percentual_saldo CHECK (
        modalidade_tipo <> 'percentual_saldo' OR
        (percentual_renda_min IS NOT NULL AND percentual_renda_max IS NOT NULL)
    ),
    CONSTRAINT ck_configuracao_renda_limite_valor_fixo CHECK (
        (
            modalidade_tipo = 'valor_fixo' AND
            percentual_max_saldo_valor_fixo IS NOT NULL AND
            percentual_max_saldo_valor_fixo > 0 AND
            percentual_max_saldo_valor_fixo <= 100
        ) OR (
            modalidade_tipo <> 'valor_fixo' AND
            percentual_max_saldo_valor_fixo IS NULL
        )
    ),
    CONSTRAINT ck_configuracao_renda_prazos CHECK (
        (prazo_meses_min IS NULL AND prazo_meses_max IS NULL) OR
        (prazo_meses_min IS NOT NULL AND prazo_meses_max IS NOT NULL AND prazo_meses_min > 0 AND prazo_meses_max >= prazo_meses_min)
    ),
    CONSTRAINT ck_configuracao_renda_prazo_determinado CHECK (
        modalidade_tipo <> 'prazo_determinado' OR
        (prazo_meses_min IS NOT NULL AND prazo_meses_max IS NOT NULL)
    )
);

CREATE TABLE limites_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id UUID NOT NULL,
    renda_mensal_minima_unidade NUMERIC(18, 6) NULL,
    unidade_renda_minima VARCHAR(20) NULL,
    quitacao_saldo_residual_valor NUMERIC(18, 6) NULL,
    unidade_quitacao_saldo VARCHAR(20) NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_limites_pagamento_plano
        FOREIGN KEY (plano_id) REFERENCES planos(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT uq_limites_pagamento_plano UNIQUE (plano_id),
    CONSTRAINT ck_limites_pagamento_renda_minima CHECK (
        (renda_mensal_minima_unidade IS NULL AND unidade_renda_minima IS NULL) OR
        (renda_mensal_minima_unidade IS NOT NULL AND unidade_renda_minima IS NOT NULL AND renda_mensal_minima_unidade > 0 AND BTRIM(unidade_renda_minima) <> '')
    ),
    CONSTRAINT ck_limites_pagamento_quitacao CHECK (
        (quitacao_saldo_residual_valor IS NULL AND unidade_quitacao_saldo IS NULL) OR
        (quitacao_saldo_residual_valor IS NOT NULL AND unidade_quitacao_saldo IS NOT NULL AND quitacao_saldo_residual_valor > 0 AND BTRIM(unidade_quitacao_saldo) <> '')
    )
);

CREATE INDEX idx_regras_aposentadoria_plano_ativo
    ON regras_aposentadoria (plano_id, ativo);

CREATE INDEX idx_configuracao_renda_plano_ativo
    ON configuracao_renda (plano_id, ativo);

COMMIT;
