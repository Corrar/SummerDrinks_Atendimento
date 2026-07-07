// Rotas de autenticação — PÚBLICAS (montadas ANTES do autenticar()).
// Login por { tenantSlug, usuario, senha } → JWT { sub, tenant:<uuid>, papel }.
// Rate limit por IP (anti brute-force). Erro sempre genérico (anti-enumeração).
import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { AuthService } from '../../services/AuthService.js'
import { validarBody } from '../middleware/validate.js'
import { loginSchema, refreshSchema } from '../../types/schemas.js'

export const authRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

// Rate limit por IP: freia brute-force de senha sem depender do tenant/login.
const limiteLogin = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_JANELA_MS ?? 60_000),
  max: Number(process.env.AUTH_RATE_MAX ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:auth`,
  message: { erro: 'Muitas tentativas. Aguarde um instante.', codigo: 'RATE_LIMIT' },
})

authRouter.post(
  '/auth/login',
  limiteLogin,
  validarBody(loginSchema),
  asy(async (req, res) => {
    const r = await AuthService.login(req.body)
    res.json(r)
  }),
)

authRouter.post(
  '/auth/refresh',
  limiteLogin,
  validarBody(refreshSchema),
  asy(async (req, res) => {
    const r = await AuthService.refresh(req.body.refresh)
    res.json(r)
  }),
)
