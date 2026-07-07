-- 001_init.sql — Summer Drinks · esquema inicial
-- Shapes derivados de data/catalogo.js, data/seed.js e context/SistemaContext.jsx.
-- Multi-tenant. JSONB para tamanhos/items (formato idêntico ao frontend).
-- Sem BEGIN/COMMIT: o runner (scripts/migrate.ts) é dono da transação e
-- aplica+registra cada arquivo atomicamente.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- tenants ----------
CREATE TABLE tenant (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,            -- usado em /public/:tenant
  nome       text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- ---------- catálogo ----------
CREATE TABLE catalogo_item (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  id         text NOT NULL,                   -- 'whe', 'd<timestamp>' — id do frontend
  cat        text NOT NULL,                   -- Especiais|Balada|Aperol|Campari|Batidinhas|Caipirinhas|Doses|Potes|Baldes
  nome       text NOT NULL,
  descricao  text NOT NULL DEFAULT '',        -- 'desc' no front (palavra reservada em SQL)
  tamanhos   jsonb NOT NULL,                  -- [{ "rotulo": text, "preco": number }]
  img        text NOT NULL DEFAULT '',
  ordem      int  NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT tamanhos_array CHECK (jsonb_typeof(tamanhos) = 'array')
);

-- ---------- contador de senha por (tenant, dia) — alocação atômica ----------
CREATE TABLE senha_contador (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  dia        date NOT NULL,
  ultima     int  NOT NULL DEFAULT 44,        -- seed começa em 45 (next)
  PRIMARY KEY (tenant_id, dia)
);

-- ---------- pedidos ----------
CREATE TABLE pedido (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  dia        date NOT NULL,
  senha      int  NOT NULL,
  hora       text NOT NULL,                   -- 'HH:MM' (hora do SERVIDOR)
  pagamento  text NOT NULL CHECK (pagamento IN ('Pix','Dinheiro','Cartão')),
  status     text NOT NULL DEFAULT 'preparo'  CHECK (status IN ('preparo','pronto','entregue')),
  cliente    text NOT NULL DEFAULT '',
  pago       boolean NOT NULL DEFAULT false,
  items      jsonb NOT NULL,                  -- [{ "nome": text, "preco": number, "qty": int }]
  op_key     uuid,                            -- idempotência (X-Idempotency-Key)
  criado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, dia, senha),
  CONSTRAINT items_array CHECK (jsonb_typeof(items) = 'array')
);
-- idempotência: um op_key nunca gera dois pedidos no mesmo tenant
CREATE UNIQUE INDEX pedido_opkey_uk ON pedido (tenant_id, op_key) WHERE op_key IS NOT NULL;

-- ---------- estado do painel (projeção editável: ordenação + chamadas) ----------
CREATE TABLE painel_estado (
  tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  dia            date NOT NULL,
  sort           jsonb NOT NULL DEFAULT '[]', -- ordem das senhas
  ultima_chamada int,
  chamada_hist   jsonb NOT NULL DEFAULT '[]',
  version        int  NOT NULL DEFAULT 0,     -- concorrência otimista
  PRIMARY KEY (tenant_id, dia)
);

-- ---------- agendas / eventos ----------
CREATE TABLE agenda (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  id         text NOT NULL,                   -- 'ag<timestamp>'
  cliente    text NOT NULL,
  telefone   text NOT NULL DEFAULT '',        -- PII: nunca em rota pública
  tipo       text NOT NULL DEFAULT '',
  data       date NOT NULL,
  hora       text NOT NULL DEFAULT '00:00',
  local      text NOT NULL DEFAULT '',
  pessoas    int  NOT NULL DEFAULT 0,
  valor      numeric(12,2) NOT NULL DEFAULT 0,
  obs        text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado','agendado','confirmado')),
  origem     text NOT NULL DEFAULT 'gestao'   CHECK (origem IN ('gestao','app_cliente')),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX agenda_status_ix ON agenda (tenant_id, status, data);

-- ---------- disponibilidade ----------
CREATE TABLE disponibilidade (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  iso        date NOT NULL,
  tarde      boolean NOT NULL DEFAULT true,
  noite      boolean NOT NULL DEFAULT true,
  madrugada  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant_id, iso)
);

-- ---------- config (1 linha por tenant) ----------
CREATE TABLE config (
  tenant_id  uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
  horarios   jsonb NOT NULL,                  -- [{ dia,curto,aberto,abre,fecha }]
  locais     jsonb NOT NULL,                  -- [{ id,nome,endereco,ativo }]
  telefone   text NOT NULL DEFAULT '',
  whatsapp   text NOT NULL DEFAULT ''
);

-- ---------- outbox transacional (notificação ao app do cliente) ----------
CREATE TABLE outbox (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  tipo        text NOT NULL,                  -- 'dispo:updated', 'evento:aceito'...
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','entregue','falha')),
  tentativas  int  NOT NULL DEFAULT 0,
  proxima_em  timestamptz NOT NULL DEFAULT now(),
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pend_ix ON outbox (status, proxima_em) WHERE status = 'pendente';
