// AgendaService — escritor transacional de AGENDA. Mutação de estado passa por aqui
// (FOR UPDATE + validação de transição + outbox durável na mesma tx). Espelha a
// disciplina do OrderService sem acoplar os dois agregados.
import { pool, withTransaction, type Tx } from '../db/pool.js'
import {
  TRANSICOES_AGENDA,
  TransicaoAgendaInvalida,
  ErroDominio,
  type StatusAgenda,
} from '../types/domain.js'

// Sem PII — shape seguro para RETURNING de mutação e para emit realtime.
export interface AgendaBase {
  id: string
  cliente: string
  tipo: string
  data: string
  hora: string
  local: string
  pessoas: number
  valor: string          // numeric(12,2) → string (pg preserva precisão monetária; a UI formata)
  obs: string
  status: StatusAgenda
  origem: string
  protocolo: string | null
}

// Com contato — SÓ para GET autenticado da gestão. NUNCA entra em emit nem em log.
export interface AgendaComContato extends AgendaBase {
  telefone: string
  email: string
}

const COLS_BASE =
  'id, cliente, tipo, data, hora, local, pessoas, valor, obs, status, origem, protocolo'

export const AgendaService = {
  /** Lista escopada ao tenant, filtro opcional status/data. Retorna PII (rota autenticada). */
  async listar(
    tenantId: string,
    filtro: { status?: StatusAgenda; de?: string; ate?: string },
  ): Promise<AgendaComContato[]> {
    const cond: string[] = ['tenant_id = $1']
    const args: unknown[] = [tenantId]
    if (filtro.status) { args.push(filtro.status); cond.push(`status = $${args.length}`) }
    if (filtro.de)     { args.push(filtro.de);     cond.push(`data >= $${args.length}`) }
    if (filtro.ate)    { args.push(filtro.ate);    cond.push(`data <= $${args.length}`) }
    const r = await pool.query<AgendaComContato>(
      `SELECT ${COLS_BASE}, telefone, email
         FROM agenda WHERE ${cond.join(' AND ')} ORDER BY data, hora`,
      args,
    )
    return r.rows
  },

  /** Orça (seta valor). Ortogonal à transição de status. gestao-only na rota. */
  async orcar(tenantId: string, id: string, valor: number): Promise<AgendaBase> {
    if (!Number.isFinite(valor) || valor < 0) {
      throw new ErroDominio('VALOR_INVALIDO', 'Valor inválido.', 422)
    }
    return withTransaction(async (tx) => {
      const r = await tx.query<AgendaBase>(
        `UPDATE agenda SET valor = $3
           WHERE tenant_id = $1 AND id = $2
         RETURNING ${COLS_BASE}`,
        [tenantId, id, valor],
      )
      const row = r.rows[0]
      if (!row) throw new ErroDominio('AGENDA_NAO_ENCONTRADA', 'Solicitação não encontrada.', 404)
      return row
    })
  },

  /** Transiciona status com lock e validação. Enfileira outbox durável SÓ quando o estado muda. */
  async transicionar(
    tenantId: string,
    id: string,
    novo: StatusAgenda,
    motivo: string | null,
  ): Promise<AgendaBase> {
    return withTransaction(async (tx: Tx) => {
      const atualR = await tx.query<{ status: StatusAgenda; origem: string; protocolo: string | null }>(
        `SELECT status, origem, protocolo FROM agenda
           WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      )
      const atual = atualR.rows[0]
      if (!atual) throw new ErroDominio('AGENDA_NAO_ENCONTRADA', 'Solicitação não encontrada.', 404)

      const mudou = atual.status !== novo
      if (mudou && !TRANSICOES_AGENDA[atual.status].includes(novo)) {
        throw new TransicaoAgendaInvalida(atual.status, novo)
      }

      const r = await tx.query<AgendaBase>(
        `UPDATE agenda
            SET status = $3,
                motivo_recusa = CASE WHEN $3 = 'recusado' THEN $4 ELSE motivo_recusa END
          WHERE tenant_id = $1 AND id = $2
        RETURNING ${COLS_BASE}`,
        [tenantId, id, novo, motivo],
      )
      const row = r.rows[0]!   // garantido: linha travada por FOR UPDATE na mesma tx

      // Notificação durável ao cliente — SÓ quando o estado mudou (evita duplo
      // enfileiramento em PATCH idempotente) e só p/ solicitação vinda do app com protocolo.
      const notificavel = novo === 'agendado' || novo === 'confirmado' || novo === 'recusado'
      if (mudou && notificavel && atual.origem === 'app_cliente' && atual.protocolo) {
        await tx.query(
          `INSERT INTO outbox (tenant_id, tipo, payload)
             VALUES ($1, $2, $3::jsonb)`,
          [tenantId, `evento:${novo}`, JSON.stringify({ id, protocolo: atual.protocolo, status: novo })],
        )
      }
      return row
    })
  },
}
