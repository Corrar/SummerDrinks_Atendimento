-- 011_catalogo_dobra.sql — opção de "dobrada" (dose dupla) por item do catálogo.
-- Aditiva e idempotente (IF NOT EXISTS). Sem BEGIN/COMMIT: o runner é dono da tx.
-- `dobravel` liga/desliga a oferta de dobrar a bebida; `preco_dobra` é o adicional
-- fixo cobrado ao dobrar (só vale quando dobravel = true). Sai na borda pública
-- (/menu) como `db` para o app do cliente também oferecer a dobra.
ALTER TABLE catalogo_item ADD COLUMN IF NOT EXISTS dobravel boolean NOT NULL DEFAULT false;
ALTER TABLE catalogo_item ADD COLUMN IF NOT EXISTS preco_dobra numeric(10,2) NOT NULL DEFAULT 0;
