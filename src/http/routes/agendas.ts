// Rotas de AGENDA — leitura (gestão/PDV/painel) e mutações (gestão-only), sob a
// fronteira de auth. Mutação de estado passa pelo AgendaService (FOR UPDATE +
// transição válida + outbox durável). PII (telefone/email) PODE voltar no GET
// autenticado, mas NUNCA entra no payload de emit nem em log.
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { emitir, emitirPublico } from '../../realtime/io.js'
import { slugDeTenant } from '../../db/tenant.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { AgendaService, type AgendaBase } from '../../services/AgendaService.js'
import { eventoPublicoSchema, type EventoPublicoInput } from '../../types/schemas-publicos.js'
import { horaDoSlot, type SlotEvento } from '../../types/acl.js'
import type { StatusAgenda } from '../../types/domain.js'

export const agendasRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

// Colunas SEM PII p/ RETURNING de criação — espelham AgendaBase.
const COLS_BASE = 'id, cliente, tipo, data, hora, local, pessoas, valor, obs, status, origem, protocolo'

const dataRe = /^\d{4}-\d{2}-\d{2}$/

// Filtro do GET (query string).
const listarQuerySchema = z.object({
  status: z.enum(['solicitado', 'agendado', 'confirmado', 'recusado']).optional(),
  de: z.string().regex(dataRe).optional(),
  ate: z.string().regex(dataRe).optional(),
})

// Orçar: zod aceita qualquer número FINITO; o NÃO-negativo é regra do AgendaService
// (VALOR_INVALIDO 422). Assim `valor` negativo → 422 (não 400), como pede o contrato de teste.
const orcarSchema = z.object({ valor: z.number().finite() })

// Transição: 'solicitado' não é destino válido; motivo obrigatório ao recusar.
const statusSchema = z
  .object({
    status: z.enum(['agendado', 'confirmado', 'recusado']),
    motivo: z.string().max(300).optional(),
  })
  .refine((v) => v.status !== 'recusado' || !!v.motivo?.trim(), {
    message: 'motivo é obrigatório ao recusar',
    path: ['motivo'],
  })

// GET /agendas?status=&de=&ate= — leitura (inclui PII; rota autenticada).
agendasRouter.get(
  '/agendas',
  exigirPapel('gestao', 'pdv', 'painel'),
  asy(async (req, res) => {
    const q = listarQuerySchema.safeParse(req.query)
    if (!q.success) {
      res.status(400).json({ erro: 'Query inválida.', codigo: 'VALIDACAO', detalhes: q.error.flatten() })
      return
    }
    // Monta o filtro sem chaves undefined (exactOptionalPropertyTypes).
    const filtro: { status?: StatusAgenda; de?: string; ate?: string } = {}
    if (q.data.status) filtro.status = q.data.status
    if (q.data.de) filtro.de = q.data.de
    if (q.data.ate) filtro.ate = q.data.ate
    const rows = await AgendaService.listar(req.auth!.tenant, filtro)
    res.json(rows)
  }),
)

// POST /agendas — evento criado pela própria operação (origem='gestao'). Reusa o
// shape do EdgeIngest; resposta/emit SEM PII (RETURNING só colunas base).
agendasRouter.post(
  '/agendas',
  exigirPapel('gestao'),
  validarBody(eventoPublicoSchema),
  asy(async (req, res) => {
    const b = req.body as EventoPublicoInput
    const tenant = req.auth!.tenant
    const id = 'ag' + Date.now().toString()
    const hora = horaDoSlot(b.slot as SlotEvento)
    const r = await pool.query<AgendaBase>(
      `INSERT INTO agenda
         (tenant_id, id, cliente, telefone, email, tipo, data, hora, local, pessoas, valor, obs, status, origem, protocolo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, 0, $11, 'solicitado', 'gestao', NULL)
       RETURNING ${COLS_BASE}`,
      [tenant, id, b.nome, b.telefone, b.email, b.tipo, b.data, hora, b.local, b.pessoas, b.obs],
    )
    const row = r.rows[0]!
    emitir(tenant, 'agenda:updated', row)
    res.status(201).json(row)
  }),
)

// PATCH /agendas/:id/valor — orçar (gestão).
agendasRouter.patch(
  '/agendas/:id/valor',
  exigirPapel('gestao'),
  validarBody(orcarSchema),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const row = await AgendaService.orcar(tenant, String(req.params.id), req.body.valor)
    emitir(tenant, 'agenda:updated', row)
    res.json(row)
  }),
)

// PATCH /agendas/:id/status — transicionar (gestão).
agendasRouter.patch(
  '/agendas/:id/status',
  exigirPapel('gestao'),
  validarBody(statusSchema),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const motivo: string | null = req.body.motivo ?? null
    const row = await AgendaService.transicionar(tenant, String(req.params.id), req.body.status, motivo)
    emitir(tenant, 'agenda:updated', row)
    // Ocupação de slot pode ter mudado ('agendado'/'confirmado' ocupam; 'recusado' libera)
    // → manda a base pública recomputar. Hint de exibição: over-emit é seguro, sem PII.
    emitir(tenant, 'dispo:updated', { iso: row.data })
    const slug = await slugDeTenant(tenant)
    if (slug) emitirPublico(slug, 'dispo:updated', { iso: row.data })
    res.json(row)
  }),
)
