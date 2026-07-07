-- 003_auth.sql — Autenticação de operadores (gestão/PDV/painel).
-- Aditiva e idempotente (IF NOT EXISTS). Não altera shapes existentes.
-- Sem BEGIN/COMMIT: o runner (scripts/migrate.ts) é dono da transação.
--
-- O login é feito com { tenantSlug, usuario, senha }: o slug resolve o tenant,
-- e (tenant_id, login) identifica o operador. A senha é guardada como hash bcrypt
-- (nunca em claro). O JWT emitido carrega o tenant como UUID, não o slug.
-- E-mail NÃO é chave de login (username escopado ao tenant é a chave).
--
-- OBS: o seed de "1 usuário gestao por tenant" é feito por scripts/seed.ts, onde o
-- hash bcrypt é calculado em runtime (não é possível/seguro embutir hash em SQL).

CREATE TABLE IF NOT EXISTS usuario (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  id         text NOT NULL DEFAULT gen_random_uuid()::text,
  login      text NOT NULL,                    -- username escopado ao tenant
  hash       text NOT NULL,                    -- bcrypt (nunca em claro)
  papel      text NOT NULL CHECK (papel IN ('gestao','pdv','painel')),
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  -- login único DENTRO do tenant (o mesmo 'admin' pode existir em tenants diferentes).
  CONSTRAINT usuario_login_uk UNIQUE (tenant_id, login)
);
