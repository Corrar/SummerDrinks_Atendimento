// Unit tests do OutboxWorker — SEM banco. Mocka pool.connect() / pool.query()
// e injeta FakeTransport programável. Cobre os caminhos importantes do design
// two-phase (findings 1-5 do adversarial review):
//   - TX-CLAIM avança `tentativas` e `proxima_em` ANTES do envio
//   - agenda ausente (LEFT JOIN → null) → marca 'falha' 'agenda_ausente'
//   - tipo desconhecido → 'falha' 'tipo_desconhecido'
//   - telefone vazio → 'falha' 'telefone_ausente'
//   - retriable + não-exhausto → NÃO altera status (só ultimo_erro)
//   - não-retriable → 'falha' com safeCode
//   - exhausted (tentativas + 1 === MAX) → 'falha'
//   - exceção não-TransportError → reempacotada como 'unknown_exception', não-retriable
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OutboxWorker } from '../src/notif/OutboxWorker.js'
import { FakeTransport, TransportError } from '../src/notif/transport.js'

type QueryResult = { rows: unknown[]; rowCount: number }

/** Mock mínimo do Pool do pg: connect() devolve um cliente com query()/release(),
 *  e há uma query() direta para as TX-SETTLE (marcar entregue/falha). */
function criarMockPool() {
  const clientQueryCalls: Array<{ sql: string; args: unknown[] }> = []
  const poolQueryCalls: Array<{ sql: string; args: unknown[] }> = []
  const clientResults: QueryResult[] = []

  const client = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      clientQueryCalls.push({ sql, args })
      // BEGIN/COMMIT/ROLLBACK devolvem vazio; SELECT/UPDATE consomem dos preparados.
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql.trim())) {
        return { rows: [], rowCount: 0 }
      }
      const r = clientResults.shift()
      if (!r) throw new Error(`sem resultado preparado p/ query: ${sql.slice(0, 40)}`)
      return r
    }),
    release: vi.fn(),
  }

  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      poolQueryCalls.push({ sql, args })
      return { rows: [], rowCount: 1 }
    }),
  }

  return {
    pool: pool as unknown as import('pg').Pool,
    client,
    clientQueryCalls,
    poolQueryCalls,
    // helper p/ programar a próxima resposta do client.query em ordem
    preparar(...results: QueryResult[]): void {
      clientResults.push(...results)
    },
  }
}

/** Fixture da linha vinda do JOIN — todos os campos populados. */
function claimRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '42',
    tenant_id: '00000000-0000-0000-0000-000000000000',
    tipo: 'evento:recebido',
    tentativas: 0,
    criado_em_epoch: 1_700_000_000,
    ag_nome: 'Ana',
    ag_telefone: '11999998888',
    ag_data: '2026-08-10',
    ag_hora: '14:00',
    ag_protocolo: 'SD-ABC123',
    ag_motivo_recusa: null,
    ag_status: 'solicitado',
    ag_id: 'ag123',
    ...over,
  }
}

// ---------- construção comum ----------
let m: ReturnType<typeof criarMockPool>
let transport: FakeTransport
let logger: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
let worker: OutboxWorker

beforeEach(() => {
  m = criarMockPool()
  transport = new FakeTransport()
  logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
  worker = new OutboxWorker({ transport, logger, db: m.pool })
})

describe('OutboxWorker.drenarUmaVez — happy path', () => {
  it('entrega, marca "entregue", NÃO deixa PII em log', async () => {
    m.preparar({ rows: [claimRow()], rowCount: 1 }, { rows: [], rowCount: 1 })
    const ok = await worker.drenarUmaVez()

    expect(ok).toBe(true)
    expect(transport.enviadas).toHaveLength(1)
    expect(transport.enviadas[0]!.telefone).toBe('11999998888')
    expect(transport.enviadas[0]!.idempotencyKey).toBe('outbox:42:1700000000')
    // marcarEntregue via pool.query
    const settle = m.poolQueryCalls[0]!
    expect(settle.sql).toMatch(/status = 'entregue'/)
    expect(settle.args).toEqual(['42'])
    // Log allow-list: telefone/nome/texto NUNCA aparecem.
    for (const call of logger.log.mock.calls) {
      const linha = call.map(String).join(' ')
      expect(linha).not.toContain('11999998888')
      expect(linha).not.toContain('Ana')
    }
  })

  it('TX-CLAIM avança tentativas e proxima_em ANTES do envio', async () => {
    m.preparar({ rows: [claimRow({ tentativas: 2 })], rowCount: 1 }, { rows: [], rowCount: 1 })
    await worker.drenarUmaVez()

    const updateClaim = m.clientQueryCalls.find((c) => /UPDATE outbox\s+SET\s+tentativas/.test(c.sql))!
    expect(updateClaim).toBeDefined()
    expect(updateClaim.args).toEqual(['42', 3, '8']) // 2^3 = 8s
  })
})

describe('OutboxWorker.drenarUmaVez — sem trabalho', () => {
  it('SELECT vazio → returns false, NÃO marca nada', async () => {
    m.preparar({ rows: [], rowCount: 0 })
    const ok = await worker.drenarUmaVez()
    expect(ok).toBe(false)
    expect(m.poolQueryCalls).toHaveLength(0)
    expect(transport.enviadas).toHaveLength(0)
    // deve ter feito rollback da tx-claim ociosa
    expect(m.clientQueryCalls.some((c) => /^ROLLBACK/i.test(c.sql))).toBe(true)
  })
})

describe('OutboxWorker.drenarUmaVez — casos de falha terminal SEM enviar', () => {
  it('agenda ausente (LEFT JOIN null) → falha "agenda_ausente", zero envios', async () => {
    m.preparar({ rows: [claimRow({ ag_id: null, ag_telefone: null })], rowCount: 1 }, { rows: [], rowCount: 1 })
    await worker.drenarUmaVez()
    expect(transport.enviadas).toHaveLength(0)
    const settle = m.poolQueryCalls[0]!
    expect(settle.sql).toMatch(/status = 'falha'/)
    expect(settle.args).toEqual(['42', 'agenda_ausente'])
  })

  it('tipo desconhecido → falha "tipo_desconhecido"', async () => {
    m.preparar({ rows: [claimRow({ tipo: 'evento:cancelado' })], rowCount: 1 }, { rows: [], rowCount: 1 })
    await worker.drenarUmaVez()
    expect(transport.enviadas).toHaveLength(0)
    expect(m.poolQueryCalls[0]!.args).toEqual(['42', 'tipo_desconhecido'])
  })

  it('telefone ausente → falha "telefone_ausente" (não fica em loop)', async () => {
    m.preparar({ rows: [claimRow({ ag_telefone: '' })], rowCount: 1 }, { rows: [], rowCount: 1 })
    await worker.drenarUmaVez()
    expect(transport.enviadas).toHaveLength(0)
    expect(m.poolQueryCalls[0]!.args).toEqual(['42', 'telefone_ausente'])
  })
})

describe('OutboxWorker.drenarUmaVez — erros de envio', () => {
  it('retriable + não-exhausto → só registra ultimo_erro, NÃO muda status', async () => {
    m.preparar({ rows: [claimRow({ tentativas: 0 })], rowCount: 1 }, { rows: [], rowCount: 1 })
    transport.falharProximas(1, { retriable: true, safeCode: 'http_500' })
    await worker.drenarUmaVez()
    const settle = m.poolQueryCalls[0]!
    expect(settle.sql).not.toMatch(/status = /)
    expect(settle.sql).toMatch(/ultimo_erro = \$2/)
    expect(settle.args).toEqual(['42', 'http_500'])
  })

  it('não-retriable → falha imediata, mesmo com tentativas baixas', async () => {
    m.preparar({ rows: [claimRow({ tentativas: 0 })], rowCount: 1 }, { rows: [], rowCount: 1 })
    transport.falharProximas(1, { retriable: false, safeCode: 'invalid_phone' })
    await worker.drenarUmaVez()
    const settle = m.poolQueryCalls[0]!
    expect(settle.sql).toMatch(/status = 'falha'/)
    expect(settle.args).toEqual(['42', 'invalid_phone'])
  })

  it('exhausted (tentativas + 1 === MAX=8) → falha mesmo se retriable', async () => {
    m.preparar({ rows: [claimRow({ tentativas: 7 })], rowCount: 1 }, { rows: [], rowCount: 1 })
    transport.falharProximas(1, { retriable: true, safeCode: 'http_503' })
    await worker.drenarUmaVez()
    expect(m.poolQueryCalls[0]!.sql).toMatch(/status = 'falha'/)
    expect(m.poolQueryCalls[0]!.args).toEqual(['42', 'http_503'])
  })

  it('exceção NÃO-TransportError é reempacotada como "unknown_exception" não-retriable', async () => {
    m.preparar({ rows: [claimRow()], rowCount: 1 }, { rows: [], rowCount: 1 })
    // Monkey-patch para simular transporte quebrado que atira erro cru (o adapter real jamais deveria)
    transport.enviar = async () => { throw new Error('token=SECRETO na URL') }
    await worker.drenarUmaVez()
    const settle = m.poolQueryCalls[0]!
    expect(settle.sql).toMatch(/status = 'falha'/)
    expect(settle.args).toEqual(['42', 'unknown_exception'])
    // A mensagem crua NUNCA aparece nos logs
    for (const call of logger.log.mock.calls) {
      const linha = call.map(String).join(' ')
      expect(linha).not.toContain('SECRETO')
    }
  })
})

describe('OutboxWorker — TransportError shape', () => {
  it('safeCode é o único texto público; message == safeCode', () => {
    const e = new TransportError(true, 'http_429')
    expect(e.retriable).toBe(true)
    expect(e.safeCode).toBe('http_429')
    expect(e.message).toBe('http_429')
    expect(String(e)).not.toContain('undefined')
  })
})
