// Superfície PÚBLICA v2 — APP DO CLIENTE. Zero-trust: rate limit por IP+tenant,
// zod estrito, ACL + re-precificação no servidor, status/valor/tenant/senha/preço
// forçados server-side. Nenhuma PII ou custo interno sai daqui. Ver SECURITY-BORDA.md.
import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from '../../db/pool.js'
import { emitir } from '../../realtime/io.js'
import { validarBody } from '../middleware/validate.js'
import { pedidoPublicoSchema, eventoPublicoSchema } from '../../types/schemas-publicos.js'
import { encodeRefItem } from '../../types/acl.js'
import { EdgeIngestService } from '../../services/EdgeIngestService.js'
import { ErroDominio } from '../../types/domain.js'

export const publicRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

async function tenantIdPorSlug(slug: string): Promise<string> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM tenant WHERE slug=$1`, [slug])
  const id = r.rows[0]?.id
  if (!id) throw new ErroDominio('TENANT_NAO_ENCONTRADO', 'Recurso não encontrado.', 404)
  return id
}

// Cor por categoria — espelha data/menu.js do app do cliente (para o app manter o visual).
const COR_CATEGORIA: Readonly<Record<string, string>> = {
  Especiais: '#f5a623',
  Balada: '#ff5da2',
  Aperol: '#ff7a2f',
  Campari: '#e23b3b',
  Batidinhas: '#b07be0',
  Caipirinhas: '#b6e84c',
  Doses: '#4ccfd6',
  Potes: '#f0c14b',
  Baldes: '#6aa6ff',
}

// ---------- MENU público no SHAPE DO APP DO CLIENTE ----------
// Cada tamanho vira uma entrada plana; o `id` é a referência opaca que o app
// devolve no checkout. Assim o app mantém seu modelo { id, n, p, v, d, cat, color }
// e o servidor continua dono do preço.
publicRouter.get(
  '/public/:tenant/menu',
  asy(async (req, res) => {
    const tid = await tenantIdPorSlug(String(req.params.tenant))
    const r = await pool.query<{ id: string; cat: string; nome: string; descricao: string; tamanhos: { rotulo: string; preco: number }[]; img: string }>(
      `SELECT id, cat, nome, descricao, tamanhos, img
         FROM catalogo_item WHERE tenant_id=$1 ORDER BY ordem, nome`,
      [tid],
    )
    const itens: Array<{ id: string; n: string; p: number; v: string; d: string; cat: string; color: string; img: string }> = []
    for (const x of r.rows) {
      const cor = COR_CATEGORIA[x.cat] ?? '#f5a623'
      x.tamanhos.forEach((t, idx) => {
        itens.push({
          id: encodeRefItem(x.id, idx),
          n: x.nome,
          p: Number(t.preco),
          v: t.rotulo,
          d: x.descricao,
          cat: x.cat,
          color: cor,
          img: x.img,
        })
      })
    }
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json(itens)
  }),
)

// ---------- DISPONIBILIDADE ----------
publicRouter.get(
  '/public/:tenant/disponibilidade',
  asy(async (req, res) => {
    const tid = await tenantIdPorSlug(String(req.params.tenant))
    const mes = String(req.query.mes ?? '').match(/^\d{4}-\d{2}$/) ? String(req.query.mes) : new Date().toISOString().slice(0, 7)
    // Disponibilidade PÚBLICA = base declarada MENOS ocupação de agenda aceita.
    // Ocupa quem está 'agendado'/'confirmado' no mesmo dia+período; o período deriva
    // da hora canônica do slot (acl.MAPA_SLOT: 14:00/19:00/23:00). Um único snapshot
    // (subqueries no mesmo SELECT) elimina a race entre "ler base" e "ler ocupação".
    // Isto é HINT de exibição, não reserva — a verdade da concorrência é o FOR UPDATE
    // do booking. Índice agenda_status_ix (tenant_id, status, data) cobre os NOT EXISTS.
    const manual = await pool.query<{ iso: string; tarde: boolean; noite: boolean; madrugada: boolean }>(
      `SELECT to_char(d.iso,'YYYY-MM-DD') iso,
              d.tarde     AND NOT EXISTS (SELECT 1 FROM agenda a
                 WHERE a.tenant_id=d.tenant_id AND a.data=d.iso
                   AND a.status IN ('agendado','confirmado') AND a.hora='14:00') AS tarde,
              d.noite     AND NOT EXISTS (SELECT 1 FROM agenda a
                 WHERE a.tenant_id=d.tenant_id AND a.data=d.iso
                   AND a.status IN ('agendado','confirmado') AND a.hora='19:00') AS noite,
              d.madrugada AND NOT EXISTS (SELECT 1 FROM agenda a
                 WHERE a.tenant_id=d.tenant_id AND a.data=d.iso
                   AND a.status IN ('agendado','confirmado') AND a.hora='23:00') AS madrugada
         FROM disponibilidade d
        WHERE d.tenant_id=$1 AND to_char(d.iso,'YYYY-MM')=$2`,
      [tid, mes],
    )
    const dias: Record<string, { tarde: boolean; noite: boolean; madrugada: boolean }> = {}
    for (const d of manual.rows) dias[d.iso] = { tarde: d.tarde, noite: d.noite, madrugada: d.madrugada }
    res.setHeader('Cache-Control', 'public, max-age=30')
    res.json({ mes, dias })
  }),
)

// ---------- rate limits (IP + tenant) ----------
const limitePedido = rateLimit({
  windowMs: Number(process.env.PUBLIC_RATE_JANELA_MS ?? 60_000),
  max: Number(process.env.PUBLIC_RATE_PEDIDO_MAX ?? 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.tenant}:pedido`,
  message: { erro: 'Muitos pedidos. Aguarde um instante.', codigo: 'RATE_LIMIT' },
})
const limiteEvento = rateLimit({
  windowMs: Number(process.env.PUBLIC_RATE_JANELA_MS ?? 60_000),
  max: Number(process.env.PUBLIC_RATE_EVENTO_MAX ?? 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.tenant}:evento`,
  message: { erro: 'Muitas solicitações. Tente mais tarde.', codigo: 'RATE_LIMIT' },
})

// ---------- PEDIDO do app → domínio (senha atômica, idempotente) ----------
publicRouter.post(
  '/public/:tenant/pedidos',
  limitePedido,
  validarBody(pedidoPublicoSchema),
  asy(async (req, res) => {
    const tid = await tenantIdPorSlug(String(req.params.tenant))
    const opKey = req.header('x-idempotency-key') ?? null
    const r = await EdgeIngestService.ingestPedido(tid, req.body, opKey)

    // A gestão/painel recebe o pedido em tempo real (room autenticada = tenant-id).
    if (!r.replay) {
      emitir(tid, 'order:created', {
        senha: r.senha, hora: r.hora, status: r.status, pago: r.pago, items: r.itens,
      })
    }
    res.status(r.replay ? 200 : 201).json({
      token: r.token, senha: r.senha, hora: r.hora, status: r.status, pago: r.pago, total: r.total,
    })
  }),
)

// ---------- ACOMPANHAMENTO por token opaco ----------
publicRouter.get(
  '/public/:tenant/pedido/:token',
  asy(async (req, res) => {
    const tid = await tenantIdPorSlug(String(req.params.tenant))
    const token = String(req.params.token)
    if (!/^[0-9a-f-]{36}$/i.test(token)) throw new ErroDominio('TOKEN_INVALIDO', 'Token inválido.', 400)
    const s = await EdgeIngestService.statusPorToken(tid, token)
    res.setHeader('Cache-Control', 'no-store')
    res.json(s)
  }),
)

// ---------- EVENTO completo → agenda { solicitado, app_cliente } ----------
publicRouter.post(
  '/public/:tenant/eventos',
  limiteEvento,
  validarBody(eventoPublicoSchema),
  asy(async (req, res) => {
    const tid = await tenantIdPorSlug(String(req.params.tenant))
    const r = await EdgeIngestService.ingestEvento(tid, req.body)
    emitir(tid, 'agenda:updated', { origem: 'app_cliente', id: r.id, protocolo: r.protocolo })
    res.status(202).json({ protocolo: r.protocolo, mensagem: 'Solicitação recebida.' })
  }),
)
