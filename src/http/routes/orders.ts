// Rotas de pedido — mapeiam 1:1 as ações do SistemaContext. Toda mutação passa pelo
// OrderService (escritor único) e emite evento Socket.IO.
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { OrderService } from '../../services/OrderService.js'
import { EdgeIngestService } from '../../services/EdgeIngestService.js'
import { emitir, emitirStatusPedido } from '../../realtime/io.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { criarPedidoSchema, marcarStatusSchema, entregaSchema, reorderSchema } from '../../types/schemas.js'
import { ErroDominio, type Pedido } from '../../types/domain.js'

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

// ---------- relatório agregado por período (gestão) ----------
// Agregação 100% no SQL (o histórico pode ter milhares de linhas — nunca
// hidratar tudo no Node). Faixa limitada a 400 dias. Datas inclusivas.
const relatorioQuerySchema = z
  .object({
    de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((q) => q.de <= q.ate, { message: 'de deve ser <= ate' })

ordersRouter.get(
  '/orders/relatorio',
  exigirPapel('gestao'),
  asy(async (req, res) => {
    const q = relatorioQuerySchema.safeParse(req.query)
    if (!q.success) {
      throw new ErroDominio('PERIODO_INVALIDO', 'Período inválido (use de=YYYY-MM-DD&ate=YYYY-MM-DD).', 400)
    }
    const { de, ate } = q.data
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000
    if (dias > 400) throw new ErroDominio('PERIODO_LONGO', 'Período máximo: 400 dias.', 422)
    const tenant = req.auth!.tenant

    // 1) por dia (também alimenta os totais e o breakdown de pagamento)
    const porDiaQ = pool.query<{ dia: string; pagamento: string; qtd: string; total: string; nao_pago: string }>(
      `SELECT to_char(p.dia,'YYYY-MM-DD') AS dia, p.pagamento,
              count(*)::text AS qtd,
              COALESCE(sum(t.total),0)::text AS total,
              COALESCE(sum(t.total) FILTER (WHERE NOT p.pago),0)::text AS nao_pago
         FROM pedido p
         CROSS JOIN LATERAL (
           SELECT sum((i->>'preco')::numeric * (i->>'qty')::int) AS total
             FROM jsonb_array_elements(p.items) i
         ) t
        WHERE p.tenant_id = $1 AND p.dia BETWEEN $2 AND $3
        GROUP BY p.dia, p.pagamento
        ORDER BY p.dia`,
      [tenant, de, ate],
    )

    // 2) mais vendidos (top 10 por unidades)
    const maisVendidosQ = pool.query<{ nome: string; qtd: string; total: string }>(
      `SELECT i->>'nome' AS nome,
              sum((i->>'qty')::int)::text AS qtd,
              sum((i->>'preco')::numeric * (i->>'qty')::int)::text AS total
         FROM pedido p, jsonb_array_elements(p.items) i
        WHERE p.tenant_id = $1 AND p.dia BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY sum((i->>'qty')::int) DESC LIMIT 10`,
      [tenant, de, ate],
    )

    // 3) eventos aceitos no período (receita orçada da agenda)
    const eventosQ = pool.query<{ qtd: string; receita: string }>(
      `SELECT count(*)::text AS qtd, COALESCE(sum(valor),0)::text AS receita
         FROM agenda
        WHERE tenant_id = $1 AND data BETWEEN $2 AND $3
          AND status IN ('agendado','confirmado')`,
      [tenant, de, ate],
    )

    const [porDiaR, maisVendidosR, eventosR] = await Promise.all([porDiaQ, maisVendidosQ, eventosQ])

    // Consolida em Node (linhas já agregadas — punhado, não milhares).
    const porDiaMap = new Map<string, { dia: string; qtd: number; total: number }>()
    const porPagamento = new Map<string, { pagamento: string; qtd: number; total: number }>()
    let pedidos = 0
    let faturamento = 0
    let aReceber = 0
    for (const r of porDiaR.rows) {
      const qtd = Number(r.qtd)
      const total = Number(r.total)
      pedidos += qtd
      faturamento += total
      aReceber += Number(r.nao_pago)
      const d = porDiaMap.get(r.dia) ?? { dia: r.dia, qtd: 0, total: 0 }
      d.qtd += qtd
      d.total += total
      porDiaMap.set(r.dia, d)
      const pg = porPagamento.get(r.pagamento) ?? { pagamento: r.pagamento, qtd: 0, total: 0 }
      pg.qtd += qtd
      pg.total += total
      porPagamento.set(r.pagamento, pg)
    }
    const eventos = eventosR.rows[0] ?? { qtd: '0', receita: '0' }

    res.json({
      de,
      ate,
      pedidos,
      faturamento,
      ticketMedio: pedidos > 0 ? faturamento / pedidos : 0,
      aReceber,
      porDia: [...porDiaMap.values()],
      porPagamento: [...porPagamento.values()],
      maisVendidos: maisVendidosR.rows.map((r) => ({ nome: r.nome, qtd: Number(r.qtd), total: Number(r.total) })),
      eventos: { qtd: Number(eventos.qtd), receita: Number(eventos.receita) },
    })
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
