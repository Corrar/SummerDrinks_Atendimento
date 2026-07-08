// Rotas de CONFIG (horários/locais/contatos), sob a fronteira de auth. 1 linha por
// tenant. GET (gestão/pdv/painel) devolve a config COMPLETA — inclui telefone/whatsapp
// (PII de contato) porque é rota autenticada — mais `version` para eco no PUT. PUT
// (gestão-only) faz upsert com concorrência otimista (espelha 005/painel_estado).
// A borda PÚBLICA (public.ts) expõe SÓ horarios+locais — nunca telefone/whatsapp.
// Emit 'config:updated' na sala privada SEM PII (só horarios/locais/version).
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { emitir } from '../../realtime/io.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { ConflitoVersao, type Config } from '../../types/domain.js'

export const configRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

const horaRe = /^\d{2}:\d{2}$/

const horarioSchema = z
  .object({
    dia: z.string().min(1).max(20),
    curto: z.string().min(1).max(10),
    aberto: z.boolean(),
    abre: z.string().regex(horaRe),
    fecha: z.string().regex(horaRe),
  })
  .strict()

const localSchema = z
  .object({
    id: z.string().min(1).max(40),
    nome: z.string().min(1).max(80),
    endereco: z.string().max(200),
    ativo: z.boolean(),
  })
  .strict()

const putConfigSchema = z
  .object({
    horarios: z.array(horarioSchema).max(14),
    locais: z.array(localSchema).max(50),
    telefone: z.string().max(30),
    whatsapp: z.string().max(30),
    version: z.number().int().nonnegative(),
  })
  .strict()

const SEL = 'horarios, locais, telefone, whatsapp, version'

// GET /config — config completa da gestão (inclui PII de contato; rota autenticada).
// Sem linha ainda → default vazio v0 (o PUT com version=0 então cria).
configRouter.get(
  '/config',
  exigirPapel('gestao', 'pdv', 'painel'),
  asy(async (req, res) => {
    const r = await pool.query<Config>(
      `SELECT ${SEL} FROM config WHERE tenant_id = $1`,
      [req.auth!.tenant],
    )
    const row =
      r.rows[0] ?? { horarios: [], locais: [], telefone: '', whatsapp: '', version: 0 }
    res.json(row)
  }),
)

// PUT /config — substitui a config inteira (gestão). Upsert atômico com guard de versão:
// ausente→INSERT v1; version bate→UPDATE v+1; diverge→ON CONFLICT WHERE falso→409.
configRouter.put(
  '/config',
  exigirPapel('gestao'),
  validarBody(putConfigSchema),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const { horarios, locais, telefone, whatsapp, version } = req.body as z.infer<
      typeof putConfigSchema
    >

    const r = await pool.query<Config>(
      `INSERT INTO config (tenant_id, horarios, locais, telefone, whatsapp, version, atualizado_em)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, 1, now())
       ON CONFLICT (tenant_id) DO UPDATE
         SET horarios = $2::jsonb, locais = $3::jsonb, telefone = $4, whatsapp = $5,
             version = config.version + 1, atualizado_em = now()
         WHERE config.version = $6
       RETURNING ${SEL}`,
      [tenant, JSON.stringify(horarios), JSON.stringify(locais), telefone, whatsapp, version],
    )
    const row = r.rows[0]
    if (!row) {
      const atual = await pool.query<Config>(
        `SELECT ${SEL} FROM config WHERE tenant_id = $1`,
        [tenant],
      )
      throw new ConflitoVersao(atual.rows[0] ?? null)
    }

    // Painel autenticado sincroniza — SEM PII (telefone/whatsapp fora do emit).
    emitir(tenant, 'config:updated', {
      horarios: row.horarios,
      locais: row.locais,
      version: row.version,
    })
    res.json(row)
  }),
)
