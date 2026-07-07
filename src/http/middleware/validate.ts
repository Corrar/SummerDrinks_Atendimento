// Validação de body via zod + tratador de erro central. Rejeita payload malformado
// ANTES do domínio. Nunca vaza stack trace em produção.
import type { Request, Response, NextFunction } from 'express'
import { ZodError, type ZodSchema } from 'zod'
import { ErroDominio } from '../../types/domain.js'
import { env } from '../../config/env.js'

export function validarBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const r = schema.safeParse(req.body)
    if (!r.success) {
      res.status(400).json({ erro: 'Payload inválido.', codigo: 'VALIDACAO', detalhes: r.error.flatten() })
      return
    }
    req.body = r.data
    next()
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tratadorErro(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ErroDominio) {
    res.status(err.status).json({ erro: err.message, codigo: err.codigo })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ erro: 'Payload inválido.', codigo: 'VALIDACAO', detalhes: err.flatten() })
    return
  }
  console.error('[http] erro não tratado:', err instanceof Error ? err.message : err)
  res.status(500).json({
    erro: 'Erro interno.',
    codigo: 'INTERNO',
    ...(env.isProd ? {} : { detalhes: err instanceof Error ? err.message : String(err) }),
  })
}
