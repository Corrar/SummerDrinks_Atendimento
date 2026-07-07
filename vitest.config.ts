import { defineConfig } from 'vitest/config'

// O código-fonte usa NodeNext (imports com sufixo .js apontando para arquivos .ts).
// O Vite/Vitest não resolve isso por padrão — este plugin reescreve `.js`→`.ts`
// em specifiers relativos para carregar o grafo de módulos nos testes.
const resolveJsToTs = {
  name: 'resolve-js-to-ts',
  enforce: 'pre' as const,
  async resolveId(this: { resolve: (s: string, i?: string, o?: { skipSelf: boolean }) => Promise<{ id: string } | null> }, source: string, importer: string | undefined) {
    if (importer && source.startsWith('.') && source.endsWith('.js')) {
      const alvo = source.slice(0, -3) + '.ts'
      const r = await this.resolve(alvo, importer, { skipSelf: true })
      if (r) return r.id
    }
    return null
  },
}

export default defineConfig({
  plugins: [resolveJsToTs],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // env mínimo para o app subir. DATABASE_URL é um placeholder: os testes de
    // GATE A não tocam o banco; os testes de integração (GATE G) exigem um
    // Postgres real apontado por DATABASE_URL (ver tests/README).
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://user:pass@127.0.0.1:5432/summer_test',
      JWT_SECRET: process.env.JWT_SECRET ?? 'segredo-de-teste-com-mais-de-32-caracteres-ok',
      JWT_EXP_SEGUNDOS: '900',
      CORS_ORIGINS: '',
    },
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
})
