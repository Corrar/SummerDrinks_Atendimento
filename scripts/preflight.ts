import 'dotenv/config'
import { pool } from '../src/db/pool.js'

async function main(): Promise<void> {
  const t0 = Date.now()
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const r = await pool.query<{ v: string; db: string }>(
        `SELECT version() AS v, current_database() AS db`,
      )
      const row = r.rows[0]!
      console.log(`[preflight] OK ${Date.now() - t0}ms → db=${row.db} | ${row.v.split(' ').slice(0, 2).join(' ')}`)
      await pool.end()
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[preflight] tentativa ${tentativa}: ${msg}`)
      if (tentativa === 1 && /timeout|ECONNRESET|terminating|ETIMEDOUT/i.test(msg)) {
        console.error('[preflight] provável cold start do Neon — retry em 3s…')
        await new Promise((res) => setTimeout(res, 3000))
        continue
      }
      await pool.end().catch(() => {})
      process.exit(1)
    }
  }
  process.exit(1)
}
main().catch(() => process.exit(1))
