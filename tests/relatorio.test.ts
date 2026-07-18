// Unit tests do GET /orders/relatorio — SEM banco. Mocka pool.query e valida
// RBAC (gestão-only), validação de período e a consolidação Node das linhas
// agregadas (totais, ticket médio, a-receber, por dia/pagamento, eventos).
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

const app = criarApp()
const SECRET = process.env.JWT_SECRET as string
const TENANT = '00000000-0000-0000-0000-000000000000'
const token = (papel: string): string =>
  jwt.sign({ sub: 'u1', tenant: TENANT, papel }, SECRET, { expiresIn: 900 })
const bearer = (papel: string): Record<string, string> => ({ Authorization: `Bearer ${token(papel)}` })

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
})

describe('GET /orders/relatorio — RBAC e validação', () => {
  it('papel pdv → 403 RBAC_NEGADO', async () => {
    const r = await request(app).get('/orders/relatorio?de=2026-07-01&ate=2026-07-31').set(bearer('pdv'))
    expect(r.status).toBe(403)
    expect(r.body.codigo).toBe('RBAC_NEGADO')
  })

  it('sem query → 400 PERIODO_INVALIDO', async () => {
    const r = await request(app).get('/orders/relatorio').set(bearer('gestao'))
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('PERIODO_INVALIDO')
  })

  it('de > ate → 400 PERIODO_INVALIDO', async () => {
    const r = await request(app).get('/orders/relatorio?de=2026-08-01&ate=2026-07-01').set(bearer('gestao'))
    expect(r.status).toBe(400)
  })

  it('período > 400 dias → 422 PERIODO_LONGO', async () => {
    const r = await request(app).get('/orders/relatorio?de=2025-01-01&ate=2026-06-01').set(bearer('gestao'))
    expect(r.status).toBe(422)
    expect(r.body.codigo).toBe('PERIODO_LONGO')
  })
})

describe('GET /orders/relatorio — consolidação', () => {
  it('agrega totais, ticket médio, por dia/pagamento e eventos', async () => {
    vi.mocked(pool.query)
      // 1) por dia × pagamento
      .mockResolvedValueOnce({
        rows: [
          { dia: '2026-07-10', pagamento: 'Pix',    qtd: '3', total: '150', nao_pago: '0' },
          { dia: '2026-07-10', pagamento: 'Cartão', qtd: '1', total: '58',  nao_pago: '58' },
          { dia: '2026-07-11', pagamento: 'Pix',    qtd: '2', total: '92',  nao_pago: '0' },
        ],
        rowCount: 3,
      } as never)
      // 2) mais vendidos
      .mockResolvedValueOnce({
        rows: [
          { nome: 'Caipirinha · Copo', qtd: '5', total: '115' },
          { nome: 'Aperol Spritz · Copão', qtd: '2', total: '116' },
        ],
        rowCount: 2,
      } as never)
      // 3) eventos
      .mockResolvedValueOnce({ rows: [{ qtd: '2', receita: '4500' }], rowCount: 1 } as never)

    const r = await request(app).get('/orders/relatorio?de=2026-07-01&ate=2026-07-31').set(bearer('gestao'))
    expect(r.status).toBe(200)
    expect(r.body.pedidos).toBe(6)
    expect(r.body.faturamento).toBe(300)
    expect(r.body.ticketMedio).toBe(50)
    expect(r.body.aReceber).toBe(58)
    expect(r.body.porDia).toEqual([
      { dia: '2026-07-10', qtd: 4, total: 208 },
      { dia: '2026-07-11', qtd: 2, total: 92 },
    ])
    expect(r.body.porPagamento).toEqual(
      expect.arrayContaining([
        { pagamento: 'Pix', qtd: 5, total: 242 },
        { pagamento: 'Cartão', qtd: 1, total: 58 },
      ]),
    )
    expect(r.body.maisVendidos[0]).toEqual({ nome: 'Caipirinha · Copo', qtd: 5, total: 115 })
    expect(r.body.eventos).toEqual({ qtd: 2, receita: 4500 })
  })

  it('período vazio → zeros (sem NaN no ticket médio)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ qtd: '0', receita: '0' }], rowCount: 1 } as never)

    const r = await request(app).get('/orders/relatorio?de=2026-07-01&ate=2026-07-02').set(bearer('gestao'))
    expect(r.status).toBe(200)
    expect(r.body.pedidos).toBe(0)
    expect(r.body.faturamento).toBe(0)
    expect(r.body.ticketMedio).toBe(0)
    expect(r.body.maisVendidos).toEqual([])
  })
})
