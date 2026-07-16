// smoke-outbox.ts — GATE do worker de outbox (Fase 5) contra Postgres REAL.
// Reexecutável no mesmo DB: TRUNCATE outbox limpo antes de cada run e as
// agendas criadas aqui são identificadas por protocolo 'SD-SMKX...' (removidas
// junto). Sai com process.exit(1) em qualquer falha.
//
// Cobre:
//   [1] happy path — 3 outbox → 3 envios distintos (idempotencyKey único).
//   [2] retry — 1 outbox + 2 falhas retriable programadas → entrega na 3ª.
//   [3] agenda ausente — outbox sem agenda correspondente → 'falha'/'agenda_ausente'.
//   [4] concorrência — 10 rows + 2 workers paralelos → 10 envios, 0 duplicata.

import { pool } from '../src/db/pool.js'
import { OutboxWorker } from '../src/notif/OutboxWorker.js'
import { FakeTransport } from '../src/notif/transport.js'

const SLUG = 'summer'
const PROTO_PREFIX = 'SD-SMKX'

const falhas: string[] = []
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    falhas.push(msg)
  }
}

async function tenantId(): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM tenant WHERE slug=$1', [SLUG])
  const id = r.rows[0]?.id
  if (!id) throw new Error(`tenant '${SLUG}' não encontrado; rode npm run seed primeiro`)
  return id
}

async function limparResiduo(tid: string): Promise<void> {
  // Zera TODO outbox 'pendente' do tenant. Seguro porque este smoke roda com
  // o worker do server DESLIGADO (npm run dev não está subindo aqui) — não
  // existe processo legítimo esperando drenar. Isso evita que sobras de smokes
  // anteriores (smoke-agendas enfileira 5 rows e não limpa) contaminem os asserts.
  await pool.query(`DELETE FROM outbox WHERE tenant_id = $1 AND status = 'pendente'`, [tid])
  // Também retira qualquer terminal ('entregue'/'falha') que tenha nascido AQUI,
  // p/ o smoke ser reexecutável sem inflar a tabela.
  await pool.query(
    `DELETE FROM outbox WHERE tenant_id = $1 AND (payload->>'protocolo') LIKE $2`,
    [tid, `${PROTO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM agenda WHERE tenant_id = $1 AND protocolo LIKE $2`, [tid, `${PROTO_PREFIX}%`])
}

async function criarAgenda(tid: string, sufixo: string): Promise<{ id: string; protocolo: string }> {
  const id = `ag-smk-${sufixo}-${Date.now()}`
  const protocolo = `${PROTO_PREFIX}${sufixo.toUpperCase().slice(0, 3)}`
  await pool.query(
    `INSERT INTO agenda (tenant_id, id, cliente, telefone, tipo, data, hora, local, pessoas, valor, obs, status, origem, protocolo)
     VALUES ($1,$2,'Ana Smoke','11999998888','Aniversário', now()::date + 15, '19:00','', 0, 0, '', 'solicitado', 'app_cliente', $3)`,
    [tid, id, protocolo],
  )
  return { id, protocolo }
}

async function enfileirar(tid: string, tipo: string, agendaId: string, protocolo: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO outbox (tenant_id, tipo, payload) VALUES ($1, $2, $3::jsonb) RETURNING id::text`,
    [tid, tipo, JSON.stringify({ id: agendaId, protocolo, status: 'agendado' })],
  )
  return r.rows[0]!.id
}

async function contarStatus(tid: string, ids?: string[]): Promise<Record<string, number>> {
  const r = ids
    ? await pool.query<{ status: string; c: string }>(
        `SELECT status, count(*)::text AS c FROM outbox
          WHERE tenant_id=$1 AND id::text = ANY($2::text[])
          GROUP BY status`,
        [tid, ids],
      )
    : await pool.query<{ status: string; c: string }>(
        `SELECT status, count(*)::text AS c FROM outbox WHERE tenant_id=$1 GROUP BY status`,
        [tid],
      )
  return Object.fromEntries(r.rows.map((x) => [x.status, Number(x.c)]))
}

async function drenarTudo(w: OutboxWorker, maxTicks = 100): Promise<number> {
  let ticks = 0
  for (; ticks < maxTicks; ticks++) {
    const processou = await w.drenarUmaVez()
    if (!processou) break
  }
  return ticks
}

async function main(): Promise<void> {
  const tid = await tenantId()
  await limparResiduo(tid)

  // ------------------------------------------------------------
  console.log('[1] happy path: 3 outbox → 3 envios distintos')
  const { id: ag1, protocolo: p1 } = await criarAgenda(tid, 'happy')
  const oIds = await Promise.all([
    enfileirar(tid, 'evento:recebido',   ag1, p1),
    enfileirar(tid, 'evento:agendado',   ag1, p1),
    enfileirar(tid, 'evento:confirmado', ag1, p1),
  ])
  const fake1 = new FakeTransport()
  const w1 = new OutboxWorker({ transport: fake1, db: pool, logger: silencioso() })
  const ticks = await drenarTudo(w1)
  assert(fake1.enviadas.length === 3, `3 envios (obtido: ${fake1.enviadas.length}, ticks=${ticks})`)
  const chaves = new Set(fake1.enviadas.map((e) => e.idempotencyKey))
  assert(chaves.size === 3, `3 idempotencyKey distintos (obtido: ${chaves.size})`)
  for (const e of fake1.enviadas) {
    assert(e.telefone === '11999998888', `telefone correto`)
  }
  const st1 = await contarStatus(tid, oIds)
  assert(st1.entregue === 3, `todas 'entregue' no DB (${JSON.stringify(st1)})`)
  // PII zero na coluna ultimo_erro
  const uErr = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM outbox WHERE tenant_id=$1 AND id::text = ANY($2::text[]) AND ultimo_erro IS NOT NULL`,
    [tid, oIds],
  )
  assert(uErr.rows[0]!.c === '0', `ultimo_erro=NULL em sucessos`)

  // ------------------------------------------------------------
  console.log('[2] retry: 2 falhas retriable programadas → entrega na 3ª tentativa')
  await limparResiduo(tid)
  const { id: ag2, protocolo: p2 } = await criarAgenda(tid, 'retry')
  const idRet = await enfileirar(tid, 'evento:agendado', ag2, p2)
  const fake2 = new FakeTransport()
  fake2.falharProximas(2, { retriable: true, safeCode: 'http_503' })
  const w2 = new OutboxWorker({ transport: fake2, db: pool, logger: silencioso() })
  // Precisamos "burlar" o backoff para o smoke não esperar 2+4=6s: força proxima_em pra now() após cada tentativa.
  for (let i = 0; i < 3; i++) {
    await pool.query(`UPDATE outbox SET proxima_em = now() - interval '1 second' WHERE id = $1::bigint`, [idRet])
    await w2.drenarUmaVez()
  }
  assert(fake2.enviadas.length === 1, `1 envio real após 2 falhas (obtido: ${fake2.enviadas.length})`)
  const linhaRet = await pool.query<{ status: string; tentativas: number; ultimo_erro: string | null }>(
    `SELECT status, tentativas, ultimo_erro FROM outbox WHERE id=$1::bigint`,
    [idRet],
  )
  const rr = linhaRet.rows[0]!
  assert(rr.status === 'entregue', `status='entregue' (obtido: ${rr.status})`)
  assert(rr.tentativas === 3, `tentativas=3 (obtido: ${rr.tentativas})`)
  assert(rr.ultimo_erro === null, `ultimo_erro limpo após sucesso (obtido: ${rr.ultimo_erro})`)

  // ------------------------------------------------------------
  console.log('[3] agenda ausente → falha "agenda_ausente"')
  await limparResiduo(tid)
  const idOrfao = await enfileirar(tid, 'evento:agendado', 'ag-nao-existe-999', `${PROTO_PREFIX}NOR`)
  const fake3 = new FakeTransport()
  const w3 = new OutboxWorker({ transport: fake3, db: pool, logger: silencioso() })
  await w3.drenarUmaVez()
  assert(fake3.enviadas.length === 0, `0 envios (agenda inexistente)`)
  const linhaOrfa = await pool.query<{ status: string; ultimo_erro: string }>(
    `SELECT status, ultimo_erro FROM outbox WHERE id=$1::bigint`,
    [idOrfao],
  )
  const lo = linhaOrfa.rows[0]!
  assert(lo.status === 'falha', `status='falha' (obtido: ${lo.status})`)
  assert(lo.ultimo_erro === 'agenda_ausente', `ultimo_erro='agenda_ausente' (obtido: ${lo.ultimo_erro})`)

  // ------------------------------------------------------------
  console.log('[4] concorrência: 10 rows + 2 workers paralelos → 0 duplicata')
  await limparResiduo(tid)
  const { id: ag4, protocolo: p4 } = await criarAgenda(tid, 'concur')
  for (let i = 0; i < 10; i++) {
    await enfileirar(tid, 'evento:recebido', ag4, p4)
  }
  const fakeA = new FakeTransport()
  const fakeB = new FakeTransport()
  const wA = new OutboxWorker({ transport: fakeA, db: pool, logger: silencioso() })
  const wB = new OutboxWorker({ transport: fakeB, db: pool, logger: silencioso() })
  // Roda ambos até secar; alternando p/ maximizar competição sem sleeps ociosos.
  let ta = 0, tb = 0
  for (let i = 0; i < 30; i++) {
    const [okA, okB] = await Promise.all([wA.drenarUmaVez(), wB.drenarUmaVez()])
    if (okA) ta++; if (okB) tb++
    if (!okA && !okB) break
  }
  const total = fakeA.enviadas.length + fakeB.enviadas.length
  assert(total === 10, `10 envios totais (A=${fakeA.enviadas.length} B=${fakeB.enviadas.length})`)
  const chaves4 = new Set([...fakeA.enviadas, ...fakeB.enviadas].map((e) => e.idempotencyKey))
  assert(chaves4.size === 10, `10 idempotencyKey distintos (obtido: ${chaves4.size}) — sem duplicata`)
  assert(ta > 0 && tb > 0, `os dois workers processaram (A=${ta}, B=${tb})`)

  // ------------------------------------------------------------
  await limparResiduo(tid)
  await pool.end()

  if (falhas.length) {
    console.error(`\nSMOKE OUTBOX: FALHOU (${falhas.length} asserts)`)
    process.exit(1)
  }
  console.log('\nSMOKE OUTBOX: OK')
}

function silencioso(): { log: () => void; warn: () => void; error: (...a: unknown[]) => void } {
  return { log: () => {}, warn: () => {}, error: (...a) => console.error(...a) }
}

main().catch((e) => {
  console.error('[smoke-outbox] erro fatal:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
