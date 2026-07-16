-- 007_outbox_ultimo_erro.sql — diagnóstico + timestamp de mutação p/ o worker (Fase 5).
-- ADITIVA e idempotente. Sem BEGIN/COMMIT — o runner é dono da transação.
--
-- ultimo_erro guarda APENAS o safeCode do TransportError (nunca a message crua
-- do cliente HTTP, para não vazar PII/segredos como o token do Green API no
-- caminho da URL). Ver SECURITY-BORDA.md e src/notif/transport.ts.
-- atualizado_em: tocado em TODO write do worker (claim/settle/erro) — permite
-- alertar backlog "vivo" vs. estagnado sem depender de audit externo.
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS ultimo_erro   text;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS atualizado_em timestamptz;
