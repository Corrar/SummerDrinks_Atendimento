// smoke-dispo.ts — gate da Fase 4 (base de disponibilidade + merge de ocupação) contra Neon.
// Fluxo: PUT /dispo cria a base (v1) → GET /dispo ecoa version → PUT com version velha = 409
// → agenda 'Noite' (19:00) confirmada ocupa o slot → GET /public/:tenant/disponibilidade
// mostra noite=false naquele dia → recusar libera. Re-executável (limpa por marca/dia).
// process.exit(1) em falha.
import { pool } from '../src/db/pool.js'
import { env } from '../src/config/env.js'

const BASE = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${env.PORT}`
const SLUG = 'summer'
const MARCA = 'SMOKE-DISPO'

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

// Dia isolado bem no futuro para não colidir com dados reais.
function diaFuturo(): string {
  return new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10)
}
const DIA = diaFuturo()
const MES = DIA.slice(0, 7)

async function limpar(tid: string): Promise<void> {
  await pool.query(`DELETE FROM outbox WHERE tenant_id = $1 AND payload->>'protocolo' IN
      (SELECT protocolo FROM agenda WHERE tenant_id = $1 AND cliente LIKE $2)`, [tid, MARCA + '%'])
  await pool.query(`DELETE FROM agenda WHERE tenant_id = $1 AND cliente LIKE $2`, [tid, MARCA + '%'])
  await pool.query(`DELETE FROM disponibilidade WHERE tenant_id = $1 AND iso = $2`, [tid, DIA])
}

interface DispoDia { iso: string; tarde: boolean; noite: boolean; madrugada: boolean; version: number }
interface DispoResp { mes: string; dias: DispoDia[] }
interface PubResp { mes: string; dias: Record<string, { tarde: boolean; noite: boolean; madrugada: boolean }> }
interface AgRow { id: string; status: string; protocolo: string | null }

async function putDispo(
  auth: Record<string, string>,
  body: object,
): Promise<{ http: number; codigo?: string; version?: number }> {
  const r = await fetch(`${BASE}/dispo/${DIA}`, { method: 'PUT', headers: auth, body: JSON.stringify(body) })
  const b = (await r.json().catch(() => ({}))) as { codigo?: string; version?: number }
  return { http: r.status, codigo: b.codigo, version: b.version }
}

async function getDispo(auth: Record<string, string>): Promise<DispoDia | undefined> {
  const r = await fetch(`${BASE}/dispo?mes=${MES}`, { headers: auth })
  const b = (await r.json()) as DispoResp
  return b.dias.find((d) => d.iso === DIA)
}

async function getPublico(): Promise<{ tarde: boolean; noite: boolean; madrugada: boolean } | undefined> {
  const r = await fetch(`${BASE}/public/${SLUG}/disponibilidade?mes=${MES}`)
  const b = (await r.json()) as PubResp
  return b.dias[DIA]
}

async function criarEventoNoite(auth: Record<string, string>): Promise<AgRow> {
  const rc = await fetch(`${BASE}/agendas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      nome: `${MARCA}-ocup`, telefone: '11999990000', email: 's@e.com',
      tipo: 'Evento', pessoas: 10, local: 'Sede', obs: '', data: DIA, slot: 'Noite',
    }),
  })
  if (rc.status !== 201) throw new Error(`POST /agendas falhou: HTTP ${rc.status}`)
  return (await rc.json()) as AgRow
}

async function patchStatus(auth: Record<string, string>, id: string, body: object): Promise<number> {
  const r = await fetch(`${BASE}/agendas/${id}/status`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) })
  return r.status
}

async function main(): Promise<void> {
  await esperarServidor()
  const token = await login()
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const tid = await tenantId()
  await limpar(tid)

  // 1) cria base do dia (row ausente → INSERT v1)
  console.log('[1] PUT /dispo cria base')
  const p1 = await putDispo(auth, { tarde: true, noite: true, madrugada: true, version: 0 })
  assert(p1.http === 200 && p1.version === 1, `PUT cria base → 200 v1 (HTTP ${p1.http} v${p1.version})`)

  // 2) GET ecoa version
  console.log('[2] GET /dispo ecoa version')
  const g1 = await getDispo(auth)
  assert(g1?.version === 1, `GET version=1 (${g1?.version})`)

  // 3) version desatualizada → 409
  console.log('[3] PUT com version velha → 409')
  const pConf = await putDispo(auth, { tarde: false, noite: true, madrugada: true, version: 0 })
  assert(pConf.http === 409 && pConf.codigo === 'CONFLITO_VERSAO', `409 CONFLITO_VERSAO (HTTP ${pConf.http} ${pConf.codigo})`)

  // 4) version correta → v2
  console.log('[4] PUT com version correta → v2')
  const p2 = await putDispo(auth, { tarde: true, noite: true, madrugada: true, version: 1 })
  assert(p2.http === 200 && p2.version === 2, `v2 (HTTP ${p2.http} v${p2.version})`)

  // 5) público antes de ocupar: noite=true
  console.log('[5] GET público: noite livre')
  const pub0 = await getPublico()
  assert(pub0?.noite === true, `noite=true antes de ocupar (${pub0?.noite})`)

  // 6) agenda Noite (19:00) → agendado ocupa o slot ('agendado' já ocupa)
  console.log('[6] agenda Noite agendada ocupa o slot')
  const ag = await criarEventoNoite(auth)
  assert((await patchStatus(auth, ag.id, { status: 'agendado' })) === 200, 'agendado → 200')
  const pub1 = await getPublico()
  assert(pub1?.noite === false, `noite=false após agendar (${pub1?.noite})`)
  assert(pub1?.tarde === true, `tarde permanece true (${pub1?.tarde})`)

  // 7) recusar (a partir de 'agendado', transição válida) libera o slot
  console.log('[7] recusar libera o slot')
  assert((await patchStatus(auth, ag.id, { status: 'recusado', motivo: 'smoke' })) === 200, 'recusado → 200')
  const pub2 = await getPublico()
  assert(pub2?.noite === true, `noite=true após recusar (${pub2?.noite})`)

  await limpar(tid)

  if (falhas.length) {
    console.error(`\n✗ SMOKE DISPO: ${falhas.length} falha(s)`)
    process.exit(1)
  }
  console.log('\n✓ SMOKE DISPO: tudo verde')
}

main()
  .catch((e) => {
    console.error('erro fatal no smoke-dispo:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => void pool.end())
