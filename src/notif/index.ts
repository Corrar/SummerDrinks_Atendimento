// Bootstrap do worker de outbox. Não instala nada em módulo — quem sobe é o
// server.ts (para os testes carregarem `criarApp()` sem side effects).

import { OutboxWorker } from './OutboxWorker.js'
import { FakeTransport, type NotificationTransport } from './transport.js'

export { OutboxWorker } from './OutboxWorker.js'
export * from './transport.js'
export * from './render.js'

/**
 * Escolhe o transporte a partir de `NOTIF_DRIVER`:
 *   - 'fake' (default): FakeTransport em memória — para dev/test/smoke.
 *   - 'green' | outros: STUB inicial (mesma superfície do fake) para não quebrar
 *     enquanto o adapter real da Green API não existe. Um TODO comentado
 *     documenta o próximo passo. Nunca cair em transporte "silent no-op".
 */
export function criarTransporte(driver?: string): NotificationTransport {
  const d = (driver ?? process.env.NOTIF_DRIVER ?? 'fake').toLowerCase()
  switch (d) {
    case 'fake':
      return new FakeTransport()
    case 'green':
      // TODO(Fase-5.1): substituir por GreenApiTransport real (fetch com
      //   AbortController(10s), map de status→retriable, adapter que
      //   reempacota TODA exceção em TransportError, sem PII em log).
      //   Enquanto isso, o fake garante que o pipeline funciona ponta-a-ponta.
      return new FakeTransport()
    default:
      throw new Error(`NOTIF_DRIVER desconhecido: ${d}`)
  }
}

export function criarOutboxWorker(driver?: string): OutboxWorker {
  return new OutboxWorker({ transport: criarTransporte(driver) })
}
