// Regressão de CORS por superfície: a borda PÚBLICA (/public/*, /health) libera
// qualquer origem (o app do cliente abre de qualquer dispositivo/origem); as
// rotas PRIVADAS mantêm a allowlist (CORS_ORIGINS). Um origin-gate na pública
// quebrava o cardápio do cliente quando a origem não batia com a allowlist.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

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
const ORIGEM_ESTRANHA = 'https://preview-qualquer-xyz.vercel.app'

beforeEach(() => { vi.mocked(pool.query).mockReset() })

describe('CORS — borda pública libera qualquer origem', () => {
  it('/health responde a qualquer Origin com ACAO *', async () => {
    const r = await request(app).get('/health').set('Origin', ORIGEM_ESTRANHA)
    expect(r.status).toBe(200)
    expect(r.headers['access-control-allow-origin']).toBe('*')
  })

  it('/public/:tenant/menu responde a qualquer Origin com ACAO * (cardápio abre de qualquer lugar)', async () => {
    // tenant lookup → id; depois o SELECT do catálogo (vazio serve).
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000000' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
    const r = await request(app).get('/public/summer/menu').set('Origin', ORIGEM_ESTRANHA)
    expect(r.status).toBe(200)
    expect(r.headers['access-control-allow-origin']).toBe('*')
  })
})

describe('CORS — rotas privadas NÃO liberam origem fora da allowlist', () => {
  it('origem estranha em rota autenticada não recebe ACAO dela', async () => {
    const r = await request(app).get('/orders').set('Origin', ORIGEM_ESTRANHA)
    // Sem allowlist configurada nos testes, a origem estranha é barrada:
    // o middleware não devolve o header refletindo essa origem.
    expect(r.headers['access-control-allow-origin']).not.toBe(ORIGEM_ESTRANHA)
  })
})
