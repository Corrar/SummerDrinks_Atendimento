// Bootstrap do worker de outbox. Não instala nada em módulo — quem sobe é o
// server.ts (para os testes carregarem `criarApp()` sem side effects).

import { OutboxWorker } from './OutboxWorker.js'
import { FakeTransport, GreenApiTransport, type NotificationTransport } from './transport.js'

export { OutboxWorker } from './OutboxWorker.js'
export * from './transport.js'
export * from './render.js'

/**
 * Escolhe o transporte a partir de `NOTIF_DRIVER`:
 *   - 'fake' (default): FakeTransport em memória — para dev/test/smoke.
 *   - 'green': GreenApiTransport real (WhatsApp via Green API). Exige
 *     GREEN_API_ID_INSTANCE + GREEN_API_TOKEN (validados também no boot pelo
 *     env.ts). Nunca cair em transporte "silent no-op".
 */
export function criarTransporte(driver?: string): NotificationTransport {
  const d = (driver ?? process.env.NOTIF_DRIVER ?? 'fake').toLowerCase()
  switch (d) {
    case 'fake':
      return new FakeTransport()
    case 'green': {
      const idInstance = process.env.GREEN_API_ID_INSTANCE
      const token = process.env.GREEN_API_TOKEN
      if (!idInstance || !token) {
        throw new Error('NOTIF_DRIVER=green exige GREEN_API_ID_INSTANCE e GREEN_API_TOKEN')
      }
      return new GreenApiTransport({
        baseUrl: process.env.GREEN_API_BASE_URL ?? 'https://api.green-api.com',
        idInstance,
        token,
      })
    }
    default:
      throw new Error(`NOTIF_DRIVER desconhecido: ${d}`)
  }
}

export function criarOutboxWorker(driver?: string): OutboxWorker {
  return new OutboxWorker({ transport: criarTransporte(driver) })
}
