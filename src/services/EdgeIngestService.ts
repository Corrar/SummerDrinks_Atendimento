// EdgeIngestService — ponte entre o APP DO CLIENTE (borda pública) e o domínio.
// Recebe pedido/evento já validados por zod, aplica a ACL, re-precifica pelo
// catálogo (servidor é a fonte da verdade do preço) e delega a escrita ao
// OrderService (escritor único de pedidos) ou insere a agenda transacionalmente.
//
// Nunca confia em preço/senha/valor/status vindos do cliente.

import { randomUUID } from 'node:crypto'
import { pool, withTransaction } from '../db/pool.js'
import { OrderService } from './OrderService.js'
import {
  decodeRefItem,
  nomeItem,
  pagamentoDoMetodo,
  horaDoSlot,
  type SlotEvento,
} from '../types/acl.js'
import { ErroDominio, type ItemPedido, type Pedido, type StatusPedido } from '../types/domain.js'
import type { PedidoPublicoInput, EventoPublicoInput } from '../types/schemas-publicos.js'

interface LinhaCatalogo {
  id: string
  nome: string
  tamanhos: { rotulo: string; preco: number }[]
}

export interface ResultadoPedidoPublico {
  token: string
  senha: number
  hora: string
  status: StatusPedido
  pago: boolean
  itens: ItemPedido[]
  total: number
  replay: boolean
}

export interface ResultadoEventoPublico {
  protocolo: string
  id: string
}

function diaHoje(): string {
  return new Date().toISOString().slice(0, 10)
}

export const EdgeIngestService = {
  /**
   * Re-precifica os itens do cliente pelo catálogo do tenant. O `id` do cliente
   * é a referência "catalogoId__tamanhoIdx". Preço divergente do cliente é
   * ignorado (apenas logado). Item inexistente → 422 (nunca adivinhar preço).
   */
  async _reprecificar(tenantId: string, input: PedidoPublicoInput): Promise<{ itens: ItemPedido[]; total: number }> {
    const refs = input.itens.map((it) => {
      const ref = decodeRefItem(it.id)
      if (!ref) throw new ErroDominio('ITEM_INVALIDO', `Item com referência inválida: ${it.id}`, 422)
      return { ...ref, qty: it.qty, pCliente: it.p }
    })

    const catalogoIds = [...new Set(refs.map((r) => r.catalogoId))]
    const r = await pool.query<LinhaCatalogo>(
      `SELECT id, nome, tamanhos FROM catalogo_item
        WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, catalogoIds],
    )
    const mapa = new Map<string, LinhaCatalogo>(r.rows.map((x) => [x.id, x]))

    const itens: ItemPedido[] = []
    let total = 0
    for (const ref of refs) {
      const cat = mapa.get(ref.catalogoId)
      if (!cat) throw new ErroDominio('ITEM_INVALIDO', `Item fora do catálogo: ${ref.catalogoId}`, 422)
      const t = cat.tamanhos[ref.tamanhoIdx]
      if (!t) throw new ErroDominio('ITEM_INVALIDO', `Tamanho inexistente para ${ref.catalogoId}`, 422)

      const preco = Number(t.preco)
      if (!Number.isFinite(preco) || preco < 0) {
        throw new ErroDominio('PRECO_INVALIDO', `Preço inválido no catálogo para ${ref.catalogoId}`, 500)
      }
      if (ref.pCliente != null && Math.abs(ref.pCliente - preco) > 0.001) {
        console.warn(`[edge] divergência de preço em ${ref.catalogoId}: cliente=${ref.pCliente} servidor=${preco}`)
      }

      itens.push({ nome: nomeItem(cat.nome, t.rotulo), preco, qty: ref.qty })
      total += preco * ref.qty
    }
    return { itens, total: Math.round(total * 100) / 100 }
  },

  /**
   * Ingesta um pedido do app do cliente:
   *  1. re-precifica pelo catálogo,
   *  2. delega a criação ao OrderService (idempotente + senha atômica),
   *  3. vincula/recupera um token público opaco para acompanhamento.
   * Retorna dados mínimos e seguros para o app.
   */
  async ingestPedido(
    tenantId: string,
    input: PedidoPublicoInput,
    opKey: string | null,
  ): Promise<ResultadoPedidoPublico> {
    const { itens, total } = await this._reprecificar(tenantId, input)

    const dominio = {
      pagamento: pagamentoDoMetodo(input.pagamento),
      cliente: input.cliente,
      pago: input.pago,
      items: itens,
    }
    const { pedido, replay } = await OrderService.criar(tenantId, dominio, opKey)

    // Token público idempotente: mantém o existente em replay; cria se ausente.
    const novo = randomUUID()
    const upd = await pool.query<{ token: string }>(
      `UPDATE pedido
          SET token = COALESCE(token, $4::uuid),
              origem = 'app_cliente'
        WHERE tenant_id = $1 AND dia = $2 AND senha = $3
        RETURNING token`,
      [tenantId, diaHoje(), pedido.senha, novo],
    )
    const token = upd.rows[0]?.token ?? novo

    return {
      token,
      senha: pedido.senha,
      hora: pedido.hora,
      status: pedido.status,
      pago: pedido.pago,
      itens: pedido.items,
      total,
      replay,
    }
  },

  /** Status mínimo de um pedido pelo token público. Sem PII, sem preço interno. */
  async statusPorToken(
    tenantId: string,
    token: string,
  ): Promise<{ senha: number; status: StatusPedido; hora: string; pago: boolean }> {
    const r = await pool.query<{ senha: number; status: StatusPedido; hora: string; pago: boolean }>(
      `SELECT senha, status, hora, pago FROM pedido
        WHERE tenant_id = $1 AND token = $2::uuid`,
      [tenantId, token],
    )
    const row = r.rows[0]
    if (!row) throw new ErroDominio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.', 404)
    return row
  },

  /**
   * Ingesta uma solicitação de evento COMPLETA → agenda { solicitado, app_cliente }.
   * Grava na mesma transação um registro de outbox para o pipeline de notificação
   * (a gestão é avisada; futuramente o cliente recebe confirmação por WhatsApp/push).
   */
  async ingestEvento(tenantId: string, input: EventoPublicoInput): Promise<ResultadoEventoPublico> {
    const agora = Date.now()
    const id = 'ag' + agora.toString()
    const protocolo = 'SD-' + agora.toString(36).toUpperCase().slice(-6)
    const hora = horaDoSlot(input.slot as SlotEvento)

    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO agenda
           (tenant_id, id, cliente, telefone, email, tipo, data, hora, local, pessoas, valor, obs, status, origem, protocolo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, 0, $11, 'solicitado', 'app_cliente', $12)`,
        [tenantId, id, input.nome, input.telefone, input.email, input.tipo, input.data, hora, input.local, input.pessoas, input.obs, protocolo],
      )
      await tx.query(
        `INSERT INTO outbox (tenant_id, tipo, payload)
         VALUES ($1, 'evento:recebido', $2::jsonb)`,
        [tenantId, JSON.stringify({ id, protocolo, tipo: input.tipo, data: input.data, slot: input.slot })],
      )
    })

    return { protocolo, id }
  },

  /**
   * Descobre o token público de um pedido pela senha do dia. Usado pelo router de
   * pedidos para empurrar 'pronto'/'entregue' à sala pública do cliente.
   */
  async tokenPorSenha(tenantId: string, senha: number): Promise<string | null> {
    const r = await pool.query<{ token: string | null }>(
      `SELECT token FROM pedido WHERE tenant_id = $1 AND dia = $2 AND senha = $3`,
      [tenantId, diaHoje(), senha],
    )
    return r.rows[0]?.token ?? null
  },
}

export type { Pedido }
