// Unit tests da avaliação de pedido (feedback 1-5 + comentário) — SEM banco.
// Mocka pool.query e emit. Cobre: validação zod (nota/comentário), token
// malformado, 404 genérico p/ pedido inexistente, 409 p/ não-entregue e
// duplicada, sanitização semHtml do comentário, emit avaliacao:created, e o
// GET /avaliacoes autenticado (RBAC, período, shape do agregado).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}))
vi.mock('../src/realtime/io.js', () => ({
  emitir: vi.fn(),
  emitirPublico: vi.fn(),
  emitirStatusPedido: vi.fn(),
}))

import { criarApp } from '../src/app.js'
import { pool } from '../src/db/pool.js'
import { emitir } from '../src/realtime/io.js'

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'
const TOKEN_PEDIDO = '123e4567-e89b-42d3-a456-426614174000'
const URL = `/public/summer/pedido/${TOKEN_PEDIDO}/avaliacao`

const token = (papel: string): string =>
  jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

/** Mocks na ordem das queries do POST: tenantIdPorSlug → SELECT pedido → INSERT. */
function mockFluxo(pedido: { senha: number; status: string } | null, insertCount = 1): void {
  vi.mocked(pool.query)
    .mockResolvedValueOnce({ rows: [{ id: TENANT }], rowCount: 1 } as never)
    .mockResolvedValueOnce({ rows: pedido ? [pedido] : [], rowCount: pedido ? 1 : 0 } as never)
    .mockResolvedValueOnce({ rows: [], rowCount: insertCount } as never)
}

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
  vi.mocked(emitir).mockClear()
})

describe('POST /public/:tenant/pedido/:token/avaliacao — validação', () => {
  it('nota fora de 1..5 → 400 VALIDACAO (sem tocar o DB)', async () => {
    for (const nota of [0, 6, 3.5]) {
      const r = await request(app).post(URL).send({ nota })
      expect(r.status).toBe(400)
      expect(r.body.codigo).toBe('VALIDACAO')
    }
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled()
  })

  it('comentário acima de 600 chars → 400 VALIDACAO', async () => {
    const r = await request(app).post(URL).send({ nota: 5, comentario: 'x'.repeat(601) })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('VALIDACAO')
  })

  it('token malformado no path → 400 TOKEN_INVALIDO (nunca 500 do cast ::uuid)', async () => {
    // Inclui pseudo-UUIDs de 36 chars que a antiga regex frouxa deixava passar
    // até o Postgres (22P02 → 500): o guard deve barrar ANTES do banco.
    const invalidos = ['nao-e-uuid-xx', 'f'.repeat(36), '-'.repeat(36), `123e4567e89b42d3a456-${'1'.repeat(15)}`]
    for (const t of invalidos) {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: TENANT }], rowCount: 1 } as never)
      const r = await request(app).post(`/public/summer/pedido/${t}/avaliacao`).send({ nota: 5 })
      expect(r.status).toBe(400)
      expect(r.body.codigo).toBe('TOKEN_INVALIDO')
    }
  })
})

describe('POST avaliação — regras de domínio', () => {
  it('pedido inexistente → 404 genérico (anti-enumeração)', async () => {
    mockFluxo(null)
    const r = await request(app).post(URL).send({ nota: 4 })
    expect(r.status).toBe(404)
    expect(r.body.codigo).toBe('PEDIDO_NAO_ENCONTRADO')
  })

  it('pedido ainda não entregue → 409 PEDIDO_NAO_ENTREGUE', async () => {
    mockFluxo({ senha: 45, status: 'preparo' })
    const r = await request(app).post(URL).send({ nota: 4 })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('PEDIDO_NAO_ENTREGUE')
    expect(vi.mocked(emitir)).not.toHaveBeenCalled()
  })

  it('segunda avaliação do mesmo pedido → 409 AVALIACAO_EXISTENTE', async () => {
    mockFluxo({ senha: 45, status: 'entregue' }, 0)
    const r = await request(app).post(URL).send({ nota: 4 })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('AVALIACAO_EXISTENTE')
    expect(vi.mocked(emitir)).not.toHaveBeenCalled()
  })

  it('sucesso → 201 { ok } + emit avaliacao:created { senha, nota } sem comentário', async () => {
    mockFluxo({ senha: 47, status: 'entregue' })
    const r = await request(app).post(URL).send({ nota: 5, comentario: 'Drinks excelentes!' })
    expect(r.status).toBe(201)
    expect(r.body).toEqual({ ok: true })
    const [tid, evento, payload] = vi.mocked(emitir).mock.calls[0]!
    expect(tid).toBe(TENANT)
    expect(evento).toBe('avaliacao:created')
    expect(payload).toEqual({ senha: 47, nota: 5 })
  })

  it('comentário é sanitizado (semHtml) antes do INSERT', async () => {
    mockFluxo({ senha: 45, status: 'entregue' })
    await request(app).post(URL).send({ nota: 5, comentario: '<script>alert(1)</script> ótimo!' })
    // 3ª query = INSERT; params: [tenant, token, nota, comentario]
    const insert = vi.mocked(pool.query).mock.calls[2]!
    const comentario = (insert[1] as unknown[])[3] as string
    expect(comentario).not.toMatch(/[<>]/)
    expect(comentario).toContain('ótimo!')
  })
})

describe('GET /avaliacoes — gestão', () => {
  it('sem token → 401', async () => {
    const r = await request(app).get('/avaliacoes?de=2026-07-01&ate=2026-07-20')
    expect(r.status).toBe(401)
  })

  it('período inválido → 400 PERIODO_INVALIDO', async () => {
    const r = await request(app).get('/avaliacoes?de=2026-07-20&ate=2026-07-01').set(bearer('gestao'))
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('PERIODO_INVALIDO')
  })

  it('papel pdv lê; shape com média/distribuição/lista', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ nota: 5, comentario: 'top', criado_em: '2026-07-20', senha: 45, dia: '2026-07-20', cliente: 'Ana' }],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [{ qtd: '1', media: '5.00', n1: '0', n2: '0', n3: '0', n4: '0', n5: '1' }],
        rowCount: 1,
      } as never)
    const r = await request(app).get('/avaliacoes?de=2026-07-01&ate=2026-07-20').set(bearer('pdv'))
    expect(r.status).toBe(200)
    expect(r.body.qtd).toBe(1)
    expect(r.body.media).toBe(5)
    expect(r.body.distribuicao['5']).toBe(1)
    expect(r.body.avaliacoes).toHaveLength(1)
    expect(r.body.avaliacoes[0].senha).toBe(45)
  })
})
