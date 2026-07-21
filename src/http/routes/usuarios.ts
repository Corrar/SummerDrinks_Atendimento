// Rotas de USUÁRIOS (operadores do atendimento) — gestão-only. Multi-usuário
// real: a senha vira hash bcrypt (nunca em claro; nunca sai em GET). Invariante
// de segurança: sempre resta ao menos UM usuário 'gestao' ATIVO (senão ninguém
// consegue administrar). login é único por tenant (usuario_login_uk → 409).
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { pool } from '../../db/pool.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { ErroDominio } from '../../types/domain.js'

export const usuariosRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

const papelSchema = z.enum(['gestao', 'pdv', 'painel'])

const criarSchema = z
  .object({
    login: z.string().min(3).max(40).transform((s) => s.trim().toLowerCase()),
    senha: z.string().min(4).max(200),
    papel: papelSchema.default('pdv'),
  })
  .strict()

const atualizarSchema = z
  .object({
    papel: papelSchema.optional(),
    ativo: z.boolean().optional(),
    senha: z.string().min(4).max(200).optional(),
  })
  .strict()

interface LinhaUsuario {
  id: string
  login: string
  papel: 'gestao' | 'pdv' | 'painel'
  ativo: boolean
}

const SEL = 'id, login, papel, ativo'

async function contarAdminsAtivos(tenant: string, exclui?: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM usuario
      WHERE tenant_id = $1 AND papel = 'gestao' AND ativo = true
        AND ($2::text IS NULL OR id <> $2)`,
    [tenant, exclui ?? null],
  )
  return Number(r.rows[0]?.n ?? 0)
}

// GET /usuarios — lista (sem hash).
usuariosRouter.get(
  '/usuarios',
  exigirPapel('gestao'),
  asy(async (req, res) => {
    const r = await pool.query<LinhaUsuario>(
      `SELECT ${SEL} FROM usuario WHERE tenant_id = $1 ORDER BY criado_em`,
      [req.auth!.tenant],
    )
    res.json(r.rows)
  }),
)

// POST /usuarios — cria operador (senha → hash bcrypt).
usuariosRouter.post(
  '/usuarios',
  exigirPapel('gestao'),
  validarBody(criarSchema),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const { login, senha, papel } = req.body as z.infer<typeof criarSchema>
    const hash = await bcrypt.hash(senha, 12)
    try {
      const r = await pool.query<LinhaUsuario>(
        `INSERT INTO usuario (tenant_id, login, hash, papel, ativo)
           VALUES ($1, $2, $3, $4, true)
         RETURNING ${SEL}`,
        [tenant, login, hash, papel],
      )
      res.status(201).json(r.rows[0])
    } catch (e: unknown) {
      // 23505 = unique_violation (usuario_login_uk)
      if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === '23505') {
        throw new ErroDominio('LOGIN_EM_USO', 'Já existe um usuário com este login.', 409)
      }
      throw e
    }
  }),
)

// PATCH /usuarios/:id — papel / ativo / senha. Guard do último admin ativo.
usuariosRouter.patch(
  '/usuarios/:id',
  exigirPapel('gestao'),
  validarBody(atualizarSchema),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const id = String(req.params.id)
    const body = req.body as z.infer<typeof atualizarSchema>

    const atualR = await pool.query<LinhaUsuario>(
      `SELECT ${SEL} FROM usuario WHERE tenant_id = $1 AND id = $2`,
      [tenant, id],
    )
    const atual = atualR.rows[0]
    if (!atual) throw new ErroDominio('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)

    // Rebaixar papel ou desativar o último admin ativo → proibido.
    const deixariaDeSerAdminAtivo =
      (body.papel !== undefined && body.papel !== 'gestao' && atual.papel === 'gestao' && atual.ativo) ||
      (body.ativo === false && atual.papel === 'gestao' && atual.ativo)
    if (deixariaDeSerAdminAtivo && (await contarAdminsAtivos(tenant, id)) === 0) {
      throw new ErroDominio('ULTIMO_ADMIN', 'Deve restar ao menos um administrador ativo.', 409)
    }

    const sets: string[] = []
    const params: unknown[] = [tenant, id]
    if (body.papel !== undefined) { params.push(body.papel); sets.push(`papel = $${params.length}`) }
    if (body.ativo !== undefined) { params.push(body.ativo); sets.push(`ativo = $${params.length}`) }
    if (body.senha !== undefined) { params.push(await bcrypt.hash(body.senha, 12)); sets.push(`hash = $${params.length}`) }
    if (!sets.length) { res.json(atual); return }

    const r = await pool.query<LinhaUsuario>(
      `UPDATE usuario SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING ${SEL}`,
      params,
    )
    res.json(r.rows[0])
  }),
)

// DELETE /usuarios/:id — remove. Guard do último admin ativo.
usuariosRouter.delete(
  '/usuarios/:id',
  exigirPapel('gestao'),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const id = String(req.params.id)
    const alvoR = await pool.query<LinhaUsuario>(
      `SELECT ${SEL} FROM usuario WHERE tenant_id = $1 AND id = $2`,
      [tenant, id],
    )
    const alvo = alvoR.rows[0]
    if (!alvo) throw new ErroDominio('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)
    if (alvo.papel === 'gestao' && alvo.ativo && (await contarAdminsAtivos(tenant, id)) === 0) {
      throw new ErroDominio('ULTIMO_ADMIN', 'Deve restar ao menos um administrador ativo.', 409)
    }
    await pool.query(`DELETE FROM usuario WHERE tenant_id = $1 AND id = $2`, [tenant, id])
    res.json({ ok: true })
  }),
)
