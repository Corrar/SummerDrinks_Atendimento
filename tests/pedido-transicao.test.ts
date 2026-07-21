// Unit tests da máquina de estados de PEDIDO — foco na REABERTURA de comanda
// (entregue → pronto). Sem banco: mocka pool.query + withTransaction, alimentando
// a sequência de queries de OrderService.marcarStatus com mockResolvedValueOnce.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { q } = vi.hoisted(() => ({ q: vi.fn() }))
vi.mock('../src/db/pool.js', () => ({
  pool: { query: q },
  withTransaction: async (fn: (tx: { query: typeof q }) => unknown) => fn({ query: q }),
}))

import { OrderService } from '../src/services/OrderService.js'
import { TRANSICOES, TransicaoInvalida } from '../src/types/domain.js'

const TENANT = '00000000-0000-0000-0000-000000000000'
const linha = (status: string) => ({
  rows: [{ senha: 7, hora: '20:00', pagamento: 'Pix', status, cliente: 'Ana', pago: true, items: [{ nome: 'X', preco: 10, qtd: 1 }] }],
  rowCount: 1,
})

beforeEach(() => { q.mockReset() })

describe('máquina de estados — TRANSICOES', () => {
  it('entregue permite reabrir para pronto (e só isso)', () => {
    expect(TRANSICOES.entregue).toContain('pronto')
    expect(TRANSICOES.entregue).not.toContain('preparo')
    expect(TRANSICOES.entregue).not.toContain('entregue')
  })
})

describe('OrderService.marcarStatus — reabertura', () => {
  it('reabre entregue → pronto SEM re-anunciar (sem UPDATE de chamada)', async () => {
    q.mockResolvedValueOnce({ rows: [{ status: 'entregue' }], rowCount: 1 } as never) // SELECT ... FOR UPDATE
     .mockResolvedValueOnce(linha('pronto') as never)                                  // UPDATE pedido RETURNING
    const p = await OrderService.marcarStatus(TENANT, 7, 'pronto')
    expect(p.status).toBe('pronto')
    // Exatamente 2 queries: SELECT + UPDATE. A 3ª (registrar chamada) NÃO ocorre.
    expect(q).toHaveBeenCalledTimes(2)
    expect(q.mock.calls.some((c) => String(c[0]).includes('painel_estado'))).toBe(false)
  })

  it('preparo → pronto (via normal) ANUNCIA no painel (UPDATE de chamada)', async () => {
    q.mockResolvedValueOnce({ rows: [{ status: 'preparo' }], rowCount: 1 } as never) // SELECT
     .mockResolvedValueOnce(linha('pronto') as never)                                // UPDATE pedido
     .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)                       // UPDATE painel_estado (chamada)
    const p = await OrderService.marcarStatus(TENANT, 7, 'pronto')
    expect(p.status).toBe('pronto')
    expect(q).toHaveBeenCalledTimes(3)
    expect(q.mock.calls.some((c) => String(c[0]).includes('painel_estado'))).toBe(true)
  })

  it('entregue → preparo continua proibido (TransicaoInvalida)', async () => {
    q.mockResolvedValueOnce({ rows: [{ status: 'entregue' }], rowCount: 1 } as never) // SELECT
    await expect(OrderService.marcarStatus(TENANT, 7, 'preparo')).rejects.toBeInstanceOf(TransicaoInvalida)
  })
})
