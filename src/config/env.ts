// Carrega e valida variáveis de ambiente. Falha rápido se algo essencial faltar.
// dotenv/config popula process.env a partir do .env. Por padrão NÃO sobrescreve o
// que já está definido, então o env injetado pelos testes (vitest) continua mandando.
import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
  JWT_EXP_SEGUNDOS: z.coerce.number().int().positive().default(900),
  CORS_ORIGINS: z.string().default(''),
  PUBLIC_RATE_MAX: z.coerce.number().int().positive().default(5),
  PUBLIC_RATE_JANELA_MS: z.coerce.number().int().positive().default(60_000),
  // Senha do usuário admin semeado (scripts/seed.ts). Opcional: só o seed exige.
  SEED_ADMIN_SENHA: z.string().min(8).max(200).optional(),
  // Transporte de notificação do worker de outbox. 'fake' = in-memory (dev/test).
  // 'green' = GreenApiTransport real (WhatsApp) — exige as GREEN_API_* abaixo.
  NOTIF_DRIVER: z.enum(['fake', 'green']).default('fake'),
  // Se 'true', o server sobe o OutboxWorker em background. Default true em dev,
  // false em test (evita picos de I/O concorrentes com vitest).
  NOTIF_WORKER: z.enum(['true', 'false']).optional(),
  // Green API (WhatsApp). BASE_URL aceita a URL da instância (ex.: https://1103.api.green-api.com).
  GREEN_API_BASE_URL: z.string().url().default('https://api.green-api.com'),
  GREEN_API_ID_INSTANCE: z.string().min(1).optional(),
  GREEN_API_TOKEN: z.string().min(1).optional(),
})
  .superRefine((v, ctx) => {
    // Fail-fast no boot: driver real sem credencial derrubaria só o worker em runtime.
    if (v.NOTIF_DRIVER === 'green' && (!v.GREEN_API_ID_INSTANCE || !v.GREEN_API_TOKEN)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GREEN_API_ID_INSTANCE'],
        message: 'NOTIF_DRIVER=green exige GREEN_API_ID_INSTANCE e GREEN_API_TOKEN',
      })
    }
  })

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('[env] configuração inválida:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const raw = parsed.data

export const env = {
  ...raw,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: raw.NODE_ENV === 'production',
} as const
