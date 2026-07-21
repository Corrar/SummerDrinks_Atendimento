// Runner de migração idempotente chamado NO BOOT do servidor (server.ts).
// Mesma lógica de scripts/migrate.ts, mas como função (sem pool.end/exit) e em
// JS compilado (dist) — assim roda DENTRO do container do Render, que não tem
// tsx. O deploy passa a aplicar o schema sozinho, fechando a janela "código
// novo × schema velho" que derrubava o /menu do cliente (ex.: colunas da dobra).
//
// Compartilha a tabela schema_migrations com scripts/migrate.ts: migrações já
// aplicadas à mão ficam registradas e são puladas aqui. As .sql são aditivas e
// idempotentes (IF NOT EXISTS), então reaplicar por engano é inofensivo.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './pool.js'

// dist/db/migracoes.js → ../../db/migrations = /app/db/migrations (idem em dev com src/).
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations')

export async function aplicarMigracoesPendentes(): Promise<number> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       nome        text PRIMARY KEY,
       aplicada_em timestamptz NOT NULL DEFAULT now()
     )`,
  )

  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let aplicadas = 0
  for (const f of arquivos) {
    const ja = await pool.query('SELECT 1 FROM schema_migrations WHERE nome = $1', [f])
    if ((ja.rowCount ?? 0) > 0) continue

    const sql = readFileSync(join(dir, f), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [f])
      await client.query('COMMIT')
      aplicadas += 1
      console.log(`[migrate] aplicada ${f}`)
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {
        /* rollback best-effort */
      })
      throw e
    } finally {
      client.release()
    }
  }
  console.log(aplicadas === 0 ? '[migrate] schema já atualizado.' : `[migrate] ${aplicadas} migração(ões) aplicada(s).`)
  return aplicadas
}
