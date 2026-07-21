-- 010_config_cardapios_evento.sql — cardápios de evento (open bar) na config.
-- Aditiva e idempotente (IF NOT EXISTS). Sem BEGIN/COMMIT: o runner é dono da tx.
-- São presets internos da gestão (nome + itens) usados no editor de Agenda; NÃO
-- saem na borda pública. Guardados como jsonb na única linha de config do tenant.
ALTER TABLE config ADD COLUMN IF NOT EXISTS cardapios_evento jsonb NOT NULL DEFAULT '[]'::jsonb;
