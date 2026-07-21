// Unit tests do usuariosRouter (gestão-only) — SEM banco. Mocka pool.query e bcrypt.
// Cobre RBAC, criação (hash + 409 login em uso), validação zod, guard do último
// admin ativo (rebaixar/desativar/excluir), e que o hash nunca sai na resposta.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// withTransaction roda o callback com um "tx" que delega ao MESMO mock de query,
// então a sequência de mockResolvedValueOnce alimenta as queries dentro da tx.
const { q } = vi.hoisted(() => ({ q: vi.fn() }))
vi.mock('../src/db/pool.js', () => ({
  pool: { query: q },
  withTransaction: async (fn: (tx: { query: typeof q }) => unknown) => fn({ query: q }),
}))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'HASH') } }))

import { criarApp } from '../src/app.js'
import { pool } from '../src/db/pool.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'
const token = (papel: string): string => jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

beforeEach(() => { vi.mocked(pool.query).mockReset() })

describe('usuários — RBAC', () => {
  it('pdv não lista (403)', async () => {
    const r = await request(app).get('/usuarios').set(bearer('pdv'))
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })
  it('sem token → 401', async () => {
    const r = await request(app).get('/usuarios')
    expect(r.status).toBe(401)
  })
})

describe('usuários — GET / POST', () => {
  it('gestão lista sem hash', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'u1', login: 'admin', papel: 'gestao', ativo: true }], rowCount: 1 } as never)
    const r = await request(app).get('/usuarios').set(bearer('gestao'))
    expect(r.status).toBe(200)
    expect(r.body[0]).toEqual({ id: 'u1', login: 'admin', papel: 'gestao', ativo: true })
    expect(JSON.stringify(r.body)).not.toContain('hash')
  })

  it('cria operador → 201 (senha vira hash; resposta sem hash)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 'u2', login: 'bar', papel: 'pdv', ativo: true }], rowCount: 1 } as never)
    const r = await request(app).post('/usuarios').set(bearer('gestao')).send({ login: 'Bar', senha: 'senha123', papel: 'pdv' })
    expect(r.status).toBe(201)
    expect(r.body.login).toBe('bar')
    // login normalizado para minúsculas no INSERT
    const params = vi.mocked(pool.query).mock.calls[0]![1] as unknown[]
    expect(params[1]).toBe('bar')
    expect(params[2]).toBe('HASH')
  })

  it('login duplicado → 409 LOGIN_EM_USO', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
    const r = await request(app).post('/usuarios').set(bearer('gestao')).send({ login: 'admin', senha: 'senha123' })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('LOGIN_EM_USO')
  })

  it('senha curta → 400 VALIDACAO', async () => {
    const r = await request(app).post('/usuarios').set(bearer('gestao')).send({ login: 'bar', senha: 'ab' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })
})

describe('usuários — guard do último admin ativo', () => {
  it('rebaixar o último admin ativo → 409 ULTIMO_ADMIN', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'u1', login: 'admin', papel: 'gestao', ativo: true }], rowCount: 1 } as never) // SELECT alvo
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }], rowCount: 1 } as never) // FOR UPDATE: só u1 é admin ativo → exceto=0
    const r = await request(app).patch('/usuarios/u1').set(bearer('gestao')).send({ papel: 'pdv' })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('ULTIMO_ADMIN')
  })

  it('excluir o último admin ativo → 409', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'u1', login: 'admin', papel: 'gestao', ativo: true }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }], rowCount: 1 } as never)
    const r = await request(app).delete('/usuarios/u1').set(bearer('gestao'))
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('ULTIMO_ADMIN')
  })

  it('desativar quando há OUTRO admin ativo → 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 'u1', login: 'admin', papel: 'gestao', ativo: true }], rowCount: 1 } as never) // alvo
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }, { id: 'u2' }], rowCount: 2 } as never) // FOR UPDATE: u2 continua admin ativo
      .mockResolvedValueOnce({ rows: [{ id: 'u1', login: 'admin', papel: 'gestao', ativo: false }], rowCount: 1 } as never) // UPDATE
    const r = await request(app).patch('/usuarios/u1').set(bearer('gestao')).send({ ativo: false })
    expect(r.status).toBe(200)
    expect(r.body.ativo).toBe(false)
  })

  it('usuário inexistente → 404', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).patch('/usuarios/zzz').set(bearer('gestao')).send({ ativo: true })
    expect(r.status).toBe(404)
    expect(r.body.codigo).toBe('USUARIO_NAO_ENCONTRADO')
  })
})
