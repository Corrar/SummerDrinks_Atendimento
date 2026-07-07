// Camada Socket.IO — rooms por tenant. Painel/PDV autenticados; app do cliente read-only.
import { Server as SocketServer, type Socket } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

let io: SocketServer | null = null

interface TokenPayload {
  sub: string
  tenant: string
  papel: 'gestao' | 'pdv' | 'painel'
}

export function initIO(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.corsOrigins, credentials: true },
  })

  io.on('connection', (socket: Socket) => {
    const token = socket.handshake.auth?.token as string | undefined
    const tenantPublico = socket.handshake.query?.tenantPublico as string | undefined

    if (token) {
      try {
        const p = jwt.verify(token, env.JWT_SECRET) as TokenPayload
        void socket.join(`tenant:${p.tenant}`)
      } catch {
        socket.disconnect(true)
        return
      }
    } else if (tenantPublico) {
      // app do cliente: só recebe atualizações públicas (ex.: disponibilidade)
      void socket.join(`tenant:${tenantPublico}:public`)
      // acompanhamento de UM pedido específico via token opaco (sem auth, sem PII).
      // Sala chaveada só pelo token (uuid único): o cliente não conhece o tenant_id.
      const pedidoToken = socket.handshake.query?.pedidoToken as string | undefined
      if (pedidoToken && /^[0-9a-f-]{36}$/i.test(pedidoToken)) {
        void socket.join(`pedido:${pedidoToken}`)
      }
    } else {
      socket.disconnect(true)
    }
  })

  return io
}

type EventoPrivado =
  | 'order:created'
  | 'order:updated'
  | 'panel:reordered'
  | 'catalogo:updated'
  | 'agenda:updated'
  | 'dispo:updated'
  | 'config:updated'

/** Emite para a room autenticada do tenant. */
export function emitir(tenant: string, evento: EventoPrivado, payload: unknown): void {
  io?.to(`tenant:${tenant}`).emit(evento, payload)
}

/** Emite para a room pública do tenant (app do cliente). */
export function emitirPublico(tenant: string, evento: 'dispo:updated', payload: unknown): void {
  io?.to(`tenant:${tenant}:public`).emit(evento, payload)
}

/**
 * Empurra o status de UM pedido para o app do cliente que o acompanha pelo token.
 * Read-only: o cliente só recebe { senha, status, hora }.
 */
export function emitirStatusPedido(
  token: string,
  payload: { senha: number; status: string; hora: string; pago: boolean },
): void {
  io?.to(`pedido:${token}`).emit('pedido:status', payload)
}
