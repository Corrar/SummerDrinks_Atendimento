// Unit tests da re-precificação da "dobrada" na borda pública (EdgeIngestService).
// SEM banco (pool mockado). Prova: adicional só entra se o item permite hoje,
// nome ganha o sufixo "· Dobrada", e o preço é sempre do SERVIDOR (nunca do cliente).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/db/pool.js', () => ({
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
}))

import { EdgeIngestService } from '../src/services/EdgeIngestService.js'
import { pool } from '../src/db/pool.js'
import { encodeRefItem } from '../src/types/acl.js'

const TENANT = '00000000-0000-0000-0000-000000000000'
// Catálogo: item dobrável (+8) e item não-dobrável.
const linha = (over: Record<string, unknown> = {}) => ({
  id: 'cp1', nome: 'Caipirinha', tamanhos: [{ rotulo: 'Copão', preco: 20 }],
  dobravel: true, preco_dobra: 8, ...over,
})
const mockCatalogo = (rows: unknown[]) => vi.mocked(pool.query).mockResolvedValueOnce({ rows } as never)

beforeEach(() => { vi.mocked(pool.query).mockReset() })

describe('EdgeIngestService._reprecificar — dobrada', () => {
  it('dobrada em item dobrável soma o adicional e marca o nome', async () => {
    mockCatalogo([linha()])
    const { itens, total } = await EdgeIngestService._reprecificar(TENANT, {
      cliente: '', pagamento: 'pix', pago: false,
      itens: [{ id: encodeRefItem('cp1', 0), qty: 2, dobrada: true }],
    } as never)
    expect(itens[0].nome).toBe('Caipirinha · Copão · Dobrada')
    expect(itens[0].preco).toBe(28) // 20 + 8
    expect(total).toBe(56) // 28 × 2
  })

  it('sem dobrada usa o preço base e o nome normal', async () => {
    mockCatalogo([linha()])
    const { itens } = await EdgeIngestService._reprecificar(TENANT, {
      cliente: '', pagamento: 'pix', pago: false,
      itens: [{ id: encodeRefItem('cp1', 0), qty: 1, dobrada: false }],
    } as never)
    expect(itens[0].nome).toBe('Caipirinha · Copão')
    expect(itens[0].preco).toBe(20)
  })

  it('dobrada pedida em item NÃO dobrável cai no preço normal (nunca cobra dobra fantasma)', async () => {
    mockCatalogo([linha({ dobravel: false, preco_dobra: 0 })])
    const { itens } = await EdgeIngestService._reprecificar(TENANT, {
      cliente: '', pagamento: 'pix', pago: false,
      itens: [{ id: encodeRefItem('cp1', 0), qty: 1, dobrada: true }],
    } as never)
    expect(itens[0].nome).toBe('Caipirinha · Copão')
    expect(itens[0].preco).toBe(20)
  })

  it('migration 011 ainda não rodada (42703) → reprecifica sem dobra em vez de 500', async () => {
    // 1ª query (com colunas de dobra) falha com undefined_column; a 2ª (legada) vence.
    const err = Object.assign(new Error('column "dobravel" does not exist'), { code: '42703' })
    vi.mocked(pool.query)
      .mockRejectedValueOnce(err as never)
      .mockResolvedValueOnce({ rows: [{ id: 'cp1', nome: 'Caipirinha', tamanhos: [{ rotulo: 'Copão', preco: 20 }] }] } as never)
    const { itens, total } = await EdgeIngestService._reprecificar(TENANT, {
      cliente: '', pagamento: 'pix', pago: false,
      itens: [{ id: encodeRefItem('cp1', 0), qty: 1, dobrada: true }],
    } as never)
    expect(itens[0].nome).toBe('Caipirinha · Copão')
    expect(itens[0].preco).toBe(20)
    expect(total).toBe(20)
  })
})
