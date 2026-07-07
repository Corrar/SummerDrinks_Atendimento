// Runner de migração idempotente. Aplica os .sql de db/migrations em ordem
// lexicográfica, UMA vez cada, registrando o nome em schema_migrations.
//
// O runner é dono da transação: para cada arquivo ainda não registrado, executa o
// corpo do .sql + o INSERT de registro na MESMA transação (apply e track atômicos).
// Os .sql NÃO trazem BEGIN/COMMIT próprios (isso conflitava com este wrapping e
// tornava o registro não-atômico — bug corrigido nesta fase).
// Uso: npm run migrate
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from '../src/db/pool.js'

const aqui = dirname(fileURLToPath(import.meta.url))
const dir = join(aqui, '..', 'db', 'migrations')

async function main(): Promise<void> {
  // Livro-razão das migrações aplicadas (idempotência entre execuções).
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       nome        text PRIMARY KEY,
       aplicada_em timestamptz NOT NULL DEFAULT now()
     )`,
  )

  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of arquivos) {
    const ja = await pool.query('SELECT 1 FROM schema_migrations WHERE nome = $1', [f])
    if ((ja.rowCount ?? 0) > 0) {
      console.log(`[migrate] pulando ${f} (já aplicada)`)
      continue
    }

    const sql = readFileSync(join(dir, f), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [f])
      await client.query('COMMIT')
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

  console.log('[migrate] concluído.')
  await pool.end()
}

main().catch((e: unknown) => {
  console.error('[migrate] falhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
