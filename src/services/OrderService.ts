// OrderService — ESCRITOR ÚNICO de pedidos. Toda mutação de pedido passa por aqui.
// Garante: alocação atômica de senha, idempotência (op_key), transições válidas,
// projeção do painel. Nenhum controller escreve em `pedido` diretamente.

import { pool, withTransaction, type Tx } from '../db/pool.js'
import {
  type Pedido,
  type StatusPedido,
  type PainelEstado,
  TRANSICOES,
  TransicaoInvalida,
  ErroDominio,
  ConflitoVersao,
} from '../types/domain.js'
import type { CriarPedidoInput } from '../types/schemas.js'

function horaServidor(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
function diaHoje(): string {
  return new Date().toISOString().slice(0, 10)
}

interface LinhaPedido {
  senha: number
  hora: string
  pagamento: Pedido['pagamento']
  status: StatusPedido
  cliente: string
  pago: boolean
  items: Pedido['items']
}
const toPedido = (r: LinhaPedido): Pedido => ({
  senha: r.senha,
  hora: r.hora,
  pagamento: r.pagamento,
  status: r.status,
  cliente: r.cliente,
  pago: r.pago,
  items: r.items,
})

export const OrderService = {
  /**
   * Cria um pedido de forma idempotente e aloca a senha atomicamente.
   * Replay com o mesmo opKey retorna o pedido existente (não duplica).
   */
  async criar(tenantId: string, input: CriarPedidoInput, opKey: string | null): Promise<{ pedido: Pedido; replay: boolean }> {
    return withTransaction(async (tx) => {
      const dia = diaHoje()

      // idempotência: opKey já processado? devolve o mesmo pedido.
      if (opKey) {
        // Serializa por (tenant, op_key) ANTES de alocar senha. O advisory lock é de
        // transação (liberado no commit/rollback): concorrentes com o MESMO op_key
        // esperam o vencedor commitar e então enxergam a linha no SELECT abaixo —
        // matando a corrida read-after-write SEM desperdiçar senha nos perdedores.
        await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${tenantId}:${opKey}`])
        const dup = await tx.query<LinhaPedido>(
          `SELECT senha, hora, pagamento, status, cliente, pago, items
             FROM pedido WHERE tenant_id = $1 AND op_key = $2`,
          [tenantId, opKey],
        )
        const existente = dup.rows[0]
        if (existente) return { pedido: toPedido(existente), replay: true }
      }

      // alocação atômica da senha por (tenant, dia) — sem corrida, sem buraco.
      const cont = await tx.query<{ ultima: number }>(
        `INSERT INTO senha_contador (tenant_id, dia, ultima)
           VALUES ($1, $2, 45)
         ON CONFLICT (tenant_id, dia)
           DO UPDATE SET ultima = senha_contador.ultima + 1
         RETURNING ultima`,
        [tenantId, dia],
      )
      const senha = cont.rows[0]!.ultima
      const hora = horaServidor()

      // O advisory lock acima já elegeu 1 vencedor por op_key, então este INSERT é
      // livre de corrida: o perdedor nunca chega aqui (retornou replay no SELECT).
      const ins = await tx.query<LinhaPedido>(
        `INSERT INTO pedido (tenant_id, dia, senha, hora, pagamento, status, cliente, pago, items, op_key)
           VALUES ($1,$2,$3,$4,$5,'preparo',$6,$7,$8::jsonb,$9)
         RETURNING senha, hora, pagamento, status, cliente, pago, items`,
        [tenantId, dia, senha, hora, input.pagamento, input.cliente, input.pago, JSON.stringify(input.items), opKey],
      )
      const pedido = toPedido(ins.rows[0]!)

      // projeção do painel: acrescenta a senha ao fim da ordenação.
      await this._painelPush(tx, tenantId, dia, senha)
      return { pedido, replay: false }
    })
  },

  /** Marca status validando a transição. 'pronto' registra chamada. */
  async marcarStatus(tenantId: string, senha: number, novo: StatusPedido): Promise<Pedido> {
    return withTransaction(async (tx) => {
      const dia = diaHoje()
      const atualR = await tx.query<{ status: StatusPedido }>(
        `SELECT status FROM pedido WHERE tenant_id=$1 AND dia=$2 AND senha=$3 FOR UPDATE`,
        [tenantId, dia, senha],
      )
      const atual = atualR.rows[0]
      if (!atual) throw new ErroDominio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.', 404)
      if (atual.status !== novo && !TRANSICOES[atual.status].includes(novo)) {
        throw new TransicaoInvalida(atual.status, novo)
      }

      const upd = await tx.query<LinhaPedido>(
        `UPDATE pedido SET status=$4, atualizado_em=now()
           WHERE tenant_id=$1 AND dia=$2 AND senha=$3
         RETURNING senha, hora, pagamento, status, cliente, pago, items`,
        [tenantId, dia, senha, novo],
      )
      if (novo === 'pronto') await this._registrarChamada(tx, tenantId, dia, senha)
      return toPedido(upd.rows[0]!)
    })
  },

  /** Alterna 'pago'. */
  async togglePago(tenantId: string, senha: number): Promise<Pedido> {
    return withTransaction(async (tx) => {
      const dia = diaHoje()
      const upd = await tx.query<LinhaPedido>(
        `UPDATE pedido SET pago = NOT pago, atualizado_em=now()
           WHERE tenant_id=$1 AND dia=$2 AND senha=$3
         RETURNING senha, hora, pagamento, status, cliente, pago, items`,
        [tenantId, dia, senha],
      )
      const p = upd.rows[0]
      if (!p) throw new ErroDominio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.', 404)
      return toPedido(p)
    })
  },

  /** Entrega. receberAntes=true marca pago+entregue atômico (receberEEntregar). */
  async entregar(tenantId: string, senha: number, receberAntes: boolean): Promise<Pedido> {
    return withTransaction(async (tx) => {
      const dia = diaHoje()
      const sql = receberAntes
        ? `UPDATE pedido SET pago=true, status='entregue', atualizado_em=now()
             WHERE tenant_id=$1 AND dia=$2 AND senha=$3
           RETURNING senha, hora, pagamento, status, cliente, pago, items`
        : `UPDATE pedido SET status='entregue', atualizado_em=now()
             WHERE tenant_id=$1 AND dia=$2 AND senha=$3
           RETURNING senha, hora, pagamento, status, cliente, pago, items`
      const upd = await tx.query<LinhaPedido>(sql, [tenantId, dia, senha])
      const p = upd.rows[0]
      if (!p) throw new ErroDominio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.', 404)
      return toPedido(p)
    })
  },

  /** Reordena o painel com concorrência otimista (version). */
  async reordenar(tenantId: string, sort: number[], versionCliente: number): Promise<PainelEstado> {
    return withTransaction(async (tx) => {
      const dia = diaHoje()
      const atual = await this._painelLer(tx, tenantId, dia)
      if (atual.version !== versionCliente) throw new ConflitoVersao(atual)
      const upd = await tx.query<{ version: number }>(
        `UPDATE painel_estado SET sort=$3::jsonb, version=version+1
           WHERE tenant_id=$1 AND dia=$2 RETURNING version`,
        [tenantId, dia, JSON.stringify(sort)],
      )
      return { sort, ultimaChamada: atual.ultimaChamada, chamadaHist: atual.chamadaHist, version: upd.rows[0]!.version }
    })
  },

  /** Hidratação: pedidos do dia + estado do painel + próxima senha. */
  async snapshot(tenantId: string): Promise<{ orders: Pedido[]; painel: PainelEstado; proximaSenha: number }> {
    const dia = diaHoje()
    const [pedidos, painel, cont] = await Promise.all([
      pool_query_pedidos(tenantId, dia),
      withTransaction((tx) => this._painelLer(tx, tenantId, dia)),
      pool_query_prox(tenantId, dia),
    ])
    return { orders: pedidos, painel, proximaSenha: cont }
  },

  // ---------- internos ----------
  async _painelLer(tx: Tx, tenantId: string, dia: string): Promise<PainelEstado> {
    const r = await tx.query<{ sort: number[]; ultima_chamada: number | null; chamada_hist: number[]; version: number }>(
      `INSERT INTO painel_estado (tenant_id, dia) VALUES ($1,$2)
         ON CONFLICT (tenant_id, dia) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING sort, ultima_chamada, chamada_hist, version`,
      [tenantId, dia],
    )
    const row = r.rows[0]!
    return { sort: row.sort, ultimaChamada: row.ultima_chamada, chamadaHist: row.chamada_hist, version: row.version }
  },

  async _painelPush(tx: Tx, tenantId: string, dia: string, senha: number): Promise<void> {
    await this._painelLer(tx, tenantId, dia) // garante a linha
    await tx.query(
      `UPDATE painel_estado
          SET sort = sort || to_jsonb($3::int), version = version + 1
        WHERE tenant_id=$1 AND dia=$2`,
      [tenantId, dia, senha],
    )
  },

  async _registrarChamada(tx: Tx, tenantId: string, dia: string, senha: number): Promise<void> {
    await tx.query(
      `UPDATE painel_estado
          SET ultima_chamada = $3,
              chamada_hist = (
                SELECT coalesce(jsonb_agg(v), '[]'::jsonb)
                  FROM jsonb_array_elements(chamada_hist) e(v)
                 WHERE (v)::int <> $3
              ) || to_jsonb($3::int),
              version = version + 1
        WHERE tenant_id=$1 AND dia=$2`,
      [tenantId, dia, senha],
    )
  },
}

// helpers de leitura fora de transação
async function pool_query_pedidos(tenantId: string, dia: string): Promise<Pedido[]> {
  const r = await pool.query<LinhaPedido>(
    `SELECT senha, hora, pagamento, status, cliente, pago, items
       FROM pedido WHERE tenant_id=$1 AND dia=$2 ORDER BY senha ASC`,
    [tenantId, dia],
  )
  return r.rows.map(toPedido)
}
async function pool_query_prox(tenantId: string, dia: string): Promise<number> {
  const r = await pool.query<{ ultima: number }>(
    `SELECT ultima FROM senha_contador WHERE tenant_id=$1 AND dia=$2`,
    [tenantId, dia],
  )
  return (r.rows[0]?.ultima ?? 44) + 1
}
