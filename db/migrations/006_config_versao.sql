-- 006_config_versao.sql — concorrência otimista na config (1 linha por tenant).
-- Aditiva e idempotente (IF NOT EXISTS). Sem BEGIN/COMMIT: o runner (migrate.ts) é
-- dono da tx. Mesmo padrão da 005/painel_estado: dois gestores editando a config do
-- mesmo tenant → lost-update virá 409 CONFLITO_VERSAO. Linhas existentes nascem v0.
ALTER TABLE config ADD COLUMN IF NOT EXISTS version       int         NOT NULL DEFAULT 0;
ALTER TABLE config ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();
