-- ==========================================
-- REFERÊNCIAS DA MATRIZ DO ENEM
-- ==========================================

CREATE TABLE IF NOT EXISTS matriz_enem_cache
(
    id BIGSERIAL PRIMARY KEY,

    versao VARCHAR(30) NOT NULL,

    area VARCHAR(100) NOT NULL,

    sintese TEXT NOT NULL,

    fontes JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    tokens_entrada INTEGER,

    tokens_saida INTEGER,

    buscas_realizadas INTEGER,

    consultado_em TIMESTAMPTZ
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT matriz_enem_cache_unica
        UNIQUE (versao, area),

    CONSTRAINT matriz_enem_cache_sintese
        CHECK (
            length(trim(sintese)) > 0
        ),

    CONSTRAINT matriz_enem_cache_fontes
        CHECK (
            jsonb_typeof(fontes) = 'array'
        )
);