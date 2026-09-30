-- =====================================================
-- ROTA DO SUCESSO
-- Plano de Estudos - Periodicidade e PDF
-- Data: 30/09/2026
-- Banco: PostgreSQL / Neon
-- =====================================================


-- =====================================================
-- 1. TIPO DE PLANEJAMENTO
-- =====================================================

ALTER TABLE plano_estudo_objetivo
ADD COLUMN IF NOT EXISTS
    tipo_planejamento VARCHAR(10);


ALTER TABLE plano_estudo
ADD COLUMN IF NOT EXISTS
    tipo_planejamento VARCHAR(10);


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname =
            'chk_plano_objetivo_tipo_planejamento'
    ) THEN

        ALTER TABLE plano_estudo_objetivo

        ADD CONSTRAINT
            chk_plano_objetivo_tipo_planejamento

        CHECK (
            tipo_planejamento IS NULL
            OR tipo_planejamento IN (
                'semanal',
                'mensal'
            )
        );

    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname =
            'chk_plano_estudo_tipo_planejamento'
    ) THEN

        ALTER TABLE plano_estudo

        ADD CONSTRAINT
            chk_plano_estudo_tipo_planejamento

        CHECK (
            tipo_planejamento IS NULL
            OR tipo_planejamento IN (
                'semanal',
                'mensal'
            )
        );

    END IF;

END
$$;


-- =====================================================
-- 2. PDF DOS PLANOS DE ESTUDO
-- =====================================================

CREATE TABLE IF NOT EXISTS plano_estudo_pdf (

    id BIGSERIAL PRIMARY KEY,

    plano_id INTEGER NOT NULL
        REFERENCES plano_estudo(id)
        ON DELETE CASCADE,

    usuario_id INTEGER NOT NULL
        REFERENCES usuario(id)
        ON DELETE CASCADE,

    nome_arquivo VARCHAR(255) NOT NULL,

    mime_type VARCHAR(100)
        NOT NULL
        DEFAULT 'application/pdf',

    arquivo_pdf BYTEA NOT NULL,

    tamanho_bytes INTEGER NOT NULL,

    hash_sha256 VARCHAR(64) NOT NULL,

    versao INTEGER
        NOT NULL
        DEFAULT 1,

    criado_em TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    atualizado_em TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_plano_estudo_pdf_plano
        UNIQUE (plano_id)

);


CREATE INDEX IF NOT EXISTS
    idx_plano_estudo_pdf_usuario

ON plano_estudo_pdf(usuario_id);
