-- 008_config_contato.sql — canais de contato COMERCIAL do tenant na config.
-- Aditiva e idempotente (IF NOT EXISTS). Sem BEGIN/COMMIT: o runner (migrate.ts)
-- é dono da tx. telefone/whatsapp já existiam (001); email/instagram completam os
-- canais que a aba Contato do app do cliente exibe. DECISÃO: contato comercial do
-- tenant é publicado deliberadamente em GET /public/:tenant/config (o cliente
-- precisa dele para falar com o bar) — isso NÃO é PII de cliente, que continua
-- proibida em qualquer rota pública (ver SECURITY-BORDA.md).
ALTER TABLE config ADD COLUMN IF NOT EXISTS email     text NOT NULL DEFAULT '';
ALTER TABLE config ADD COLUMN IF NOT EXISTS instagram text NOT NULL DEFAULT '';

-- CONSENTIMENTO: até esta migration, telefone/whatsapp eram rotulados no painel
-- como "interno da gestão — NUNCA saem na borda pública". Publicá-los sem ação
-- do operador exporia dados cadastrados sob a promessa antiga (ex.: número
-- pessoal do gestor). Zeramos os valores pré-existentes: a gestão recadastra os
-- canais PÚBLICOS conscientemente no painel (agora rotulado "Contato público do
-- bar"). O runner (migrate.ts) aplica cada arquivo exatamente uma vez — este
-- UPDATE não re-executa sobre valores recadastrados.
UPDATE config SET telefone = '', whatsapp = '';
