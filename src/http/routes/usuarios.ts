// Rotas de USUÁRIOS (operadores do atendimento) — gestão-only. Multi-usuário
// real: a senha vira hash bcrypt (nunca em claro; nunca sai em GET). Invariante
// de segurança: sempre resta ao menos UM usuário 'gestao' ATIVO (senão ninguém
// consegue administrar). login é único por tenant (usuario_login_uk → 409).
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { pool, withTransaction, type Tx } from '../../db/pool.js'
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

/**
 * Trava (FOR UPDATE) TODAS as linhas de admin ativo do tenant e conta quantas
 * existem além de `exclui`. Rodando dentro de uma transação, isto serializa
 * operações concorrentes que afetam admins: a 2ª bloqueia até a 1ª commitar e
 * então relê a contagem já atualizada — fecha a corrida (TOCTOU) do "último
 * admin". Precisa rodar no MESMO tx da mutação seguinte.
 */
async function adminsAtivosExceto(tx: Tx, tenant: string, exclui: string): Promise<number> {
  const r = await tx.query<{ id: string }>(
    `SELECT id FROM usuario
      WHERE tenant_id = $1 AND papel = 'gestao' AND ativo = true
      FOR UPDATE`,
    [tenant],
  )
  return r.rows.filter((x) => x.id !== exclui).length
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
    // Pré-computa o hash FORA da tx (bcrypt é caro; não segurar a trava por isso).
    const novoHash = body.senha !== undefined ? await bcrypt.hash(body.senha, 12) : null

    const row = await withTransaction(async (tx) => {
      const atualR = await tx.query<LinhaUsuario>(
        `SELECT ${SEL} FROM usuario WHERE tenant_id = $1 AND id = $2`,
        [tenant, id],
      )
      const atual = atualR.rows[0]
      if (!atual) throw new ErroDominio('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)

      // Rebaixar papel ou desativar o último admin ativo → proibido (guard atômico).
      const deixariaDeSerAdminAtivo =
        (body.papel !== undefined && body.papel !== 'gestao' && atual.papel === 'gestao' && atual.ativo) ||
        (body.ativo === false && atual.papel === 'gestao' && atual.ativo)
      if (deixariaDeSerAdminAtivo && (await adminsAtivosExceto(tx, tenant, id)) === 0) {
        throw new ErroDominio('ULTIMO_ADMIN', 'Deve restar ao menos um administrador ativo.', 409)
      }

      const sets: string[] = []
      const params: unknown[] = [tenant, id]
      if (body.papel !== undefined) { params.push(body.papel); sets.push(`papel = $${params.length}`) }
      if (body.ativo !== undefined) { params.push(body.ativo); sets.push(`ativo = $${params.length}`) }
      if (novoHash !== null) { params.push(novoHash); sets.push(`hash = $${params.length}`) }
      if (!sets.length) return atual

      const r = await tx.query<LinhaUsuario>(
        `UPDATE usuario SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING ${SEL}`,
        params,
      )
      return r.rows[0]
    })
    res.json(row)
  }),
)

// DELETE /usuarios/:id — remove. Guard do último admin ativo.
usuariosRouter.delete(
  '/usuarios/:id',
  exigirPapel('gestao'),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const id = String(req.params.id)
    await withTransaction(async (tx) => {
      const alvoR = await tx.query<LinhaUsuario>(
        `SELECT ${SEL} FROM usuario WHERE tenant_id = $1 AND id = $2`,
        [tenant, id],
      )
      const alvo = alvoR.rows[0]
      if (!alvo) throw new ErroDominio('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)
      if (alvo.papel === 'gestao' && alvo.ativo && (await adminsAtivosExceto(tx, tenant, id)) === 0) {
        throw new ErroDominio('ULTIMO_ADMIN', 'Deve restar ao menos um administrador ativo.', 409)
      }
      await tx.query(`DELETE FROM usuario WHERE tenant_id = $1 AND id = $2`, [tenant, id])
    })
    res.json({ ok: true })
  }),
)
