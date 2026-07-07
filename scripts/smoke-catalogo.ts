// smoke-catalogo.ts — smoke rápido do CRUD de catálogo (Fase 2).
// Fluxo: login gestão → POST → GET vê → PUT → GET vê mudança → DELETE → GET não vê
// → DELETE de novo → 404. process.exit(1) em qualquer falha.
import { pool } from '../src/db/pool.js'
import { env } from '../src/config/env.js'

const BASE = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${env.PORT}`
const SLUG = 'summer'
const ITEM_ID = 'zzz-crud-teste' // id de teste — não colide com o seed

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

interface Item {
  id: string
  cat: string
  nome: string
  tamanhos: { rotulo: string; preco: number }[]
  ordem: number
}

async function main(): Promise<void> {
  await esperarServidor()
  const token = await login()
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  // limpeza defensiva (re-executável): remove o item de teste se sobrou de antes.
  await fetch(`${BASE}/catalogo/${ITEM_ID}`, { method: 'DELETE', headers: auth }).catch(() => {})

  const getItens = async (): Promise<Item[]> => {
    const r = await fetch(`${BASE}/catalogo`, { headers: auth })
    if (r.status !== 200) throw new Error(`GET /catalogo: HTTP ${r.status}`)
    return (await r.json()) as Item[]
  }

  // 1) POST
  console.log('[1] POST /catalogo cria o item')
  const post = await fetch(`${BASE}/catalogo`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      id: ITEM_ID,
      cat: 'Doses',
      nome: 'Teste CRUD',
      tamanhos: [
        { rotulo: 'Dose', preco: 10 },
        { rotulo: 'Dobrada', preco: 18 },
      ],
    }),
  })
  assert(post.status === 201, `POST → 201 (HTTP ${post.status})`)

  // 2) GET vê o item
  console.log('[2] GET vê o item recém-criado')
  const apos = (await getItens()).find((i) => i.id === ITEM_ID)
  assert(!!apos, 'GET contém o item')
  assert(apos?.nome === 'Teste CRUD', `nome == 'Teste CRUD' (${apos?.nome})`)
  assert(apos?.tamanhos?.length === 2, `2 tamanhos (${apos?.tamanhos?.length})`)
  assert(apos?.tamanhos?.[0]?.preco === 10, `preco[0] == 10 (${apos?.tamanhos?.[0]?.preco})`)

  // 3) PUT atualiza
  console.log('[3] PUT atualiza o item (last-write-wins)')
  const put = await fetch(`${BASE}/catalogo/${ITEM_ID}`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({
      id: ITEM_ID,
      cat: 'Potes',
      nome: 'Teste CRUD v2',
      tamanhos: [
        { rotulo: 'Dose', preco: 12 },
        { rotulo: 'Dobrada', preco: 20 },
      ],
      ordem: 5,
    }),
  })
  assert(put.status === 200, `PUT → 200 (HTTP ${put.status})`)

  // 4) GET vê a mudança
  console.log('[4] GET reflete a atualização')
  const apos2 = (await getItens()).find((i) => i.id === ITEM_ID)
  assert(apos2?.nome === 'Teste CRUD v2', `nome == 'Teste CRUD v2' (${apos2?.nome})`)
  assert(apos2?.cat === 'Potes', `cat == 'Potes' (${apos2?.cat})`)
  assert(apos2?.tamanhos?.[0]?.preco === 12, `preco[0] == 12 (${apos2?.tamanhos?.[0]?.preco})`)

  // 4b) PUT que ENCOLHE tamanhos (2 → 1) → 409 TAMANHOS_SHRINK (guard append-only)
  console.log('[4b] PUT encolhendo tamanhos → 409 TAMANHOS_SHRINK')
  const shrink = await fetch(`${BASE}/catalogo/${ITEM_ID}`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({
      id: ITEM_ID,
      cat: 'Potes',
      nome: 'Teste CRUD v3',
      tamanhos: [{ rotulo: 'Único', preco: 99 }],
    }),
  })
  const shrinkBody = (await shrink.json().catch(() => ({}))) as { codigo?: string }
  assert(shrink.status === 409, `PUT shrink → 409 (HTTP ${shrink.status})`)
  assert(shrinkBody.codigo === 'TAMANHOS_SHRINK', `codigo == 'TAMANHOS_SHRINK' (${shrinkBody.codigo})`)

  // 4c) item PERMANECE inalterado após o 409 (guard barra antes do UPDATE)
  console.log('[4c] item inalterado após o 409')
  const apos409 = (await getItens()).find((i) => i.id === ITEM_ID)
  assert(apos409?.tamanhos?.length === 2, `ainda 2 tamanhos (${apos409?.tamanhos?.length})`)
  assert(apos409?.nome === 'Teste CRUD v2', `nome ainda 'Teste CRUD v2' (${apos409?.nome})`)
  assert(apos409?.tamanhos?.[0]?.preco === 12, `preco[0] ainda 12 (${apos409?.tamanhos?.[0]?.preco})`)

  // 5) DELETE remove
  console.log('[5] DELETE remove o item')
  const del = await fetch(`${BASE}/catalogo/${ITEM_ID}`, { method: 'DELETE', headers: auth })
  assert(del.status === 200, `DELETE → 200 (HTTP ${del.status})`)

  // 6) GET não vê mais
  console.log('[6] GET não vê mais o item')
  const apos3 = (await getItens()).find((i) => i.id === ITEM_ID)
  assert(!apos3, 'GET não contém o item removido')

  // 7) DELETE de novo → 404
  console.log('[7] DELETE inexistente → 404')
  const del2 = await fetch(`${BASE}/catalogo/${ITEM_ID}`, { method: 'DELETE', headers: auth })
  assert(del2.status === 404, `DELETE inexistente → 404 (HTTP ${del2.status})`)

  if (falhas.length > 0) {
    console.error(`\nSMOKE CATÁLOGO: FALHOU — ${falhas.length} verificação(ões):`)
    for (const f of falhas) console.error(`  - ${f}`)
    await pool.end()
    process.exit(1)
  }
  console.log('\nSMOKE CATÁLOGO: OK')
  await pool.end()
}

main().catch(async (e: unknown) => {
  console.error('SMOKE CATÁLOGO: FALHOU —', e instanceof Error ? e.message : e)
  try {
    await pool.end()
  } catch {
    /* noop */
  }
  process.exit(1)
})
