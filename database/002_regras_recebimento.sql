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
        FOREIGN KEY (plano_id)
        REFERENCES planos(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_regra_aposentadoria_plano_tipo UNIQUE (plano_id, tipo),
    CONSTRAINT ck_regra_aposentadoria_idade CHECK (idade_minima BETWEEN 0 AND 120),
    CONSTRAINT ck_regra_aposentadoria_carencia CHECK (carencia_vinculacao_meses >= 0),
    CONSTRAINT ck_regra_aposentadoria_formula CHECK (
        formula_minima_customizada IS NULL OR
        BTRIM(formula_minima_customizada) <> ''
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
    prazo_meses_min INTEGER NULL,
    prazo_meses_max INTEGER NULL,
    periodicidade_recalculo periodicidade_recalculo_enum NOT NULL DEFAULT 'anual',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_configuracao_renda_plano
        FOREIGN KEY (plano_id)
        REFERENCES planos(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_configuracao_renda_plano_modalidade
        UNIQUE (plano_id, modalidade_tipo),
    CONSTRAINT ck_configuracao_renda_saque CHECK (
        (
            permite_saque_inicial = TRUE AND
            percentual_max_saque IS NOT NULL AND
            percentual_max_saque > 0 AND
            percentual_max_saque <= 100
        ) OR (
            permite_saque_inicial = FALSE AND
            (percentual_max_saque IS NULL OR percentual_max_saque = 0)
        )
    ),
    CONSTRAINT ck_configuracao_renda_percentuais CHECK (
        (percentual_renda_min IS NULL AND percentual_renda_max IS NULL) OR
        (
            percentual_renda_min IS NOT NULL AND
            percentual_renda_max IS NOT NULL AND
            percentual_renda_min >= 0 AND
            percentual_renda_max >= percentual_renda_min AND
            percentual_renda_max <= 100
        )
    ),
    CONSTRAINT ck_configuracao_renda_percentual_saldo CHECK (
        modalidade_tipo <> 'percentual_saldo' OR
        (percentual_renda_min IS NOT NULL AND percentual_renda_max IS NOT NULL)
    ),
    CONSTRAINT ck_configuracao_renda_prazos CHECK (
        (prazo_meses_min IS NULL AND prazo_meses_max IS NULL) OR
        (
            prazo_meses_min IS NOT NULL AND
            prazo_meses_max IS NOT NULL AND
            prazo_meses_min > 0 AND
            prazo_meses_max >= prazo_meses_min
        )
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
        FOREIGN KEY (plano_id)
        REFERENCES planos(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT uq_limites_pagamento_plano UNIQUE (plano_id),
    CONSTRAINT ck_limites_pagamento_renda_minima CHECK (
        (
            renda_mensal_minima_unidade IS NULL AND
            unidade_renda_minima IS NULL
        ) OR (
            renda_mensal_minima_unidade IS NOT NULL AND
            unidade_renda_minima IS NOT NULL AND
            renda_mensal_minima_unidade > 0 AND
            BTRIM(unidade_renda_minima) <> ''
        )
    ),
    CONSTRAINT ck_limites_pagamento_quitacao CHECK (
        (
            quitacao_saldo_residual_valor IS NULL AND
            unidade_quitacao_saldo IS NULL
        ) OR (
            quitacao_saldo_residual_valor IS NOT NULL AND
            unidade_quitacao_saldo IS NOT NULL AND
            quitacao_saldo_residual_valor > 0 AND
            BTRIM(unidade_quitacao_saldo) <> ''
        )
    )
);

CREATE INDEX idx_regras_aposentadoria_plano_ativo
    ON regras_aposentadoria (plano_id, ativo);

CREATE INDEX idx_configuracao_renda_plano_ativo
    ON configuracao_renda (plano_id, ativo);

COMMIT;
