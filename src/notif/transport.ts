// Transporte de notificação plugável. A borda pública NUNCA fala com Green API
// direto — só com esta interface. Isso mantém a superfície testável, permite
// trocar de provedor sem tocar o worker, e centraliza o cuidado com PII:
//  - Nenhum erro cru de HTTP client escapa daqui — todo throw é reempacotado
//    em TransportError com um `safeCode` sem PII (nunca telefone, nunca a URL
//    do Green API com token no path, nunca o corpo da requisição).
//  - `idempotencyKey` é passada ao provedor para dedup (Green API tem window
//    de deduplicação ~24h por chave). Vem construída pelo worker; nunca reutiliza
//    valor após TRUNCATE RESTART IDENTITY (inclui `criado_em` epoch).

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
