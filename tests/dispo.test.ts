// Unit tests do dispoRouter — SEM banco. Mocka pool.query e o emit realtime.
// Cobre RBAC (mutação gestão-only), zod strict, ISO inválida (400), upsert OK (200)
// e conflito de versão (RETURNING vazio ⇒ 409 CONFLITO_VERSAO).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}))
// Isola socket e resolução de slug — sem I/O real nos testes.
vi.mock('../src/realtime/io.js', () => ({
  emitir: vi.fn(),
  emitirPublico: vi.fn(),
}))
vi.mock('../src/db/tenant.js', () => ({ slugDeTenant: vi.fn().mockResolvedValue('summer') }))

import { criarApp } from '../src/app.js'
import { pool } from '../src/db/pool.js'
import { emitir, emitirPublico } from '../src/realtime/io.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'
const token = (papel: string): string =>
  jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

const ISO = '2025-08-15'
const bodyOk = { tarde: true, noite: false, madrugada: true, version: 0 }

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
  vi.mocked(emitir).mockClear()
  vi.mocked(emitirPublico).mockClear()
})

describe('dispo — RBAC', () => {
  it('GET com papel painel → 200', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).get('/dispo?mes=2025-08').set(bearer('painel'))
    expect(r.status).toBe(200)
    expect(r.body.mes).toBe('2025-08')
  })

  it('PUT com papel pdv → 403 RBAC_NEGADO', async () => {
    const r = await request(app).put(`/dispo/${ISO}`).set(bearer('pdv')).send(bodyOk)
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })

  it('PUT sem token → 401 SEM_TOKEN', async () => {
    const r = await request(app).put(`/dispo/${ISO}`).send(bodyOk)
    expect(r.status).toBe(401)
    expect(r.body.codigo).toBe('SEM_TOKEN')
  })
})

describe('dispo — validação', () => {
  it('body com chave extra → 400 VALIDACAO (.strict)', async () => {
    const r = await request(app).put(`/dispo/${ISO}`).set(bearer('gestao')).send({ ...bodyOk, hack: 1 })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('version negativa → 400 VALIDACAO', async () => {
    const r = await request(app).put(`/dispo/${ISO}`).set(bearer('gestao')).send({ ...bodyOk, version: -1 })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('ISO malformada → 400 ISO_INVALIDA', async () => {
    const r = await request(app).put('/dispo/2025-13-40').set(bearer('gestao')).send(bodyOk)
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('ISO_INVALIDA')
  })
})

describe('dispo — upsert e concorrência', () => {
  it('upsert OK → 200 + emit privado e público', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ iso: ISO, tarde: true, noite: false, madrugada: true, version: 1 }],
      rowCount: 1,
    } as never)
    const r = await request(app).put(`/dispo/${ISO}`).set(bearer('gestao')).send(bodyOk)
    expect(r.status).toBe(200)
    expect(r.body.version).toBe(1)
    expect(vi.mocked(emitir)).toHaveBeenCalledWith(TENANT, 'dispo:updated', { iso: ISO })
    expect(vi.mocked(emitirPublico)).toHaveBeenCalledWith('summer', 'dispo:updated', { iso: ISO })
  })

  it('version divergente (RETURNING vazio) → 409 CONFLITO_VERSAO, sem emit', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // upsert não retorna
      .mockResolvedValueOnce({
        rows: [{ iso: ISO, tarde: true, noite: true, madrugada: true, version: 7 }],
        rowCount: 1,
      } as never) // re-SELECT do estado atual
    const r = await request(app).put(`/dispo/${ISO}`).set(bearer('gestao')).send(bodyOk)
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('CONFLITO_VERSAO')
    expect(vi.mocked(emitir)).not.toHaveBeenCalled()
    expect(vi.mocked(emitirPublico)).not.toHaveBeenCalled()
  })
})
