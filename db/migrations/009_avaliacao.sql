-- 009_avaliacao.sql — feedback do cliente sobre o pedido (nota 1-5 + comentário).
-- Aditiva e idempotente (IF NOT EXISTS). Sem BEGIN/COMMIT: o runner (migrate.ts)
-- é dono da tx. Chave = token público do pedido: só quem tem o token opaco (ou
-- seja, quem fez o pedido) pode avaliar, e cada pedido recebe NO MÁXIMO uma
-- avaliação (PK). O comentário chega sanitizado pela borda (semHtml no zod).
-- Sem PII: nota/comentário são conteúdo do cliente, exibidos só no painel
-- autenticado da gestão.
CREATE TABLE IF NOT EXISTS avaliacao (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  token      uuid NOT NULL,                 -- token público do pedido avaliado
  nota       int  NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text NOT NULL DEFAULT '',
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, token)
);

-- Listagem da gestão é por período (criado_em desc).
CREATE INDEX IF NOT EXISTS avaliacao_criado_ix ON avaliacao (tenant_id, criado_em DESC);
