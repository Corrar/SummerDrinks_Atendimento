// Transporte de notificação plugável. A borda pública NUNCA fala com Green API
// direto — só com esta interface. Isso mantém a superfície testável, permite
// trocar de provedor sem tocar o worker, e centraliza o cuidado com PII:
//  - Nenhum erro cru de HTTP client escapa daqui — todo throw é reempacotado
//    em TransportError com um `safeCode` sem PII (nunca telefone, nunca a URL
//    do Green API com token no path, nunca o corpo da requisição).
//  - `idempotencyKey` identifica a intenção de envio (construída pelo worker;
//    nunca reutiliza valor após TRUNCATE RESTART IDENTITY — inclui `criado_em`
//    epoch). Provedores que aceitam chave de dedup devem repassá-la; a Green API
//    não aceita, então a dedup real fica no claim do outbox (SKIP LOCKED).

export interface MensagemNotificacao {
  telefone: string
  texto: string
  idempotencyKey: string
}

export interface NotificationTransport {
  /**
   * Envia a mensagem. Sucesso silencioso (resolve void).
   * Falha SEMPRE via TransportError — nenhuma exceção crua do cliente HTTP
   * pode subir daqui, senão APM/logging framework pode indexar PII/segredos.
   */
  enviar(msg: MensagemNotificacao): Promise<void>

  /** Nome curto para logs (allow-list, sem PII). */
  readonly nome: string
}

export class TransportError extends Error {
  /**
   * @param retriable  worker deve tentar de novo depois do backoff
   * @param safeCode   código curto sem PII ('http_429', 'http_500', 'timeout',
   *                   'network', 'invalid_phone', 'unknown'). vai pro `ultimo_erro`
   *                   no DB e pros logs. NUNCA inclua telefone/mensagem/URL.
   */
  constructor(
    public readonly retriable: boolean,
    public readonly safeCode: string,
  ) {
    super(safeCode) // message = code; nunca eco de request
    this.name = 'TransportError'
  }
}

// ---------- GreenApiTransport — WhatsApp via Green API ----------
// POST {baseUrl}/waInstance{idInstance}/sendMessage/{token}
//   body { chatId: '<numero>@c.us', message: texto }
// O token viaja no PATH da URL (contrato da Green API) — por isso NENHUM erro
// daqui pode ecoar a URL: só safeCode. A Green API não aceita chave de
// idempotência no sendMessage; a dedup fica no outbox (claim SKIP LOCKED +
// pré-avanço de backoff), com janela pequena de duplicata em crash entre
// envio e settle — aceitável para notificação de status.

export interface GreenApiOpts {
  baseUrl: string
  idInstance: string
  token: string
  timeoutMs?: number
  /** Injetável nos testes; default = fetch global. */
  fetchImpl?: typeof fetch
}

/** Só dígitos; número BR sem DDI (10-11 dígitos) ganha '55'. Curto demais → null. */
export function normalizarTelefoneBr(telefone: string): string | null {
  const d = telefone.replace(/\D/g, '').replace(/^0+/, '')
  if (d.length < 10) return null
  if (d.length <= 11) return `55${d}`
  return d
}

export class GreenApiTransport implements NotificationTransport {
  readonly nome = 'green'
  private readonly url: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(opts: GreenApiOpts) {
    this.url = `${opts.baseUrl.replace(/\/+$/, '')}/waInstance${opts.idInstance}/sendMessage/${opts.token}`
    this.timeoutMs = opts.timeoutMs ?? 10_000
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async enviar(msg: MensagemNotificacao): Promise<void> {
    const numero = normalizarTelefoneBr(msg.telefone)
    if (!numero) throw new TransportError(false, 'invalid_phone')

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.timeoutMs)
    let resp: Response
    try {
      resp = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: `${numero}@c.us`, message: msg.texto }),
        signal: ac.signal,
      })
    } catch (e) {
      // Timeout/abort e falha de rede são transitórios; o resto é bug → não retenta.
      if (e instanceof Error && e.name === 'AbortError') throw new TransportError(true, 'timeout')
      if (e instanceof TypeError) throw new TransportError(true, 'network')
      throw new TransportError(false, 'unknown')
    } finally {
      clearTimeout(timer)
    }

    if (resp.ok) return
    if (resp.status === 429) throw new TransportError(true, 'http_429')
    if (resp.status >= 500) throw new TransportError(true, `http_${resp.status}`)
    // 4xx ≠ 429: payload/credencial errada — retentar só repetiria o erro.
    throw new TransportError(false, `http_${resp.status}`)
  }
}

// ---------- FakeTransport — usado por testes/dev/smoke ----------
// Grava chamadas em memória; permite programar falhas controladas para exercitar
// retry/backoff e o path de exhaustão sem tocar em rede real.

export interface FakeCall {
  telefone: string
  texto: string
  idempotencyKey: string
  ts: number
}

export interface FakeErro {
  /** Se >0, N próximas chamadas falham com o erro dado antes de voltar a suceder. */
  vezes: number
  retriable: boolean
  safeCode: string
}

export class FakeTransport implements NotificationTransport {
  readonly nome = 'fake'
  readonly enviadas: FakeCall[] = []
  private falhas: FakeErro | null = null

  /** Programa N próximas chamadas para falharem. */
  falharProximas(vezes: number, opts: { retriable?: boolean; safeCode?: string } = {}): void {
    this.falhas = { vezes, retriable: opts.retriable ?? true, safeCode: opts.safeCode ?? 'fake_error' }
  }

  reset(): void {
    this.enviadas.length = 0
    this.falhas = null
  }

  async enviar(msg: MensagemNotificacao): Promise<void> {
    if (this.falhas && this.falhas.vezes > 0) {
      const f = this.falhas
      f.vezes -= 1
      if (f.vezes <= 0) this.falhas = null
      throw new TransportError(f.retriable, f.safeCode)
    }
    this.enviadas.push({ ...msg, ts: Date.now() })
  }
}
