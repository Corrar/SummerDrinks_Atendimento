// Schemas zod — validação estrita em toda borda. Espelham os shapes do domínio.
import { z } from 'zod'

export const pagamentoSchema = z.enum(['Pix', 'Dinheiro', 'Cartão'])
export const statusPedidoSchema = z.enum(['preparo', 'pronto', 'entregue'])

export const itemPedidoSchema = z.object({
  nome: z.string().min(1).max(120),
  preco: z.number().nonnegative(),
  qty: z.number().int().positive().max(999),
})

// POST /orders — senha e hora são do servidor; não aceitar do cliente.
export const criarPedidoSchema = z.object({
  pagamento: pagamentoSchema,
  cliente: z.string().max(80).default(''),
  pago: z.boolean().default(false),
  items: z.array(itemPedidoSchema).min(1).max(60),
})

export const marcarStatusSchema = z.object({ status: statusPedidoSchema })
export const entregaSchema = z.object({ receberAntes: z.boolean() })
export const reorderSchema = z.object({ sort: z.array(z.number().int()).max(500) })

// ---------- solicitação pública (app do cliente). status/valor/tenant NÃO vêm daqui. ----------
const semHtml = (s: string): string => s.replace(/[<>]/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim()

export const solicitacaoPublicaSchema = z.object({
  cliente: z.string().min(1).max(80).transform(semHtml),
  telefone: z.string().min(8).max(20).transform(semHtml),
  tipo: z.string().min(1).max(40).transform(semHtml),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')
    .refine((d) => new Date(d + 'T00:00:00') >= new Date(new Date().toDateString()), 'data deve ser futura'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'hora deve ser HH:MM'),
  pessoas: z.number().int().min(1).max(2000),
  obs: z.string().max(600).default('').transform(semHtml),
  local: z.string().max(160).default('').transform(semHtml),
})

// ---------- autenticação ----------
// Login do Summer: { tenantSlug, usuario, senha }. E-mail NÃO é chave de login.
// tenantSlug resolve o tenant; (tenant, usuario) identifica o operador.
// Nada aqui é confiável até o bcrypt.compare passar no AuthService.
export const loginSchema = z.object({
  tenantSlug: z.string().min(1).max(60),
  usuario:    z.string().min(1).max(60),
  senha:      z.string().min(1).max(200),
})

export const refreshSchema = z.object({
  refresh: z.string().min(1).max(4000),
})

export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>
export type SolicitacaoPublicaInput = z.infer<typeof solicitacaoPublicaSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
