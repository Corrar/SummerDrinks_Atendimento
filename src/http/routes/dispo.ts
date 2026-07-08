// Rotas de DISPONIBILIDADE (BASE declarada pela gestão), sob a fronteira de auth.
// GET (gestão/pdv/painel) devolve a base CRUA com `version` para eco no PUT — NÃO
// mescla ocupação (o merge com agenda vive na borda pública, ver public.ts).
// PUT (gestão-only) faz upsert com concorrência otimista (espelha painel_estado).
// Toda mutação emite 'dispo:updated' na sala PRIVADA (painel) e na PÚBLICA (app do
// cliente, chaveada por SLUG — nunca tenant_id). Payload sem PII: só { iso }.
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { emitir, emitirPublico } from '../../realtime/io.js'
import { slugDeTenant } from '../../db/tenant.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { ErroDominio, ConflitoVersao, type DispoDia } from '../../types/domain.js'

export const dispoRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

const mesRe = /^\d{4}-\d{2}$/
const isoRe = /^\d{4}-\d{2}-\d{2}$/

// Body do PUT: os 3 períodos + version esperada (concorrência otimista). `.strict()`
// rejeita chaves extras. `iso` NÃO vem no body — é o path param (evita divergência).
const putDispoSchema = z
  .object({
    tarde: z.boolean(),
    noite: z.boolean(),
    madrugada: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict()

const SEL_BASE =
  `to_char(iso,'YYYY-MM-DD') AS iso, tarde, noite, madrugada, version`

// GET /dispo?mes=YYYY-MM — base crua do mês (default: mês corrente do servidor).
dispoRouter.get(
  '/dispo',
  exigirPapel('gestao', 'pdv', 'painel'),
  asy(async (req, res) => {
    const mes = mesRe.test(String(req.query.mes ?? ''))
      ? String(req.query.mes)
      : new Date().toISOString().slice(0, 7)
    const r = await pool.query<DispoDia>(
      `SELECT ${SEL_BASE} FROM disponibilidade
         WHERE tenant_id = $1 AND to_char(iso,'YYYY-MM') = $2
         ORDER BY iso`,
      [req.auth!.tenant, mes],
    )
    res.json({ mes, dias: r.rows })
  }),
)

// PUT /dispo/:iso — define a base do dia. Upsert atômico com guard de versão:
//  - linha ausente  → INSERT (version=1);
//  - version bate   → UPDATE (version+1);
//  - version diverge → ON CONFLICT ... WHERE falso ⇒ 0 linhas ⇒ 409 CONFLITO_VERSAO.
// Statement único: atomicidade pelo índice único (tenant_id, iso), sem FOR UPDATE.
dispoRouter.put(
  '/dispo/:iso',
  exigirPapel('gestao'),
  validarBody(putDispoSchema),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const iso = String(req.params.iso)
    if (!isoRe.test(iso) || Number.isNaN(Date.parse(iso))) {
      throw new ErroDominio('ISO_INVALIDA', 'Data inválida.', 400)
    }
    const { tarde, noite, madrugada, version } = req.body as z.infer<typeof putDispoSchema>

    const r = await pool.query<DispoDia>(
      `INSERT INTO disponibilidade (tenant_id, iso, tarde, noite, madrugada, version, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, 1, now())
       ON CONFLICT (tenant_id, iso) DO UPDATE
         SET tarde = $3, noite = $4, madrugada = $5,
             version = disponibilidade.version + 1, atualizado_em = now()
         WHERE disponibilidade.version = $6
       RETURNING ${SEL_BASE}`,
      [tenant, iso, tarde, noite, madrugada, version],
    )
    const row = r.rows[0]
    if (!row) {
      // Conflito: a linha existe mas version != enviada (RETURNING vazio no DO UPDATE).
      const atual = await pool.query<DispoDia>(
        `SELECT ${SEL_BASE} FROM disponibilidade WHERE tenant_id = $1 AND iso = $2`,
        [tenant, iso],
      )
      throw new ConflitoVersao(atual.rows[0] ?? null)
    }

    // Painel autenticado (sala privada = tenant_id) e app do cliente (sala pública = slug).
    emitir(tenant, 'dispo:updated', { iso: row.iso })
    const slug = await slugDeTenant(tenant)
    if (slug) emitirPublico(slug, 'dispo:updated', { iso: row.iso })

    res.json(row)
  }),
)
