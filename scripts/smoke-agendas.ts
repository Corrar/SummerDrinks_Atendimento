// smoke-agendas.ts — gate da Fase 3 (state machine de agenda + outbox) contra Neon.
// Fluxo: solicitação via app_cliente → GET vê 'solicitado' → valor → agendado →
// confirmado (outbox agendado+confirmado) → 2º evento recusado c/ motivo (outbox
// recusado + motivo_recusa) → transição ilegal confirmado→agendado = 409.
// Re-executável (limpa agendas/outbox de teste por marca). process.exit(1) em falha.
import { pool } from '../src/db/pool.js'
import { env } from '../src/config/env.js'

const BASE = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${env.PORT}`
const SLUG = 'summer'
const MARCA = 'SMOKE-AG' // prefixo de cliente — isola/limpa os dados de teste

const falhas: string[] = []
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    falhas.push(msg)
  }
}

async function esperarServidor(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`)
      if (r.ok) return
    } catch {
      /* subindo */
    }
    await new Promise((res) => setTimeout(res, 500))
  }
  throw new Error(`servidor não respondeu em ${BASE}/health`)
}

async function login(): Promise<string> {
  if (!env.SEED_ADMIN_SENHA) throw new Error('SEED_ADMIN_SENHA ausente no .env')
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: SLUG, usuario: 'admin', senha: env.SEED_ADMIN_SENHA }),
  })
  const b = (await r.json().catch(() => ({}))) as { token?: string }
  if (r.status !== 200 || !b.token) throw new Error(`login falhou: HTTP ${r.status}`)
  return b.token
}

async function tenantId(): Promise<string> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM tenant WHERE slug = $1`, [SLUG])
  const id = r.rows[0]?.id
  if (!id) throw new Error(`tenant '${SLUG}' não existe — rodou o seed?`)
  return id
}

// Re-executável: remove agendas de teste e seus outbox (por protocolo).
async function limpar(tid: string): Promise<void> {
  await pool.query(
    `DELETE FROM outbox WHERE tenant_id = $1
       AND payload->>'protocolo' IN (SELECT protocolo FROM agenda WHERE tenant_id = $1 AND cliente LIKE $2)`,
    [tid, MARCA + '%'],
  )
  await pool.query(`DELETE FROM agenda WHERE tenant_id = $1 AND cliente LIKE $2`, [tid, MARCA + '%'])
}

function amanha(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
}

async function criarEventoPublico(nome: string): Promise<string> {
  const r = await fetch(`${BASE}/public/${SLUG}/eventos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nome,
      telefone: '11999990000',
      email: 'smoke@example.com',
      tipo: 'Aniversário',
      pessoas: 20,
      local: 'Sede',
      obs: 'teste',
      data: amanha(),
      slot: 'Noite',
    }),
  })
  const b = (await r.json().catch(() => ({}))) as { protocolo?: string }
  if (r.status !== 202 || !b.protocolo) throw new Error(`POST /public/eventos falhou: HTTP ${r.status}`)
  return b.protocolo
}

interface AgRow { id: string; status: string; protocolo: string | null }
async function acharPorProtocolo(auth: Record<string, string>, protocolo: string): Promise<AgRow | undefined> {
  const r = await fetch(`${BASE}/agendas`, { headers: auth })
  if (r.status !== 200) throw new Error(`GET /agendas falhou: HTTP ${r.status}`)
  const rows = (await r.json()) as AgRow[]
  return rows.find((x) => x.protocolo === protocolo)
}

async function outboxTipos(tid: string, protocolo: string): Promise<string[]> {
  const r = await pool.query<{ tipo: string }>(
    `SELECT tipo FROM outbox WHERE tenant_id = $1 AND payload->>'protocolo' = $2 ORDER BY id`,
    [tid, protocolo],
  )
  return r.rows.map((x) => x.tipo)
}

async function patchStatus(
  auth: Record<string, string>,
  id: string,
  body: object,
): Promise<{ http: number; status?: string; codigo?: string }> {
  const r = await fetch(`${BASE}/agendas/${id}/status`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) })
  const b = (await r.json().catch(() => ({}))) as { status?: string; codigo?: string }
  return { http: r.status, status: b.status, codigo: b.codigo }
}

async function main(): Promise<void> {
  await esperarServidor()
  const token = await login()
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const tid = await tenantId()
  await limpar(tid)

  // 1) solicitação vinda do app do cliente
  console.log('[1] POST /public/eventos → solicitação')
  const proto1 = await criarEventoPublico(`${MARCA}-1`)
  const ag1 = await acharPorProtocolo(auth, proto1)
  assert(!!ag1, 'GET /agendas vê a solicitação')
  assert(ag1?.status === 'solicitado', `status inicial 'solicitado' (${ag1?.status})`)

  // 2) orçar
  console.log('[2] PATCH /agendas/:id/valor')
  const rv = await fetch(`${BASE}/agendas/${ag1!.id}/valor`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ valor: 150 }),
  })
  assert(rv.status === 200, `PATCH valor → 200 (HTTP ${rv.status})`)

  // 3) solicitado → agendado → confirmado
  console.log('[3] PATCH status: agendado → confirmado')
  const t1 = await patchStatus(auth, ag1!.id, { status: 'agendado' })
  assert(t1.http === 200 && t1.status === 'agendado', `→ agendado 200 (HTTP ${t1.http}, ${t1.status})`)
  const t2 = await patchStatus(auth, ag1!.id, { status: 'confirmado' })
  assert(t2.http === 200 && t2.status === 'confirmado', `→ confirmado 200 (HTTP ${t2.http}, ${t2.status})`)

  // 4) outbox durável: evento:agendado + evento:confirmado
  console.log('[4] outbox durável (agendado + confirmado)')
  const tipos1 = await outboxTipos(tid, proto1)
  assert(tipos1.includes('evento:agendado'), `outbox tem evento:agendado (${tipos1.join(',')})`)
  assert(tipos1.includes('evento:confirmado'), `outbox tem evento:confirmado (${tipos1.join(',')})`)

  // 5) segundo evento → recusado com motivo
  console.log('[5] segundo evento → recusado com motivo')
  const proto2 = await criarEventoPublico(`${MARCA}-2`)
  const ag2 = await acharPorProtocolo(auth, proto2)
  assert(!!ag2, 'GET vê a segunda solicitação')
  const t3 = await patchStatus(auth, ag2!.id, { status: 'recusado', motivo: 'sem data disponível' })
  assert(t3.http === 200 && t3.status === 'recusado', `→ recusado 200 (HTTP ${t3.http}, ${t3.status})`)
  const mr = await pool.query<{ motivo_recusa: string | null }>(
    `SELECT motivo_recusa FROM agenda WHERE tenant_id = $1 AND id = $2`,
    [tid, ag2!.id],
  )
  assert(mr.rows[0]?.motivo_recusa === 'sem data disponível', `motivo_recusa persistido (${mr.rows[0]?.motivo_recusa})`)
  const tipos2 = await outboxTipos(tid, proto2)
  assert(tipos2.includes('evento:recusado'), `outbox tem evento:recusado (${tipos2.join(',')})`)

  // 6) transição ilegal: confirmado → agendado → 409
  console.log('[6] transição ilegal confirmado → agendado → 409')
  const t4 = await patchStatus(auth, ag1!.id, { status: 'agendado' })
  assert(
    t4.http === 409 && t4.codigo === 'TRANSICAO_AGENDA_INVALIDA',
    `confirmado→agendado 409 (HTTP ${t4.http}, ${t4.codigo})`,
  )

  await limpar(tid)

  if (falhas.length > 0) {
    console.error(`\nSMOKE AGENDAS: FALHOU — ${falhas.length} verificação(ões):`)
    for (const f of falhas) console.error(`  - ${f}`)
    await pool.end()
    process.exit(1)
  }
  console.log('\nSMOKE AGENDAS: OK')
  await pool.end()
}

main().catch(async (e: unknown) => {
  console.error('SMOKE AGENDAS: FALHOU —', e instanceof Error ? e.message : e)
  try {
    await pool.end()
  } catch {
    /* noop */
  }
  process.exit(1)
})
