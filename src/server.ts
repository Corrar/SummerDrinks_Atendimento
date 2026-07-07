// Bootstrap — sobe o app Express + Socket.IO. A construção do app vive em app.ts
// (reutilizável por testes). Rotas SEM prefixo /api (convenção do ecossistema).
import { createServer } from 'node:http'
import { env } from './config/env.js'
import { criarApp } from './app.js'
import { initIO } from './realtime/io.js'

const app = criarApp()
const server = createServer(app)
initIO(server)

server.listen(env.PORT, () => {
  console.log(`[server] Summer Drinks ouvindo na porta ${env.PORT} (${env.NODE_ENV})`)
})
