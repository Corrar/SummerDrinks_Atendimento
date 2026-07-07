-- 002_integracao.sql — Camada de integração com o APP DO CLIENTE.
-- Aditiva e idempotente (IF NOT EXISTS). Não altera shapes existentes.
--
-- Objetivo:
--  1. Dar ao pedido um TOKEN público opaco: o app do cliente acompanha o
--     status pela URL /public/:tenant/pedido/:token sem jamais conhecer o
--     esquema de senha nem o tenant_id interno.
--  2. Guardar o e-mail do solicitante de evento (PII — nunca sai em rota pública).
--  3. Registrar a origem/protocolo da solicitação para rastreio ponta-a-ponta.
-- Sem BEGIN/COMMIT: o runner (scripts/migrate.ts) é dono da transação.

-- ---------- token público do pedido (acompanhamento pelo app) ----------
ALTER TABLE pedido
  ADD COLUMN IF NOT EXISTS token uuid,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'pdv'
    CHECK (origem IN ('pdv', 'app_cliente'));

-- Cada token é único por tenant (o app usa /public/:tenant/pedido/:token).
CREATE UNIQUE INDEX IF NOT EXISTS pedido_token_uk
  ON pedido (tenant_id, token) WHERE token IS NOT NULL;

-- ---------- e-mail do evento (PII) + protocolo público ----------
ALTER TABLE agenda
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS protocolo text;

-- Protocolo é o identificador que o cliente vê no comprovante ("SD-...").
CREATE UNIQUE INDEX IF NOT EXISTS agenda_protocolo_uk
  ON agenda (tenant_id, protocolo) WHERE protocolo IS NOT NULL;
