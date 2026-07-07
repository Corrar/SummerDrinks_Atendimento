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
