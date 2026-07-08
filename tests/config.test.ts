// Unit tests do configRouter + GET público de config — SEM banco. Mocka pool.query e emit.
// Cobre RBAC (PUT gestão-only), zod strict (horario/local/chave extra), upsert OK (200),
// conflito de versão (409) e a INVARIANTE de PII: /public/:tenant/config nunca devolve
// telefone/whatsapp.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}))
vi.mock('../src/realtime/io.js', () => ({ emitir: vi.fn(), emitirPublico: vi.fn() }))

import { criarApp } from '../src/app.js'
import { pool } from '../src/db/pool.js'
import { emitir } from '../src/realtime/io.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'
const token = (papel: string): string =>
  jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

const bodyOk = {
  horarios: [{ dia: 'sexta', curto: 'Sex', aberto: true, abre: '18:00', fecha: '23:59' }],
  locais: [{ id: 'sede', nome: 'Summer Sede', endereco: '', ativo: true }],
  telefone: '1140028922',
  whatsapp: '11999998888',
  version: 0,
}

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
  vi.mocked(emitir).mockClear()
})

describe('config — RBAC', () => {
  it('GET com papel pdv → 200', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).get('/config').set(bearer('pdv'))
    expect(r.status).toBe(200)
    expect(r.body.version).toBe(0) // sem linha → default v0
  })

  it('PUT com papel painel → 403 RBAC_NEGADO', async () => {
    const r = await request(app).put('/config').set(bearer('painel')).send(bodyOk)
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })
})

describe('config — validação zod', () => {
  it('chave extra no body → 400 (.strict)', async () => {
    const r = await request(app).put('/config').set(bearer('gestao')).send({ ...bodyOk, hack: 1 })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('horario com hora malformada → 400', async () => {
    const bad = { ...bodyOk, horarios: [{ ...bodyOk.horarios[0], abre: '9h' }] }
    const r = await request(app).put('/config').set(bearer('gestao')).send(bad)
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('local com chave extra → 400 (.strict aninhado)', async () => {
    const bad = { ...bodyOk, locais: [{ ...bodyOk.locais[0], geo: 'x' }] }
    const r = await request(app).put('/config').set(bearer('gestao')).send(bad)
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })
})

describe('config — upsert e concorrência', () => {
  it('upsert OK → 200 + emit config:updated SEM PII', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ ...bodyOk, version: 1 }],
      rowCount: 1,
    } as never)
    const r = await request(app).put('/config').set(bearer('gestao')).send(bodyOk)
    expect(r.status).toBe(200)
    expect(r.body.version).toBe(1)
    // emit não pode conter telefone/whatsapp
    const [, evento, payload] = vi.mocked(emitir).mock.calls[0]!
    expect(evento).toBe('config:updated')
    expect(payload).not.toHaveProperty('telefone')
    expect(payload).not.toHaveProperty('whatsapp')
  })

  it('version divergente → 409 CONFLITO_VERSAO, sem emit', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ ...bodyOk, version: 5 }], rowCount: 1 } as never)
    const r = await request(app).put('/config').set(bearer('gestao')).send(bodyOk)
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('CONFLITO_VERSAO')
    expect(vi.mocked(emitir)).not.toHaveBeenCalled()
  })
})

describe('config pública — invariante de PII', () => {
  it('GET /public/:tenant/config devolve só horarios+locais (sem contato)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: TENANT }], rowCount: 1 } as never) // tenantIdPorSlug
      .mockResolvedValueOnce({
        rows: [{ horarios: bodyOk.horarios, locais: bodyOk.locais }],
        rowCount: 1,
      } as never)
    const r = await request(app).get('/public/summer/config')
    expect(r.status).toBe(200)
    expect(r.body).toHaveProperty('horarios')
    expect(r.body).toHaveProperty('locais')
    expect(r.body).not.toHaveProperty('telefone')
    expect(r.body).not.toHaveProperty('whatsapp')
    expect(r.body).not.toHaveProperty('version')
  })
})
