// Rotas de AVALIAÇÕES (feedback dos clientes sobre pedidos), sob a fronteira de
// auth. Leitura para gestão/pdv/painel (conteúdo do cliente, sem PII — o nome no
// pedido é o que o próprio cliente digitou e já aparece no PDV). A escrita é
// exclusiva da borda pública (POST /public/:tenant/pedido/:token/avaliacao).
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { exigirPapel } from '../middleware/auth.js'
import { ErroDominio } from '../../types/domain.js'

export const avaliacoesRouter = Router()

const asy =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

const periodoSchema = z
  .object({
    de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((q) => q.de <= q.ate, { message: 'de deve ser <= ate' })

interface LinhaAvaliacao {
  nota: number
  comentario: string
  criado_em: string
  senha: number
  dia: string
  cliente: string
}

// GET /avaliacoes?de=YYYY-MM-DD&ate=YYYY-MM-DD — listagem + agregado do período.
// Agregação no SQL (mesmo padrão do /orders/relatorio); lista limitada a 200.
avaliacoesRouter.get(
  '/avaliacoes',
  exigirPapel('gestao', 'pdv', 'painel'),
  asy(async (req, res) => {
    const q = periodoSchema.safeParse(req.query)
    if (!q.success) {
      throw new ErroDominio('PERIODO_INVALIDO', 'Período inválido (use de=YYYY-MM-DD&ate=YYYY-MM-DD).', 400)
    }
    const { de, ate } = q.data
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000
    if (dias > 400) throw new ErroDominio('PERIODO_LONGO', 'Período máximo: 400 dias.', 422)
    const tenant = req.auth!.tenant

    const listaQ = pool.query<LinhaAvaliacao>(
      `SELECT a.nota, a.comentario, a.criado_em::text AS criado_em,
              p.senha, to_char(p.dia, 'YYYY-MM-DD') AS dia, p.cliente
         FROM avaliacao a
         JOIN pedido p ON p.tenant_id = a.tenant_id AND p.token = a.token
        WHERE a.tenant_id = $1
          AND a.criado_em >= $2::date
          AND a.criado_em < ($3::date + interval '1 day')
        ORDER BY a.criado_em DESC
        LIMIT 200`,
      [tenant, de, ate],
    )
    const aggQ = pool.query<{ qtd: string; media: string | null; n1: string; n2: string; n3: string; n4: string; n5: string }>(
      `SELECT count(*)::text AS qtd,
              round(avg(nota), 2)::text AS media,
              count(*) FILTER (WHERE nota = 1)::text AS n1,
              count(*) FILTER (WHERE nota = 2)::text AS n2,
              count(*) FILTER (WHERE nota = 3)::text AS n3,
              count(*) FILTER (WHERE nota = 4)::text AS n4,
              count(*) FILTER (WHERE nota = 5)::text AS n5
         FROM avaliacao
        WHERE tenant_id = $1
          AND criado_em >= $2::date
          AND criado_em < ($3::date + interval '1 day')`,
      [tenant, de, ate],
    )
    const [lista, agg] = await Promise.all([listaQ, aggQ])
    const a = agg.rows[0]
    res.json({
      qtd: Number(a?.qtd ?? 0),
      media: a?.media != null ? Number(a.media) : null,
      distribuicao: {
        1: Number(a?.n1 ?? 0),
        2: Number(a?.n2 ?? 0),
        3: Number(a?.n3 ?? 0),
        4: Number(a?.n4 ?? 0),
        5: Number(a?.n5 ?? 0),
      },
      avaliacoes: lista.rows,
    })
  }),
)
