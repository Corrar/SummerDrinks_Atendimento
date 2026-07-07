// AuthService — autenticação de operadores. Valida credenciais contra a tabela
// `usuario` (bcrypt) e emite JWT de acesso curto (+ refresh opcional).
//
// Regras invioláveis:
//  - `tenant` no JWT é o UUID do tenant (nunca o slug).
//  - Erro genérico: nunca revelar se falhou o login OU a senha (anti-enumeração).
//  - Comparação bcrypt SEMPRE executa (mesmo com usuário inexistente) para não
//    vazar por timing quais logins existem.

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { ErroDominio } from '../types/domain.js'
import type { Papel } from '../http/middleware/auth.js'
import type { LoginInput } from '../types/schemas.js'

// Hash "dummy" (bcrypt de uma senha aleatória) usado quando o login não existe:
// mantém o custo de comparação constante e some com o oráculo de timing.
const HASH_DUMMY = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8/GRmQ8kqN0aXhZ8mF9pQ1n3Vd6fK'

interface LinhaUsuario {
  id: string
  tenant_id: string
  hash: string
  papel: Papel
  ativo: boolean
}

export interface ResultadoLogin {
  token: string
  refresh: string
  papel: Papel
  expiraEm: number // segundos até expirar o token de acesso
}

interface AccessClaims {
  sub: string
  tenant: string
  papel: Papel
}

interface RefreshClaims {
  sub: string
  tenant: string
  papel: Papel
  typ: 'refresh'
}

const REFRESH_EXP_SEGUNDOS = Number(process.env.JWT_REFRESH_EXP_SEGUNDOS ?? 7 * 24 * 3600)

function assinarAcesso(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: env.JWT_EXP_SEGUNDOS })
}

function assinarRefresh(claims: AccessClaims): string {
  const payload: RefreshClaims = { ...claims, typ: 'refresh' }
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: REFRESH_EXP_SEGUNDOS })
}

const CREDENCIAIS_INVALIDAS = new ErroDominio(
  'CREDENCIAIS_INVALIDAS',
  'Usuário ou senha inválidos.',
  401,
)

export const AuthService = {
  /** Valida credenciais e emite tokens. Erro genérico em qualquer falha. */
  async login(input: LoginInput): Promise<ResultadoLogin> {
    const r = await pool.query<LinhaUsuario>(
      `SELECT u.id, u.tenant_id, u.hash, u.papel, u.ativo
         FROM usuario u
         JOIN tenant t ON t.id = u.tenant_id
        WHERE t.slug = $1 AND u.login = $2`,
      [input.tenantSlug, input.usuario],
    )
    const usr = r.rows[0]

    // Sempre compara contra ALGUM hash (dummy se não achou) — timing constante.
    const ok = await bcrypt.compare(input.senha, usr?.hash ?? HASH_DUMMY)

    if (!usr || !usr.ativo || !ok) throw CREDENCIAIS_INVALIDAS

    const claims: AccessClaims = { sub: usr.id, tenant: usr.tenant_id, papel: usr.papel }
    return {
      token: assinarAcesso(claims),
      refresh: assinarRefresh(claims),
      papel: usr.papel,
      expiraEm: env.JWT_EXP_SEGUNDOS,
    }
  },

  /** Troca um refresh válido por um novo par de tokens. Rejeita tokens de acesso. */
  async refresh(refreshToken: string): Promise<ResultadoLogin> {
    let claims: RefreshClaims
    try {
      const p = jwt.verify(refreshToken, env.JWT_SECRET) as RefreshClaims
      if (p.typ !== 'refresh') throw new Error('não é refresh')
      claims = p
    } catch {
      throw new ErroDominio('REFRESH_INVALIDO', 'Sessão expirada. Faça login novamente.', 401)
    }

    // Reconfirma que o usuário ainda existe e está ativo (revogação = desativar).
    const r = await pool.query<{ papel: Papel; ativo: boolean }>(
      `SELECT papel, ativo FROM usuario WHERE tenant_id = $1 AND id = $2`,
      [claims.tenant, claims.sub],
    )
    const usr = r.rows[0]
    if (!usr || !usr.ativo) {
      throw new ErroDominio('REFRESH_INVALIDO', 'Sessão expirada. Faça login novamente.', 401)
    }

    const novo: AccessClaims = { sub: claims.sub, tenant: claims.tenant, papel: usr.papel }
    return {
      token: assinarAcesso(novo),
      refresh: assinarRefresh(novo),
      papel: usr.papel,
      expiraEm: env.JWT_EXP_SEGUNDOS,
    }
  },
}
