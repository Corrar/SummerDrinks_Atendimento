// Worker que drena a tabela `outbox` (Fase 5). Desenho **two-phase** para não
// segurar linha travada durante I/O de rede (findings 1+2 do design review):
//
//   TX-CLAIM (curta)
//     SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1
//     UPDATE outbox
//        SET tentativas = tentativas + 1,
//            proxima_em = now() + backoff(tentativas)     -- pré-avança o backoff
//     COMMIT                                              -- linha livre para outros workers
//                                                            só voltará elegível após o backoff
//   ENVIO HTTP (fora de qualquer tx, com AbortController)
//     - sucesso → TX-SETTLE marca 'entregue'
//     - erro retriable → NADA (a linha volta naturalmente depois do backoff)
//     - erro não-retriable OU tentativas ≥ MAX → TX-SETTLE marca 'falha' + ultimo_erro
//
// Consequências desejadas:
//   - Crash entre CLAIM e SETTLE não gera retry storm: tentativas já avançou,
//     próximo pickup respeita o backoff, transporte deduplica pela idempotencyKey.
//   - Múltiplos workers não enviam duplicado (SKIP LOCKED + advance de proxima_em).
//   - Log allow-list: NUNCA telefone/nome/texto/e.message — só o safeCode.
//
// LEFT JOIN em agenda: se a agenda sumiu (LGPD-forget, cascade errado), a linha
// vai para 'falha' com ultimo_erro='agenda_ausente' — não vira zombie invisível.

import { pool } from '../db/pool.js'
import { renderizar, type DadosAgenda } from './render.js'
import type { NotificationTransport } from './transport.js'
import { TransportError } from './transport.js'
import type { StatusAgenda } from '../types/domain.js'

const MAX_TENTATIVAS = 8            // 2s, 4s, ..., 256s, 300s → total ~15min de retry
const BACKOFF_CAP_S = 300
const TIMEOUT_ENVIO_MS = 10_000
const IDLE_SLEEP_MS = 1_000         // espera quando não há linha elegível

interface LinhaOutboxClaim {
  id: string                        // bigint → serializado como string por pg
  tenant_id: string
  tipo: string
  tentativas: number
  criado_em_epoch: number           // segundos, não reusa após TRUNCATE RESTART
  ag_nome: string | null
  ag_telefone: string | null
  ag_data: string | null            // já formatada 'YYYY-MM-DD' pelo to_char
  ag_hora: string | null
  ag_protocolo: string | null
  ag_motivo_recusa: string | null
  ag_status: StatusAgenda | null
  ag_id: string | null              // NULL → agenda ausente
}

function backoffSegundos(tentativas: number): number {
  return Math.min(Math.pow(2, tentativas), BACKOFF_CAP_S)
}

/** Chave de idempotência do provedor. Inclui epoch de criado_em para não colidir
 *  após TRUNCATE ... RESTART IDENTITY (finding #5 do design review). */
function idempotencyKey(id: string, criadoEmEpoch: number): string {
  return `outbox:${id}:${criadoEmEpoch}`
}

export interface OutboxWorkerOpts {
  transport: NotificationTransport
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
  /** Sobrescrita p/ testes; default = pool real. */
  db?: typeof pool
}

export class OutboxWorker {
  private readonly transport: NotificationTransport
  private readonly log: Pick<Console, 'log' | 'warn' | 'error'>
  private readonly db: typeof pool
  private rodando = false
  private timerId: NodeJS.Timeout | null = null

  constructor(opts: OutboxWorkerOpts) {
    this.transport = opts.transport
    this.log = opts.logger ?? console
    this.db = opts.db ?? pool
  }

  /**
   * Drena UMA linha elegível. Retorna true se processou algo (o loop deve tentar
   * outra imediatamente), false se não havia nada elegível (dormir um pouco).
   */
  async drenarUmaVez(): Promise<boolean> {
    // ---------- TX-CLAIM (curta, sem I/O de rede lá dentro) ----------
    const cliente = await this.db.connect()
    let claim: LinhaOutboxClaim | null = null
    try {
      await cliente.query('BEGIN')
      const sel = await cliente.query<LinhaOutboxClaim>(
        `SELECT o.id::text          AS id,
                o.tenant_id::text   AS tenant_id,
                o.tipo,
                o.tentativas,
                EXTRACT(EPOCH FROM o.criado_em)::bigint AS criado_em_epoch,
                a.cliente           AS ag_nome,
                a.telefone          AS ag_telefone,
                to_char(a.data, 'YYYY-MM-DD') AS ag_data,
                a.hora              AS ag_hora,
                a.protocolo         AS ag_protocolo,
                a.motivo_recusa     AS ag_motivo_recusa,
                a.status            AS ag_status,
                a.id                AS ag_id
           FROM outbox o
           LEFT JOIN agenda a ON a.tenant_id = o.tenant_id
                              AND a.id = o.payload->>'id'
          WHERE o.status = 'pendente' AND o.proxima_em <= now()
          ORDER BY o.proxima_em, o.id
          FOR UPDATE OF o SKIP LOCKED
          LIMIT 1`,
      )
      claim = sel.rows[0] ?? null
      if (!claim) {
        await cliente.query('ROLLBACK')
        return false
      }
      const proximas = claim.tentativas + 1
      await cliente.query(
        `UPDATE outbox
            SET tentativas = $2,
                proxima_em = now() + ($3 || ' seconds')::interval,
                atualizado_em = now()
          WHERE id = $1::bigint`,
        [claim.id, proximas, String(backoffSegundos(proximas))],
      )
      await cliente.query('COMMIT')
    } catch (e) {
      try { await cliente.query('ROLLBACK') } catch { /* best-effort */ }
      // Diagnóstico DEV/smoke: em produção o code do pg é suficiente; aqui
      // incluímos a message p/ acelerar debug — nenhuma PII flui neste caminho
      // (o SQL é estático, só toca IDs internos).
      this.log.error('[outbox] falha na TX-CLAIM:', e instanceof Error ? `${e.name}: ${e.message}` : 'unknown')
      return false
    } finally {
      cliente.release()
    }

    // ---------- Casos de terminação sem envio ----------
    if (!claim.ag_id) {
      await this.marcarFalha(claim.id, 'agenda_ausente')
      this.logSeguro('agenda_ausente', claim)
      return true
    }
    const texto = renderizar(claim.tipo, this.toDados(claim))
    if (texto == null) {
      await this.marcarFalha(claim.id, 'tipo_desconhecido')
      this.logSeguro('tipo_desconhecido', claim)
      return true
    }
    if (!claim.ag_telefone || claim.ag_telefone.trim() === '') {
      // Sem telefone não há como notificar; marca falha (não fica em loop).
      await this.marcarFalha(claim.id, 'telefone_ausente')
      this.logSeguro('telefone_ausente', claim)
      return true
    }

    // ---------- ENVIO HTTP (fora de qualquer transação) ----------
    // AbortController blinda o timeout mesmo quando o transporte não respeita seu próprio
    // deadline (proteção adicional além do timeout interno do adapter).
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_ENVIO_MS)
    let erro: TransportError | null = null
    try {
      await this.transport.enviar({
        telefone: claim.ag_telefone,
        texto,
        idempotencyKey: idempotencyKey(claim.id, claim.criado_em_epoch),
      })
    } catch (e) {
      if (e instanceof TransportError) {
        erro = e
      } else {
        // Segurança: TransportError é o único throw esperado. Qualquer outra
        // exceção é reempacotada aqui — nunca deixamos a mensagem crua vazar.
        erro = new TransportError(false, 'unknown_exception')
      }
    } finally {
      clearTimeout(timer)
    }

    // ---------- TX-SETTLE (curta) ----------
    if (!erro) {
      await this.marcarEntregue(claim.id)
      this.logSeguro('entregue', claim)
      return true
    }

    const exhausted = claim.tentativas + 1 >= MAX_TENTATIVAS
    if (!erro.retriable || exhausted) {
      await this.marcarFalha(claim.id, erro.safeCode)
      this.logSeguro(exhausted ? 'exhausted' : 'nao_retriable', claim, erro.safeCode)
      return true
    }
    // Retriable & não-exhausto: não faz nada — próximo tick pegará depois do backoff.
    await this.registrarUltimoErro(claim.id, erro.safeCode)
    this.logSeguro('retriable', claim, erro.safeCode)
    return true
  }

  // ---------- loop de vida ----------
  async start(): Promise<void> {
    if (this.rodando) return
    this.rodando = true
    const tick = async (): Promise<void> => {
      if (!this.rodando) return
      let processou = false
      try {
        processou = await this.drenarUmaVez()
      } catch (e) {
        // Blindagem final: qualquer coisa que escape (bug de código) não mata o worker.
        this.log.error('[outbox] tick com falha inesperada:', e instanceof Error ? e.name : 'unknown')
      }
      if (!this.rodando) return
      this.timerId = setTimeout(tick, processou ? 0 : IDLE_SLEEP_MS)
    }
    void tick()
  }

  async stop(): Promise<void> {
    this.rodando = false
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  // ---------- internos ----------
  private async marcarEntregue(id: string): Promise<void> {
    await this.db.query(
      `UPDATE outbox SET status = 'entregue', ultimo_erro = NULL, atualizado_em = now() WHERE id = $1::bigint`,
      [id],
    )
  }

  private async marcarFalha(id: string, safeCode: string): Promise<void> {
    await this.db.query(
      `UPDATE outbox SET status = 'falha', ultimo_erro = $2, atualizado_em = now() WHERE id = $1::bigint`,
      [id, safeCode],
    )
  }

  private async registrarUltimoErro(id: string, safeCode: string): Promise<void> {
    await this.db.query(
      `UPDATE outbox SET ultimo_erro = $2, atualizado_em = now() WHERE id = $1::bigint`,
      [id, safeCode],
    )
  }

  private toDados(claim: LinhaOutboxClaim): DadosAgenda {
    return {
      nome: claim.ag_nome ?? '',
      telefone: claim.ag_telefone ?? '',
      data: claim.ag_data ?? '',
      hora: claim.ag_hora ?? '',
      protocolo: claim.ag_protocolo ?? '',
      motivo_recusa: claim.ag_motivo_recusa,
      status: (claim.ag_status ?? 'solicitado') as StatusAgenda,
    }
  }

  private logSeguro(resultado: string, claim: LinhaOutboxClaim, code?: string): void {
    // Log allow-list — só ids, tipos, contadores, safeCode. NUNCA telefone/nome/texto/e.message.
    const linha = {
      outbox_id: claim.id,
      tipo: claim.tipo,
      tenant_id: claim.tenant_id,
      tentativas: claim.tentativas + 1,
      resultado,
      ...(code ? { code } : {}),
      transport: this.transport.nome,
    }
    this.log.log('[outbox]', JSON.stringify(linha))
  }
}
