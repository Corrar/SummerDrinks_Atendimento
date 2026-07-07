// Unit tests do catalogoRouter — SEM banco (pool mockado). Paridade GATE A:
// prova RBAC (gestao-only), validação zod estrita, e o guard append-only de tamanhos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// Mock do pool ANTES de importar o app (hoisted). Cobre pool + withTransaction
// (importados por services no grafo de módulos do app).
vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}))

import { criarApp } from '../src/app.js'
import { pool } from '../src/db/pool.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'

const token = (papel: string): string =>
  jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

const itemValido = { id: 'x1', cat: 'Doses', nome: 'X', tamanhos: [{ rotulo: 'D', preco: 10 }] }

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
})

describe('catalogo — RBAC (gestao-only, sem DB)', () => {
  it('papel pdv → 403 RBAC_NEGADO', async () => {
    const r = await request(app).get('/catalogo').set(bearer('pdv'))
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })

  it('papel painel → 403 RBAC_NEGADO', async () => {
    const r = await request(app).get('/catalogo').set(bearer('painel'))
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })

  it('papel gestao passa o RBAC → 200', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).get('/catalogo').set(bearer('gestao'))
    expect(r.status).toBe(200)
  })
})

describe('catalogo — validação zod (sem DB)', () => {
  it('cat fora do enum → 400 VALIDACAO', async () => {
    const r = await request(app).post('/catalogo').set(bearer('gestao')).send({ ...itemValido, cat: 'Inexistente' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('tamanhos [] → 400 VALIDACAO', async () => {
    const r = await request(app).post('/catalogo').set(bearer('gestao')).send({ ...itemValido, tamanhos: [] })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('preco negativo → 400 VALIDACAO', async () => {
    const r = await request(app)
      .post('/catalogo')
      .set(bearer('gestao'))
      .send({ ...itemValido, tamanhos: [{ rotulo: 'D', preco: -1 }] })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('nome vazio → 400 VALIDACAO', async () => {
    const r = await request(app).post('/catalogo').set(bearer('gestao')).send({ ...itemValido, nome: '' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })
})

describe('catalogo — PUT guards (sem DB)', () => {
  it('body.id ≠ :id → 400 ID_INCONSISTENTE', async () => {
    // itemValido.id === 'x1', path === 'OUTRO' → diverge (antes de qualquer query).
    const r = await request(app).put('/catalogo/OUTRO').set(bearer('gestao')).send(itemValido)
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('ID_INCONSISTENTE')
  })

  it('encolher tamanhos → 409 TAMANHOS_SHRINK', async () => {
    // atual tem 3 tamanhos (mock do SELECT); body manda 2 → shrink recusado.
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ tamanhos: [{}, {}, {}] }], rowCount: 1 } as never)
    const body = {
      id: 'x1',
      cat: 'Doses',
      nome: 'X',
      tamanhos: [
        { rotulo: 'A', preco: 1 },
        { rotulo: 'B', preco: 2 },
      ],
    }
    const r = await request(app).put('/catalogo/x1').set(bearer('gestao')).send(body)
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('TAMANHOS_SHRINK')
  })
})
