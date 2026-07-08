// smoke-config.ts — gate do configRouter contra Neon. Fluxo: GET /config lê a config
// do seed (com version) → PUT com version correta bump v+1 → PUT com version velha = 409
// → GET público /public/:tenant/config devolve horarios+locais SEM telefone/whatsapp
// (invariante de PII) → restaura a config original. Re-executável. process.exit(1) em falha.
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

interface ConfigResp {
  horarios: unknown[]
  locais: unknown[]
  telefone: string
  whatsapp: string
  version: number
}

async function getConfig(auth: Record<string, string>): Promise<ConfigResp> {
  const r = await fetch(`${BASE}/config`, { headers: auth })
  if (r.status !== 200) throw new Error(`GET /config falhou: HTTP ${r.status}`)
  return (await r.json()) as ConfigResp
}

async function putConfig(
  auth: Record<string, string>,
  body: object,
): Promise<{ http: number; codigo?: string; version?: number }> {
  const r = await fetch(`${BASE}/config`, { method: 'PUT', headers: auth, body: JSON.stringify(body) })
  const b = (await r.json().catch(() => ({}))) as { codigo?: string; version?: number }
  return { http: r.status, codigo: b.codigo, version: b.version }
}

async function getPublicoConfig(): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASE}/public/${SLUG}/config`)
  if (r.status !== 200) throw new Error(`GET público /config falhou: HTTP ${r.status}`)
  return (await r.json()) as Record<string, unknown>
}

async function main(): Promise<void> {
  await esperarServidor()
  const token = await login()
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  // 1) estado inicial (config do seed)
  console.log('[1] GET /config')
  const inicial = await getConfig(auth)
  assert(Array.isArray(inicial.horarios), 'horarios é array')
  const v0 = inicial.version
  const original = {
    horarios: inicial.horarios,
    locais: inicial.locais,
    telefone: inicial.telefone,
    whatsapp: inicial.whatsapp,
  }

  // 2) PUT com version correta → v+1
  console.log('[2] PUT /config version correta → bump')
  const novo = { ...original, telefone: '1140028922', whatsapp: '11999998888', version: v0 }
  const p1 = await putConfig(auth, novo)
  assert(p1.http === 200 && p1.version === v0 + 1, `PUT → 200 v${v0 + 1} (HTTP ${p1.http} v${p1.version})`)

  // 3) PUT com version velha → 409
  console.log('[3] PUT /config version velha → 409')
  const pConf = await putConfig(auth, { ...novo, version: v0 })
  assert(pConf.http === 409 && pConf.codigo === 'CONFLITO_VERSAO', `409 CONFLITO_VERSAO (HTTP ${pConf.http} ${pConf.codigo})`)

  // 4) INVARIANTE PII: público não devolve contato
  console.log('[4] GET público /config — sem PII')
  const pub = await getPublicoConfig()
  assert('horarios' in pub && 'locais' in pub, 'público tem horarios+locais')
  assert(!('telefone' in pub), 'público NÃO tem telefone')
  assert(!('whatsapp' in pub), 'público NÃO tem whatsapp')
  assert(!('version' in pub), 'público NÃO tem version')

  // 5) restaura a config original (bumpando a version atual)
  console.log('[5] restaura config original')
  const atual = await getConfig(auth)
  const rest = await putConfig(auth, { ...original, version: atual.version })
  assert(rest.http === 200, `restaurada (HTTP ${rest.http})`)

  if (falhas.length) {
    console.error(`\n✗ SMOKE CONFIG: ${falhas.length} falha(s)`)
    process.exit(1)
  }
  console.log('\n✓ SMOKE CONFIG: tudo verde')
}

main()
  .catch((e) => {
    console.error('erro fatal no smoke-config:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => void pool.end())
