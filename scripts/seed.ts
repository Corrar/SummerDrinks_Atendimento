// Seed idempotente do tenant 'summer' para o gate da Fase 1.
// Cria: tenant, config mínima, 3 itens de catálogo reais e 1 usuário gestão.
// Reexecutável (ON CONFLICT). A senha do admin NUNCA é hardcoded: vem de
// env.SEED_ADMIN_SENHA e é guardada apenas como hash bcrypt (colunas login/hash).
import bcrypt from 'bcryptjs'
import { pool } from '../src/db/pool.js'
import { env } from '../src/config/env.js'

const SLUG = 'summer'
const ADMIN_LOGIN = 'admin'

// Config mínima válida (shapes espelham data/config do frontend).
const HORARIOS = [
  { dia: 'sexta', curto: 'Sex', aberto: true, abre: '18:00', fecha: '23:59' },
  { dia: 'sabado', curto: 'Sáb', aberto: true, abre: '18:00', fecha: '23:59' },
]
const LOCAIS = [{ id: 'sede', nome: 'Summer Sede', endereco: '', ativo: true }]

// 3 itens reais, cada um com tamanhos [{ rotulo, preco }].
const CATALOGO = [
  {
    id: 'esp-frutas-vermelhas',
    cat: 'Especiais',
    nome: 'Especial Frutas Vermelhas',
    descricao: 'Vodka, frutas vermelhas e limão.',
    tamanhos: [
      { rotulo: 'Copo 400ml', preco: 22 },
      { rotulo: 'Jarra 1L', preco: 55 },
    ],
    ordem: 1,
  },
  {
    id: 'caipirinha-limao',
    cat: 'Caipirinhas',
    nome: 'Caipirinha de Limão',
    descricao: 'Cachaça, limão e açúcar.',
    tamanhos: [
      { rotulo: 'Tradicional', preco: 16 },
      { rotulo: 'Dobrada', preco: 24 },
    ],
    ordem: 2,
  },
  {
    id: 'balde-heineken',
    cat: 'Baldes',
    nome: 'Balde Heineken',
    descricao: 'Long necks geladas no gelo.',
    tamanhos: [
      { rotulo: 'Balde 5un', preco: 60 },
      { rotulo: 'Balde 8un', preco: 92 },
    ],
    ordem: 3,
  },
]

async function main(): Promise<void> {
  if (!env.SEED_ADMIN_SENHA) {
    throw new Error('SEED_ADMIN_SENHA ausente no .env — defina antes de semear o admin.')
  }

  // ---------- tenant ----------
  await pool.query(
    `INSERT INTO tenant (slug, nome) VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING`,
    [SLUG, 'Summer Drinks'],
  )
  const t = await pool.query<{ id: string }>(`SELECT id FROM tenant WHERE slug = $1`, [SLUG])
  const tid = t.rows[0]?.id
  if (!tid) throw new Error("tenant 'summer' não foi criado")

  // ---------- config (1 linha por tenant) ----------
  await pool.query(
    `INSERT INTO config (tenant_id, horarios, locais, telefone, whatsapp)
       VALUES ($1, $2::jsonb, $3::jsonb, '', '')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tid, JSON.stringify(HORARIOS), JSON.stringify(LOCAIS)],
  )

  // ---------- catálogo (3 itens) ----------
  for (const it of CATALOGO) {
    await pool.query(
      `INSERT INTO catalogo_item (tenant_id, id, cat, nome, descricao, tamanhos, img, ordem)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, '', $7)
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET cat = EXCLUDED.cat, nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
             tamanhos = EXCLUDED.tamanhos, ordem = EXCLUDED.ordem,
             atualizado_em = now()`,
      [tid, it.id, it.cat, it.nome, it.descricao, JSON.stringify(it.tamanhos), it.ordem],
    )
  }

  // ---------- usuário admin (gestão) ----------
  // hash bcrypt com custo 12 — a senha em claro nunca toca o banco nem o log.
  const hash = await bcrypt.hash(env.SEED_ADMIN_SENHA, 12)
  await pool.query(
    `INSERT INTO usuario (tenant_id, login, hash, papel, ativo)
       VALUES ($1, $2, $3, 'gestao', true)
     ON CONFLICT (tenant_id, login) DO UPDATE
       SET hash = EXCLUDED.hash, papel = 'gestao', ativo = true`,
    [tid, ADMIN_LOGIN, hash],
  )

  console.log(`[seed] OK — tenant='${SLUG}' (${tid}), 3 itens, admin login='${ADMIN_LOGIN}' papel=gestao`)
  await pool.end()
}

main().catch((e: unknown) => {
  console.error('[seed] falhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
