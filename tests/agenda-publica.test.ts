// Unit tests da rota PÚBLICA GET /public/:tenant/agenda/:protocolo — SEM banco.
// Mocka pool.query (tenant lookup + agenda) e o emit realtime. Sem token JWT
// porque a rota é pública (a borda tem seus próprios controles: rate limit,
// validação de formato do protocolo, PII zero no shape de resposta).
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
const TENANT_ID = '00000000-0000-0000-0000-000000000000'
const TENANT_SLUG = 'summer'
const PROTOCOLO = 'SD-ABC123'

// Todo teste desta rota faz 2 queries: tenant slug → id, depois a agenda.
function mockTenantOk(): void {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: TENANT_ID }], rowCount: 1 } as never)
}

beforeEach(() => {
  vi.mocked(pool.query).mockReset()
})

describe('GET /public/:tenant/agenda/:protocolo — formato do protocolo', () => {
  it('protocolo malformado (sem prefixo SD-) → 400 PROTOCOLO_INVALIDO', async () => {
    mockTenantOk()
    const r = await request(app).get(`/public/${TENANT_SLUG}/agenda/XX-ABC123`)
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('PROTOCOLO_INVALIDO')
    // Só chamou o tenant lookup — NUNCA tocou na agenda com input inválido.
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1)
  })

  it('protocolo com caractere fora de [0-9A-Z] → 400 PROTOCOLO_INVALIDO', async () => {
    mockTenantOk()
    const r = await request(app).get(`/public/${TENANT_SLUG}/agenda/SD-abc123`)
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('PROTOCOLO_INVALIDO')
  })

  it('tenant inexistente → 404 genérico (sem revelar existência)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).get(`/public/inexistente/agenda/${PROTOCOLO}`)
    expect(r.status).toBe(404)
    expect(r.body.codigo).toBe('TENANT_NAO_ENCONTRADO')
  })
})

describe('GET /public/:tenant/agenda/:protocolo — leitura', () => {
  it('protocolo desconhecido → 404 AGENDA_NAO_ENCONTRADA', async () => {
    mockTenantOk()
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
    const r = await request(app).get(`/public/${TENANT_SLUG}/agenda/${PROTOCOLO}`)
    expect(r.status).toBe(404)
    expect(r.body.codigo).toBe('AGENDA_NAO_ENCONTRADA')
  })

  it('status "solicitado" → 200 sem motivo_recusa, sem PII', async () => {
    mockTenantOk()
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ status: 'solicitado', data: '2026-08-10', hora: '19:00', valor: '0.00', motivo_recusa: null }],
      rowCount: 1,
    } as never)
    const r = await request(app).get(`/public/${TENANT_SLUG}/agenda/${PROTOCOLO}`)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ status: 'solicitado', data: '2026-08-10', hora: '19:00', valor: '0.00', motivo_recusa: null })
    // Blindagem contra vazamento de PII (nunca deveria escapar do SELECT dos campos permitidos).
    expect(r.body.telefone).toBeUndefined()
    expect(r.body.email).toBeUndefined()
    expect(r.body.cliente).toBeUndefined()
  })

  it('status "recusado" com motivo → 200 devolvendo motivo_recusa', async () => {
    mockTenantOk()
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ status: 'recusado', data: '2026-08-10', hora: '19:00', valor: '0.00', motivo_recusa: 'Data indisponível' }],
      rowCount: 1,
    } as never)
    const r = await request(app).get(`/public/${TENANT_SLUG}/agenda/${PROTOCOLO}`)
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('recusado')
    expect(r.body.motivo_recusa).toBe('Data indisponível')
  })

  it('resposta traz Cache-Control: no-store (evita cache intermediário)', async () => {
    mockTenantOk()
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ status: 'agendado', data: '2026-08-10', hora: '14:00', valor: '2500.00', motivo_recusa: null }],
      rowCount: 1,
    } as never)
    const r = await request(app).get(`/public/${TENANT_SLUG}/agenda/${PROTOCOLO}`)
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toBe('no-store')
  })
})
