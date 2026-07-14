ALTER TABLE configuracao_renda
    ADD COLUMN percentual_max_saldo_valor_fixo NUMERIC(9, 6) NULL;

UPDATE configuracao_renda
SET
    percentual_max_saldo_valor_fixo = 100,
    atualizado_em = NOW()
WHERE modalidade_tipo = 'valor_fixo'
  AND percentual_max_saldo_valor_fixo IS NULL;

ALTER TABLE configuracao_renda
    ADD CONSTRAINT ck_configuracao_renda_limite_valor_fixo CHECK (
        (
            modalidade_tipo = 'valor_fixo' AND
            percentual_max_saldo_valor_fixo IS NOT NULL AND
            percentual_max_saldo_valor_fixo > 0 AND
            percentual_max_saldo_valor_fixo <= 100
        ) OR (
            modalidade_tipo <> 'valor_fixo' AND
            percentual_max_saldo_valor_fixo IS NULL
        )
    );
