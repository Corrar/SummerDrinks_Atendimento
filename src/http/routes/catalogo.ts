// Rotas de catálogo — CRUD da operação (pattern-setter dos routers de gestão).
// Montado APÓS a fronteira de auth (app.ts): req.auth já está populado aqui.
// Todas as rotas exigem papel 'gestao' (RBAC fino por-rota). Escrita SEMPRE
// escopada a req.auth!.tenant (nunca aceita tenant do cliente). Queries
// parametrizadas; `tamanhos` é jsonb (serializa com JSON.stringify).
//
// NÃO escreve `pedido`. NÃO toca OrderService. Emite só p/ a sala autenticada
// do tenant (nunca p/ a sala pública — o /menu público é cacheado 60s).
//
// `tamanhos` é APPEND-ONLY até o gate de id estável: o id de menu público é
// POSICIONAL (catalogoId__idx), então REMOVER um índice invalida referências já
// entregues ao app do cliente (o PUT recusa encolher com 409). REORDENAR também é
// desaconselhado pelo mesmo motivo. Seguros: append de novo tamanho e edição de
// rotulo/preco em um índice existente.
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { emitir } from '../../realtime/io.js'
import { exigirPapel } from '../middleware/auth.js'
import { validarBody } from '../middleware/validate.js'
import { ErroDominio } from '../../types/domain.js'

export const catalogoRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

// Categorias válidas — DEVE espelhar COR_CATEGORIA em routes/public.ts.
// (Adicionar categoria nova exige atualizar os dois lugares.)
const categoriaSchema = z.enum([
  'Especiais',
  'Balada',
  'Aperol',
  'Campari',
  'Batidinhas',
  'Caipirinhas',
  'Doses',
  'Potes',
  'Baldes',
])

const tamanhoSchema = z.object({
  rotulo: z.string().min(1).max(40),
  preco: z.number().nonnegative(),
})

// Schema completo do item. `id` é a chave (com o tenant). Preço vem daqui e é a
// fonte da verdade re-precificada na borda pública.
const itemSchema = z.object({
  id: z.string().min(1).max(40),
  cat: categoriaSchema,
  nome: z.string().min(1).max(80),
  descricao: z.string().max(400).default(''),
  tamanhos: z.array(tamanhoSchema).min(1),
  img: z.string().max(300).default(''),
  ordem: z.number().int().default(0),
})

type ItemInput = z.infer<typeof itemSchema>

// Colunas retornadas ao painel (shape interno do catálogo).
const COLS = 'id, cat, nome, descricao, tamanhos, img, ordem'

// GET /catalogo — lista os itens do tenant autenticado.
catalogoRouter.get(
  '/catalogo',
  exigirPapel('gestao'),
  asy(async (req, res) => {
    const r = await pool.query(
      `SELECT ${COLS} FROM catalogo_item WHERE tenant_id = $1 ORDER BY ordem, nome`,
      [req.auth!.tenant],
    )
    res.json(r.rows)
  }),
)

// POST /catalogo — cria (ou upserta) um item. ON CONFLICT (tenant_id, id) DO UPDATE.
catalogoRouter.post(
  '/catalogo',
  exigirPapel('gestao'),
  validarBody(itemSchema),
  asy(async (req, res) => {
    const b = req.body as ItemInput
    const tenant = req.auth!.tenant
    const r = await pool.query(
      `INSERT INTO catalogo_item (tenant_id, id, cat, nome, descricao, tamanhos, img, ordem)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET cat = EXCLUDED.cat, nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
             tamanhos = EXCLUDED.tamanhos, img = EXCLUDED.img, ordem = EXCLUDED.ordem,
             atualizado_em = now()
       RETURNING ${COLS}`,
      [tenant, b.id, b.cat, b.nome, b.descricao, JSON.stringify(b.tamanhos), b.img, b.ordem],
    )
    const item = r.rows[0]
    emitir(tenant, 'catalogo:updated', item)
    res.status(201).json(item)
  }),
)

// PUT /catalogo/:id — atualiza (last-write-wins). 404 se não existir no tenant.
// Guard append-only: recusa (409) ENCOLHER `tamanhos` (id de menu é posicional).
catalogoRouter.put(
  '/catalogo/:id',
  exigirPapel('gestao'),
  validarBody(itemSchema),
  asy(async (req, res) => {
    const b = req.body as ItemInput
    const tenant = req.auth!.tenant
    const id = String(req.params.id)
    // A URL é a identidade do recurso: o id do corpo não pode divergir.
    if (b.id !== id) throw new ErroDominio('ID_INCONSISTENTE', 'ID do corpo difere do path.', 400)

    // Estado atual: existência + nº de tamanhos (guard append-only). Entre este SELECT
    // e o UPDATE a linha pode sumir (delete concorrente) — o UPDATE reconfirma abaixo.
    const atualR = await pool.query<{ tamanhos: unknown[] }>(
      `SELECT tamanhos FROM catalogo_item WHERE tenant_id = $1 AND id = $2`,
      [tenant, id],
    )
    const atual = atualR.rows[0]
    if (!atual) throw new ErroDominio('CATALOGO_NAO_ENCONTRADO', 'Item não encontrado.', 404)
    if (b.tamanhos.length < atual.tamanhos.length) {
      throw new ErroDominio(
        'TAMANHOS_SHRINK',
        'Reduzir tamanhos invalida referências de menu (id posicional). ' +
          'Edite ou acrescente; não remova até o gate de id estável.',
        409,
      )
    }

    const r = await pool.query(
      `UPDATE catalogo_item
          SET cat = $3, nome = $4, descricao = $5, tamanhos = $6::jsonb, img = $7, ordem = $8,
              atualizado_em = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING ${COLS}`,
      [tenant, id, b.cat, b.nome, b.descricao, JSON.stringify(b.tamanhos), b.img, b.ordem],
    )
    const item = r.rows[0]
    if (!item) throw new ErroDominio('CATALOGO_NAO_ENCONTRADO', 'Item não encontrado.', 404)
    emitir(tenant, 'catalogo:updated', item)
    res.json(item)
  }),
)

// DELETE /catalogo/:id — remove. 404 se não existir no tenant.
catalogoRouter.delete(
  '/catalogo/:id',
  exigirPapel('gestao'),
  asy(async (req, res) => {
    const tenant = req.auth!.tenant
    const id = String(req.params.id)
    const r = await pool.query(
      `DELETE FROM catalogo_item WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenant, id],
    )
    if (r.rowCount === 0) throw new ErroDominio('CATALOGO_NAO_ENCONTRADO', 'Item não encontrado.', 404)
    emitir(tenant, 'catalogo:updated', { id })
    res.json({ id, removido: true })
  }),
)
