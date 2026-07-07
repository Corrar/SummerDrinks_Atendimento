// AuthN/AuthZ — JWT + RBAC. Papel verificado por rota (não só na entrada).
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'

export type Papel = 'gestao' | 'pdv' | 'painel'

export interface Autenticado {
  sub: string
  tenant: string
  papel: Papel
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: Autenticado
    }
  }
}

export function autenticar(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ erro: 'Token ausente.', codigo: 'SEM_TOKEN' })
    return
  }
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as Autenticado
    req.auth = p
    next()
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado.', codigo: 'TOKEN_INVALIDO' })
  }
}

/** Exige um dos papéis. Uso: exigirPapel('gestao','pdv') */
export function exigirPapel(...papeis: Papel[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !papeis.includes(req.auth.papel)) {
      res.status(403).json({ erro: 'Permissão insuficiente.', codigo: 'RBAC_NEGADO' })
      return
    }
    next()
  }
}
