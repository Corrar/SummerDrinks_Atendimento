// Pool PostgreSQL + helper transacional (padrão withTransaction do ecossistema).
import pg from 'pg'
import { env } from '../config/env.js'

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.isProd ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  // Tuneis por env (default = produção enxuta). O gate/VPS-readiness pode subir
  // PG_POOL_MAX e PG_CONN_TIMEOUT_MS p/ absorver cold start do Neon e o burst de POSTs.
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS ?? 5_000),
})

pool.on('error', (err: Error) => {
  console.error('[db] erro inesperado no pool:', err.message)
})

export type Tx = pg.PoolClient

/**
 * Executa `fn` dentro de uma transação. Commit no sucesso, rollback em qualquer erro.
 * Escritor único: todas as mutações de domínio devem passar por aqui.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* rollback best-effort */
    }
    throw err
  } finally {
    client.release()
  }
}
