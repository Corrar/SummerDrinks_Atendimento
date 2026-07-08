// Unit tests do agendasRouter — SEM banco. Mocka pool.query (listar) e withTransaction
// (orcar/transicionar rodam o callback com um tx mockado). Cobre RBAC, zod, a máquina
// de estados (TRANSICOES_AGENDA) e o outbox transacional condicionado à origem.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}))
// Colaboradores do emit 'dispo:updated' pós-transição (Fase 4): stub para não tocar
// socket nem disparar pool.query fora do fluxo sob teste.
vi.mock('../src/realtime/io.js', () => ({ emitir: vi.fn(), emitirPublico: vi.fn() }))
vi.mock('../src/db/tenant.js', () => ({ slugDeTenant: vi.fn().mockResolvedValue('summer') }))

import { criarApp } from '../src/app.js'
import { pool, withTransaction } from '../src/db/pool.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'
const token = (papel: string): string =>
  jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

// Faz withTransaction executar o callback com um tx mockado; retorna o tx p/ os asserts.
function comTx(): { query: ReturnType<typeof vi.fn> } {
  const tx = { query: vi.fn() }
  vi.mocked(withTransaction).mockImplementation((fn: (t: unknown) => unknown) => fn(tx) as never)
  return tx
}

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
  vi.mocked(withTransaction).mockReset()
})

describe('agendas — RBAC', () => {
  it('GET com papel pdv → 200', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).get('/agendas').set(bearer('pdv'))
    expect(r.status).toBe(200)
  })

  it('PATCH status com papel pdv → 403 RBAC_NEGADO', async () => {
    const r = await request(app).patch('/agendas/a1/status').set(bearer('pdv')).send({ status: 'agendado' })
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })

  it('PATCH valor com papel pdv → 403 RBAC_NEGADO', async () => {
    const r = await request(app).patch('/agendas/a1/valor').set(bearer('pdv')).send({ valor: 10 })
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })
})

describe('agendas — validação zod', () => {
  it('status fora do enum → 400 VALIDACAO', async () => {
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'solicitado' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('recusado sem motivo → 400 VALIDACAO', async () => {
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'recusado' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('valor negativo → 422 VALOR_INVALIDO (regra do service, não do zod)', async () => {
    const r = await request(app).patch('/agendas/a1/valor').set(bearer('gestao')).send({ valor: -1 })
    expect(r.status).toBe(422)
    expect(r.body.codigo).toBe('VALOR_INVALIDO')
  })
})

describe('agendas — máquina de estados', () => {
  it('solicitado→confirmado (pulo) → 409', async () => {
    const tx = comTx()
    tx.query.mockResolvedValueOnce({ rows: [{ status: 'solicitado', origem: 'gestao', protocolo: null }] })
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'confirmado' })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('TRANSICAO_AGENDA_INVALIDA')
  })

  it('confirmado→agendado → 409', async () => {
    const tx = comTx()
    tx.query.mockResolvedValueOnce({ rows: [{ status: 'confirmado', origem: 'gestao', protocolo: null }] })
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'agendado' })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('TRANSICAO_AGENDA_INVALIDA')
  })

  it('solicitado→agendado → 200', async () => {
    const tx = comTx()
    tx.query
      .mockResolvedValueOnce({ rows: [{ status: 'solicitado', origem: 'gestao', protocolo: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', status: 'agendado' }] })
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'agendado' })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('agendado')
  })

  it('agendado→recusado (com motivo) → 200', async () => {
    const tx = comTx()
    tx.query
      .mockResolvedValueOnce({ rows: [{ status: 'agendado', origem: 'gestao', protocolo: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', status: 'recusado' }] })
    const r = await request(app)
      .patch('/agendas/a1/status')
      .set(bearer('gestao'))
      .send({ status: 'recusado', motivo: 'sem data' })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('recusado')
  })
})

describe('agendas — outbox transacional', () => {
  it("origem='app_cliente' insere outbox 'evento:<status>'", async () => {
    const tx = comTx()
    tx.query
      .mockResolvedValueOnce({ rows: [{ status: 'solicitado', origem: 'app_cliente', protocolo: 'SD-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', status: 'agendado' }] })
      .mockResolvedValueOnce({ rows: [] })
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'agendado' })
    expect(r.status).toBe(200)
    const sqls = tx.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => /outbox/i.test(s))).toBe(true)
  })

  it("origem='gestao' NÃO insere outbox", async () => {
    const tx = comTx()
    tx.query
      .mockResolvedValueOnce({ rows: [{ status: 'solicitado', origem: 'gestao', protocolo: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', status: 'agendado' }] })
    const r = await request(app).patch('/agendas/a1/status').set(bearer('gestao')).send({ status: 'agendado' })
    expect(r.status).toBe(200)
    const sqls = tx.query.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => /outbox/i.test(s))).toBe(false)
  })
})
