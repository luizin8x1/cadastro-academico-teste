BEGIN;

-- ==========================================
-- 1. INFORMAÇÕES GERAIS DO PLANO
-- ==========================================

ALTER TABLE plano_estudo

ADD COLUMN IF NOT EXISTS
    resumo_ia TEXT,

ADD COLUMN IF NOT EXISTS
    diagnostico_ia JSONB,

ADD COLUMN IF NOT EXISTS
    distribuicao_ia JSONB,

ADD COLUMN IF NOT EXISTS
    recomendacoes_ia JSONB,

ADD COLUMN IF NOT EXISTS
    modelo_ia VARCHAR(100),

ADD COLUMN IF NOT EXISTS
    versao_esquema_ia INTEGER,

ADD COLUMN IF NOT EXISTS
    tokens_entrada_ia INTEGER,

ADD COLUMN IF NOT EXISTS
    tokens_saida_ia INTEGER;


-- ==========================================
-- 2. INFORMAÇÕES DE CADA SESSÃO
-- ==========================================

ALTER TABLE plano_estudo_item

ADD COLUMN IF NOT EXISTS
    conteudo_ia TEXT,

ADD COLUMN IF NOT EXISTS
    metodologia_detalhada_ia TEXT,

ADD COLUMN IF NOT EXISTS
    atividade_detalhada_ia TEXT,

ADD COLUMN IF NOT EXISTS
    sugestao_questoes_ia JSONB;


COMMIT;