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
import type {
  PedidoPublicoInput,
  EventoPublicoInput,
  AvaliacaoPublicaInput,
} from '../types/schemas-publicos.js'

interface LinhaCatalogo {
  id: string
  nome: string
  tamanhos: { rotulo: string; preco: number }[]
  dobravel: boolean
  preco_dobra: number
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
      return { ...ref, qty: it.qty, pCliente: it.p, dobrada: !!it.dobrada }
    })

    const catalogoIds = [...new Set(refs.map((r) => r.catalogoId))]
    // Resiliente à migration 011 não rodada (código sobe automático, schema à mão):
    // se as colunas de dobra não existem (42703), reprecifica sem dobra em vez de 500.
    let r: { rows: LinhaCatalogo[] }
    try {
      r = await pool.query<LinhaCatalogo>(
        `SELECT id, nome, tamanhos, dobravel, preco_dobra FROM catalogo_item
          WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tenantId, catalogoIds],
      )
    } catch (e) {
      if ((e as { code?: string })?.code !== '42703') throw e
      const legado = await pool.query<Omit<LinhaCatalogo, 'dobravel' | 'preco_dobra'>>(
        `SELECT id, nome, tamanhos FROM catalogo_item
          WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tenantId, catalogoIds],
      )
      r = { rows: legado.rows.map((x) => ({ ...x, dobravel: false, preco_dobra: 0 })) }
    }
    const mapa = new Map<string, LinhaCatalogo>(r.rows.map((x) => [x.id, x]))

    const itens: ItemPedido[] = []
    let total = 0
    for (const ref of refs) {
      const cat = mapa.get(ref.catalogoId)
      if (!cat) throw new ErroDominio('ITEM_INVALIDO', `Item fora do catálogo: ${ref.catalogoId}`, 422)
      const t = cat.tamanhos[ref.tamanhoIdx]
      if (!t) throw new ErroDominio('ITEM_INVALIDO', `Tamanho inexistente para ${ref.catalogoId}`, 422)

      const base = Number(t.preco)
      if (!Number.isFinite(base) || base < 0) {
        throw new ErroDominio('PRECO_INVALIDO', `Preço inválido no catálogo para ${ref.catalogoId}`, 500)
      }
      // Dobrada: adicional fixo do servidor, só se o item permite hoje. Se o
      // gestor desligou a dobra depois que o cliente montou o carrinho, cai no
      // preço normal (servidor é dono do preço) — nunca cobra a dobra "fantasma".
      const adicionalDobra = ref.dobrada && cat.dobravel ? Math.max(0, Number(cat.preco_dobra) || 0) : 0
      const preco = Math.round((base + adicionalDobra) * 100) / 100
      if (ref.pCliente != null && Math.abs(ref.pCliente - preco) > 0.001) {
        console.warn(`[edge] divergência de preço em ${ref.catalogoId}: cliente=${ref.pCliente} servidor=${preco}`)
      }

      const nome = adicionalDobra > 0 ? `${nomeItem(cat.nome, t.rotulo)} · Dobrada` : nomeItem(cat.nome, t.rotulo)
      itens.push({ nome, preco, qty: ref.qty })
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
   * Registra o feedback do cliente sobre um pedido (nota 1-5 + comentário).
   * Regras: o token opaco é a prova de posse do pedido; só pedido ENTREGUE pode
   * ser avaliado (fail-closed); no máximo UMA avaliação por pedido (PK por
   * token — segundo POST → 409). Devolve a senha para o emit do painel.
   */
  async ingestAvaliacao(
    tenantId: string,
    token: string,
    input: AvaliacaoPublicaInput,
  ): Promise<{ senha: number; nota: number }> {
    const p = await pool.query<{ senha: number; status: StatusPedido }>(
      `SELECT senha, status FROM pedido WHERE tenant_id = $1 AND token = $2::uuid`,
      [tenantId, token],
    )
    const pedido = p.rows[0]
    if (!pedido) throw new ErroDominio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.', 404)
    if (pedido.status !== 'entregue') {
      throw new ErroDominio('PEDIDO_NAO_ENTREGUE', 'Avalie após retirar o pedido.', 409)
    }

    const ins = await pool.query(
      `INSERT INTO avaliacao (tenant_id, token, nota, comentario)
         VALUES ($1, $2::uuid, $3, $4)
       ON CONFLICT (tenant_id, token) DO NOTHING`,
      [tenantId, token, input.nota, input.comentario],
    )
    if (!ins.rowCount) {
      throw new ErroDominio('AVALIACAO_EXISTENTE', 'Este pedido já foi avaliado.', 409)
    }
    return { senha: pedido.senha, nota: input.nota }
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

  /**
   * Status mínimo de uma solicitação de evento pelo protocolo público.
   * Sem PII, sem valor interno de sistema — apenas o suficiente para o cliente
   * saber se a solicitação foi aceita/recusada e (quando orçada) o valor.
   * `motivo_recusa` só é retornado quando o status é 'recusado'.
   */
  async statusAgendaPorProtocolo(
    tenantId: string,
    protocolo: string,
  ): Promise<{
    status: import('../types/domain.js').StatusAgenda
    data: string
    hora: string
    valor: string
    motivo_recusa: string | null
  }> {
    const r = await pool.query<{
      status: import('../types/domain.js').StatusAgenda
      data: string
      hora: string
      valor: string
      motivo_recusa: string | null
    }>(
      `SELECT status, to_char(data, 'YYYY-MM-DD') AS data, hora, valor::text AS valor,
              CASE WHEN status = 'recusado' THEN motivo_recusa ELSE NULL END AS motivo_recusa
         FROM agenda
        WHERE tenant_id = $1 AND protocolo = $2`,
      [tenantId, protocolo],
    )
    const row = r.rows[0]
    if (!row) throw new ErroDominio('AGENDA_NAO_ENCONTRADA', 'Solicitação não encontrada.', 404)
    return row
  },
}

export type { Pedido }
