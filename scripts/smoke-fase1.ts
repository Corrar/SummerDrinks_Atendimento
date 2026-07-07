// smoke-fase1.ts — GATE da borda de pedido (Fase 1) contra o Neon REAL.
// Sai com process.exit(1) em QUALQUER falha. Reexecutável no mesmo dia (isola antes).
//
// Cobre:
//   a) CONCORRÊNCIA  — 30 POST paralelos, chaves distintas → senhas == {45..74}.
//   b) IDEMPOTÊNCIA  — 1 chave × 10 POST concorrentes → mesma senha, ≤1×201, resto 200.
//   c) BACK-CHANNEL  — login gestão → PATCH /orders/45/status 'pronto' → 200 + status.
import { randomUUID } from 'node:crypto'
import { pool } from '../src/db/pool.js'
import { env } from '../src/config/env.js'

const BASE = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${env.PORT}`
const SLUG = 'summer'

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
      /* servidor ainda subindo */
    }
    await new Promise((res) => setTimeout(res, 500))
  }
  throw new Error(`servidor não respondeu em ${BASE}/health`)
}

async function tenantId(): Promise<string> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM tenant WHERE slug = $1`, [SLUG])
  const id = r.rows[0]?.id
  if (!id) throw new Error(`tenant '${SLUG}' não existe — rodou 'npm run seed'?`)
  return id
}

// Torna o gate re-executável no mesmo dia: zera o estado do dia corrente.
async function isolarDia(tid: string): Promise<void> {
  await pool.query(`DELETE FROM pedido WHERE tenant_id = $1 AND dia = CURRENT_DATE`, [tid])
  await pool.query(`DELETE FROM senha_contador WHERE tenant_id = $1 AND dia = CURRENT_DATE`, [tid])
  await pool.query(`DELETE FROM painel_estado WHERE tenant_id = $1 AND dia = CURRENT_DATE`, [tid])
}

async function itemMenuValido(): Promise<string> {
  const r = await fetch(`${BASE}/public/${SLUG}/menu`)
  if (!r.ok) throw new Error(`GET /public/${SLUG}/menu falhou: HTTP ${r.status}`)
  const itens = (await r.json()) as Array<{ id: string }>
  const id = itens[0]?.id
  if (!id) throw new Error('menu vazio — rodou o seed?')
  return id
}

async function postPedido(itemId: string, opKey: string): Promise<{ http: number; senha: number | null }> {
  const r = await fetch(`${BASE}/public/${SLUG}/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-idempotency-key': opKey },
    body: JSON.stringify({ pagamento: 'pix', pago: false, itens: [{ id: itemId, qty: 1 }] }),
  })
  const body = (await r.json().catch(() => ({}))) as { senha?: number }
  return { http: r.status, senha: typeof body.senha === 'number' ? body.senha : null }
}

async function main(): Promise<void> {
  await esperarServidor()
  const tid = await tenantId()
  await isolarDia(tid)
  const itemId = await itemMenuValido()

  // a) CONCORRÊNCIA — 30 pedidos paralelos, chaves distintas.
  console.log('[a] concorrência: 30 pedidos paralelos, X-Idempotency-Key distinto')
  const respA = await Promise.all(Array.from({ length: 30 }, () => postPedido(itemId, randomUUID())))
  const senhasA = respA.map((x) => x.senha).filter((s): s is number => s != null).sort((p, q) => p - q)
  const setA = new Set(senhasA)
  const esperadas = Array.from({ length: 30 }, (_, i) => 45 + i)
  assert(respA.every((x) => x.http === 201), `todos os 30 responderam 201 (${respA.filter((x) => x.http === 201).length}/30)`)
  assert(senhasA.length === 30, `30 senhas retornadas (obtidas: ${senhasA.length})`)
  assert(setA.size === 30, `sem duplicata (distintas: ${setA.size})`)
  assert(
    esperadas.every((n) => setA.has(n)) && setA.size === 30,
    `senhas == {45..74} sem buraco (faixa obtida: ${senhasA[0]}..${senhasA[senhasA.length - 1]})`,
  )

  // b) IDEMPOTÊNCIA — 1 chave × 10 pedidos concorrentes.
  console.log('[b] idempotência: 1 X-Idempotency-Key × 10 pedidos concorrentes')
  const key = randomUUID()
  const respB = await Promise.all(Array.from({ length: 10 }, () => postPedido(itemId, key)))
  const senhasB = respB.map((x) => x.senha)
  const setB = new Set(senhasB)
  const criados = respB.filter((x) => x.http === 201).length
  const replays = respB.filter((x) => x.http === 200).length
  assert(setB.size === 1 && senhasB[0] != null, `todas a MESMA senha (distintas: ${setB.size}, senha: ${senhasB[0]})`)
  assert(criados <= 1, `no máx 1×201 (obtido: ${criados})`)
  assert(criados + replays === 10, `restante 200 (201=${criados}, 200=${replays}, total=${respB.length})`)

  // c) BACK-CHANNEL — login gestão → PATCH status da senha 45.
  console.log('[c] back-channel: login gestão → PATCH /orders/45/status pronto')
  if (!env.SEED_ADMIN_SENHA) throw new Error('SEED_ADMIN_SENHA ausente no .env')
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: SLUG, usuario: 'admin', senha: env.SEED_ADMIN_SENHA }),
  })
  const loginBody = (await login.json().catch(() => ({}))) as { token?: string }
  assert(login.status === 200 && !!loginBody.token, `login 200 com token (HTTP ${login.status})`)

  const patch = await fetch(`${BASE}/orders/45/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${loginBody.token ?? ''}` },
    body: JSON.stringify({ status: 'pronto' }),
  })
  const patchBody = (await patch.json().catch(() => ({}))) as { status?: string }
  assert(patch.status === 200, `PATCH 200 (HTTP ${patch.status})`)
  assert(patchBody.status === 'pronto', `status == 'pronto' (obtido: ${patchBody.status})`)

  if (falhas.length > 0) {
    console.error(`\nGATE FASE 1: FALHOU — ${falhas.length} verificação(ões):`)
    for (const f of falhas) console.error(`  - ${f}`)
    await pool.end()
    process.exit(1)
  }
  console.log('\nGATE FASE 1: OK')
  await pool.end()
}

main().catch(async (e: unknown) => {
  console.error('GATE FASE 1: FALHOU —', e instanceof Error ? e.message : e)
  try {
    await pool.end()
  } catch {
    /* noop */
  }
  process.exit(1)
})
