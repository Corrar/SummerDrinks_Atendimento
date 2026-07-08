-- 005_dispo_versao.sql — concorrência otimista na base de disponibilidade.
-- Aditiva e idempotente (IF NOT EXISTS). Sem BEGIN/COMMIT: o runner (migrate.ts) é
-- dono da tx. `version` espelha painel_estado (lost-update guard entre dois gestores
-- editando o MESMO dia). `atualizado_em` para auditoria. Linhas legadas nascem com
-- version=0 (default), coerente com o eco do GET /dispo.
ALTER TABLE disponibilidade ADD COLUMN IF NOT EXISTS version       int         NOT NULL DEFAULT 0;
ALTER TABLE disponibilidade ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();
