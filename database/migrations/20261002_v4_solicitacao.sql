-- Controle de geração dos planos V4
-- Executar inicialmente apenas no banco de testes.

CREATE TABLE IF NOT EXISTS plano_v4_solicitacao (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    objetivo_id BIGINT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,

    status TEXT NOT NULL DEFAULT 'iniciado'
        CHECK (
            status IN ('iniciado', 'respondido', 'salvo')
        ),

    resposta_bruta TEXT,
    modelo TEXT,
    uso JSONB,
    plano_id BIGINT,

    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT plano_v4_solicitacao_unica
        UNIQUE (
            usuario_id,
            objetivo_id,
            data_inicio,
            data_fim
        )
);

CREATE INDEX IF NOT EXISTS
    idx_plano_v4_solicitacao_usuario
ON plano_v4_solicitacao (
    usuario_id,
    criado_em DESC
);