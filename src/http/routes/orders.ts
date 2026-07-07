// Rotas de pedido — mapeiam 1:1 as ações do SistemaContext. Toda mutação passa pelo
// OrderService (escritor único) e emite evento Socket.IO.
import { Router, type Request, type Response, type NextFunction } from 'express'
import { OrderService } from '../../services/OrderService.js'
import { EdgeIngestService } from '../../services/EdgeIngestService.js'
import { emitir, emitirStatusPedido } from '../../realtime/io.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { criarPedidoSchema, marcarStatusSchema, entregaSchema, reorderSchema } from '../../types/schemas.js'
import type { Pedido } from '../../types/domain.js'

export const ordersRouter = Router()

// Empurra o status ao app do cliente que acompanha pelo token. Best-effort:
// uma falha aqui NUNCA compromete a resposta ao PDV.
async function notificarCliente(tenantId: string, pedido: Pedido): Promise<void> {
  try {
    const token = await EdgeIngestService.tokenPorSenha(tenantId, pedido.senha)
    if (token) {
      emitirStatusPedido(token, { senha: pedido.senha, status: pedido.status, hora: pedido.hora, pago: pedido.pago })
    }
  } catch (e) {
    console.warn('[orders] falha ao notificar cliente:', e instanceof Error ? e.message : e)
  }
}

// A autenticação é aplicada no app (fronteira em app.ts, ANTES deste router).
// Aqui fica só o RBAC fino por-rota via exigirPapel().
const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

// hidratação do painel/relatório
ordersRouter.get(
  '/orders',
  asy(async (req, res) => {
    const snap = await OrderService.snapshot(req.auth!.tenant)
    res.json(snap)
  }),
)

// gerar() — idempotente, senha e hora do servidor
ordersRouter.post(
  '/orders',
  exigirPapel('gestao', 'pdv'),
  validarBody(criarPedidoSchema),
  asy(async (req, res) => {
    const opKey = req.header('x-idempotency-key') ?? null
    const { pedido, replay } = await OrderService.criar(req.auth!.tenant, req.body, opKey)
    if (!replay) emitir(req.auth!.tenant, 'order:created', pedido)
    res.status(replay ? 200 : 201).json(pedido)
  }),
)

// marcar(sn, status)
ordersRouter.patch(
  '/orders/:senha/status',
  exigirPapel('gestao', 'pdv', 'painel'),
  validarBody(marcarStatusSchema),
  asy(async (req, res) => {
    const senha = Number(req.params.senha)
    const pedido = await OrderService.marcarStatus(req.auth!.tenant, senha, req.body.status)
    emitir(req.auth!.tenant, 'order:updated', pedido)
    await notificarCliente(req.auth!.tenant, pedido)
    res.json(pedido)
  }),
)

// togglePago(sn)
ordersRouter.patch(
  '/orders/:senha/pago',
  exigirPapel('gestao', 'pdv', 'painel'),
  asy(async (req, res) => {
    const pedido = await OrderService.togglePago(req.auth!.tenant, Number(req.params.senha))
    emitir(req.auth!.tenant, 'order:updated', pedido)
    res.json(pedido)
  }),
)

// confirmarEntrega / entregarMesmoAssim / receberEEntregar
ordersRouter.patch(
  '/orders/:senha/entrega',
  exigirPapel('gestao', 'pdv', 'painel'),
  validarBody(entregaSchema),
  asy(async (req, res) => {
    const pedido = await OrderService.entregar(req.auth!.tenant, Number(req.params.senha), req.body.receberAntes)
    emitir(req.auth!.tenant, 'order:updated', pedido)
    await notificarCliente(req.auth!.tenant, pedido)
    res.json(pedido)
  }),
)

// reordenar(target) — concorrência otimista via If-Match
ordersRouter.patch(
  '/panel/order',
  exigirPapel('gestao', 'painel'),
  validarBody(reorderSchema),
  asy(async (req, res) => {
    const version = Number(req.header('if-match') ?? 'NaN')
    if (Number.isNaN(version)) {
      res.status(428).json({ erro: 'Header If-Match (version) obrigatório.', codigo: 'SEM_VERSION' })
      return
    }
    const painel = await OrderService.reordenar(req.auth!.tenant, req.body.sort, version)
    emitir(req.auth!.tenant, 'panel:reordered', { sort: painel.sort, version: painel.version })
    res.json(painel)
  }),
)
