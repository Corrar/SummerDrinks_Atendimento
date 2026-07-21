// Cria (ou atualiza) UM usuário de login no banco — o jeito direto de ter acesso
// ao sistema sem semear catálogo/config junto. Serve tanto para o 1º admin quanto
// para adicionar operadores depois.
//
// A senha NUNCA é gravada em claro nem aparece em log: só o hash bcrypt (custo 12)
// vai ao banco. Reexecutável: se o login já existir no tenant, a senha/papel são
// atualizados (ON CONFLICT DO UPDATE) — útil para redefinir uma senha esquecida.
//
// Uso (argumentos):
//   npm run usuario:criar -- <login> <senha> [papel] [tenantSlug]
//   ex.: npm run usuario:criar -- admin 'MinhaSenhaForte' gestao summer
//
// Uso (variáveis de ambiente — bom para não deixar a senha no histórico do shell):
//   NOVO_LOGIN=admin NOVA_SENHA='MinhaSenhaForte' npm run usuario:criar
//
// papel: gestao (acesso total) | pdv | painel     (default: gestao)
// tenantSlug: identificador do estabelecimento     (default: summer)
import bcrypt from 'bcryptjs'
import { pool } from '../src/db/pool.js'

const PAPEIS = ['gestao', 'pdv', 'painel'] as const
type Papel = (typeof PAPEIS)[number]

// Argumentos posicionais têm prioridade; caem para as variáveis de ambiente.
const argv = process.argv.slice(2)
const login = (argv[0] ?? process.env.NOVO_LOGIN ?? '').trim().toLowerCase()
const senha = argv[1] ?? process.env.NOVA_SENHA ?? ''
const papelRaw = (argv[2] ?? process.env.NOVO_PAPEL ?? 'gestao').trim().toLowerCase()
const slug = (argv[3] ?? process.env.TENANT_SLUG ?? 'summer').trim().toLowerCase()

function abortar(msg: string): never {
  console.error(`[usuario] ${msg}`)
  console.error('Uso: npm run usuario:criar -- <login> <senha> [papel] [tenantSlug]')
  process.exit(1)
}

if (login.length < 3) abortar('login inválido — mínimo de 3 caracteres.')
if (senha.length < 8) abortar('senha inválida — mínimo de 8 caracteres.')
if (!(PAPEIS as readonly string[]).includes(papelRaw)) {
  abortar(`papel inválido '${papelRaw}' — use um de: ${PAPEIS.join(', ')}.`)
}
const papel = papelRaw as Papel

async function main(): Promise<void> {
  // Garante o tenant (mesma lógica do seed) — assim o script funciona em banco zerado.
  await pool.query(
    `INSERT INTO tenant (slug, nome) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
    [slug, 'Summer Drinks'],
  )
  const t = await pool.query<{ id: string }>(`SELECT id FROM tenant WHERE slug = $1`, [slug])
  const tid = t.rows[0]?.id
  if (!tid) abortar(`tenant '${slug}' não encontrado e não pôde ser criado.`)

  const hash = await bcrypt.hash(senha, 12)
  const r = await pool.query<{ acao: string }>(
    `INSERT INTO usuario (tenant_id, login, hash, papel, ativo)
       VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (tenant_id, login) DO UPDATE
       SET hash = EXCLUDED.hash, papel = EXCLUDED.papel, ativo = true
     RETURNING (CASE WHEN xmax = 0 THEN 'criado' ELSE 'atualizado' END) AS acao`,
    [tid, login, hash, papel],
  )
  const acao = r.rows[0]?.acao ?? 'gravado'

  console.log(
    `[usuario] ${acao} — tenant='${slug}' login='${login}' papel='${papel}' ativo=true`,
  )
  console.log('[usuario] pronto: use este login e a senha informada para entrar no painel.')
  await pool.end()
}

main().catch((e: unknown) => {
  console.error('[usuario] falhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
