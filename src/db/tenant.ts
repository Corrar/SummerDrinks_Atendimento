// Resolve slug ↔ tenant_id. `slug` é UNIQUE e imutável na prática → cache em memória
// seguro. Usado por rotas autenticadas (que só têm o UUID no JWT) para emitir na sala
// PÚBLICA, que é chaveada pelo SLUG (nunca pelo tenant_id interno). Ver realtime/io.ts.
import { pool } from './pool.js'

const cacheSlug = new Map<string, string>()

export async function slugDeTenant(tenantId: string): Promise<string | null> {
  const hit = cacheSlug.get(tenantId)
  if (hit) return hit
  const r = await pool.query<{ slug: string }>(`SELECT slug FROM tenant WHERE id = $1`, [tenantId])
  const slug = r.rows[0]?.slug ?? null
  if (slug) cacheSlug.set(tenantId, slug)
  return slug
}
