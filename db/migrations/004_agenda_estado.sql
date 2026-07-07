-- 004_agenda_estado.sql — adiciona o estado 'recusado' à máquina da agenda + motivo.
-- Aditiva e idempotente. Sem BEGIN/COMMIT: o runner (scripts/migrate.ts) é dono da tx.
--
-- O CHECK de status é recriado incluindo 'recusado' (nome real do constraint
-- descoberto via pg_constraint: agenda_status_check). motivo_recusa guarda a
-- justificativa quando status='recusado' (obrigatória na borda, ver agendas.ts).

ALTER TABLE agenda DROP CONSTRAINT IF EXISTS agenda_status_check;
ALTER TABLE agenda ADD CONSTRAINT agenda_status_check
  CHECK (status IN ('solicitado','agendado','confirmado','recusado'));

ALTER TABLE agenda ADD COLUMN IF NOT EXISTS motivo_recusa text;
