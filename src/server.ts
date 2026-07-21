// Bootstrap — sobe o app Express + Socket.IO + worker de outbox (Fase 5). A
// construção do app vive em app.ts (reutilizável por testes). Rotas SEM prefixo
// /api (convenção do ecossistema).
import { createServer } from 'node:http'
import { env } from './config/env.js'
import { criarApp } from './app.js'
import { initIO } from './realtime/io.js'
import { criarOutboxWorker } from './notif/index.js'
import { aplicarMigracoesPendentes } from './db/migracoes.js'

const app = criarApp()
const server = createServer(app)
initIO(server)

// Aplica migrações pendentes ANTES de aceitar tráfego. Fecha a janela em que o
// código novo (ex.: colunas da dobra) chega antes do schema e derruba o /menu.
// Desligável com AUTO_MIGRATE=false (aí volta a rodar `npm run migrate` à mão).
// Falha aqui NÃO impede o boot: os SELECT resilientes seguram a barra até migrar.
async function bootstrap(): Promise<void> {
  if (env.NODE_ENV !== 'test' && process.env.AUTO_MIGRATE !== 'false') {
    try {
      await aplicarMigracoesPendentes()
    } catch (e) {
      console.error('[migrate] falha ao migrar no boot (seguindo mesmo assim):', e instanceof Error ? e.message : e)
    }
  }

  server.listen(env.PORT, () => {
    console.log(`[server] Summer Drinks ouvindo na porta ${env.PORT} (${env.NODE_ENV})`)
  })

  // Worker de outbox — controlado por NOTIF_WORKER; default = ligado em não-test.
  // Rodar em test causa picos de I/O contra o mesmo Postgres do vitest.
  const rodarWorker = env.NOTIF_WORKER
    ? env.NOTIF_WORKER === 'true'
    : env.NODE_ENV !== 'test'
  if (rodarWorker) {
    const worker = criarOutboxWorker(env.NOTIF_DRIVER)
    void worker.start()
    console.log(`[server] outbox worker up (driver=${env.NOTIF_DRIVER})`)
    const parar = async (): Promise<void> => {
      await worker.stop()
    }
    process.once('SIGTERM', parar)
    process.once('SIGINT', parar)
  }
}

void bootstrap()
