// Schemas zod da BORDA PÚBLICA (app do cliente). Mundo zero-trust.
// Diferente dos schemas internos: aqui NADA de sensível é aceito do cliente —
// preço, senha, status, valor e tenant são todos definidos pelo servidor.
import { z } from 'zod'

// Remove HTML/control chars de qualquer texto livre vindo do cliente.
const semHtml = (s: string): string =>
  s
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()

// ---------- PEDIDO público ----------
// O cliente manda apenas a REFERÊNCIA do item (id) e a quantidade.
// O preço vem do catálogo no servidor (re-precificação). `p` opcional é só
// para telemetria de divergência — nunca vira dinheiro.
export const itemPublicoSchema = z.object({
  id: z.string().min(1).max(80),
  qty: z.number().int().positive().max(99),
  p: z.number().nonnegative().optional(), // apenas para log de divergência
})

export const pedidoPublicoSchema = z.object({
  cliente: z.string().max(80).default('').transform(semHtml),
  // method do app do cliente
  pagamento: z.enum(['pix', 'cartao', 'especie']),
  // payNow do app do cliente
  pago: z.boolean().default(false),
  itens: z.array(itemPublicoSchema).min(1).max(60),
})

// ---------- EVENTO público ----------
// Payload COMPLETO do formulário de eventos (o app hoje trunca; o patch corrige).
export const eventoPublicoSchema = z.object({
  nome: z.string().min(1).max(80).transform(semHtml),
  telefone: z.string().min(8).max(20).transform(semHtml),
  email: z
    .string()
    .max(120)
    .optional()
    .default('')
    .transform((s) => semHtml(s)),
  tipo: z.string().min(1).max(40).transform(semHtml),
  // o app envia string ('12') ou vazio; coagimos e limitamos.
  pessoas: z.coerce.number().int().min(0).max(5000).default(0),
  local: z.string().max(160).default('').transform(semHtml),
  obs: z.string().max(600).default('').transform(semHtml),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')
    .refine(
      (d) => new Date(d + 'T00:00:00') >= new Date(new Date().toDateString()),
      'data deve ser hoje ou futura',
    ),
  slot: z.enum(['Tarde', 'Noite', 'Madrugada']),
})

export type ItemPublicoInput = z.infer<typeof itemPublicoSchema>
export type PedidoPublicoInput = z.infer<typeof pedidoPublicoSchema>
export type EventoPublicoInput = z.infer<typeof eventoPublicoSchema>
