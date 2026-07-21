// Construção do app Express (sem `listen`) — reutilizável por server.ts e por testes.
// Helmet, CORS allowlist, JSON com limite, rotas, tratador de erro central.
// Rotas SEM prefixo /api (convenção do ecossistema).
import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { authRouter } from './http/routes/auth.js'
import { ordersRouter } from './http/routes/orders.js'
import { publicRouter } from './http/routes/public.js'
import { catalogoRouter } from './http/routes/catalogo.js'
import { agendasRouter } from './http/routes/agendas.js'
import { dispoRouter } from './http/routes/dispo.js'
import { configRouter } from './http/routes/config.js'
import { avaliacoesRouter } from './http/routes/avaliacoes.js'
import { usuariosRouter } from './http/routes/usuarios.js'
import { autenticar } from './http/middleware/auth.js'
import { tratadorErro } from './http/middleware/validate.js'

export function criarApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: (origin, cb) => {
        // sem origin (curl/health) ou na allowlist
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true)
        cb(new Error('Origem não permitida pelo CORS.'))
      },
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '32kb' }))

  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

  // auth PÚBLICO (login/refresh) — antes da fronteira de autenticação.
  app.use(authRouter)
  // borda pública do app do cliente — ÚNICA superfície de negócio sem auth (/public/*).
  app.use(publicRouter)

  // ← FRONTEIRA: tudo montado ABAIXO exige JWT válido (autenticar popula req.auth).
  // Centralizar aqui torna cada router novo autenticado-por-padrão e mata o footgun de
  // ordem de montagem; o RBAC fino continua por-rota via exigirPapel().
  app.use(autenticar)
  app.use(ordersRouter) // /orders, /panel/*
  app.use(catalogoRouter) // /catalogo (CRUD gestão)
  app.use(agendasRouter) // /agendas (leitura gestão/pdv/painel; mutações gestão)
  app.use(dispoRouter) // /dispo (base; leitura gestão/pdv/painel; mutações gestão)
  app.use(configRouter) // /config (leitura gestão/pdv/painel; mutações gestão)
  app.use(avaliacoesRouter) // /avaliacoes (leitura gestão/pdv/painel; escrita só na borda pública)
  app.use(usuariosRouter) // /usuarios (CRUD de operadores; gestão-only)
  // Operação fora do localStorage: pedido+catálogo+dispo+config fechados.

  app.use(tratadorErro)
  return app
}
