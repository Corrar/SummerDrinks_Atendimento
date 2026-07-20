// Seed idempotente do CARDÁPIO REAL do Summer Drinks no tenant 'summer'.
// Porta o antigo data/menu.js do app do cliente para o catálogo do atendimento —
// a partir daqui o catálogo do servidor é a ÚNICA fonte de verdade do cardápio
// (o app consome GET /public/:tenant/menu; a lista estática foi removida do app).
//
// Reexecutável (ON CONFLICT upsert). Também remove os 3 itens de demonstração
// criados por scripts/seed.ts (gate da Fase 1), que não fazem parte do cardápio
// real. IDs são slugs estáveis do nome: NUNCA renomeie um id já publicado —
// o app referencia itens por `id__idx` (ver guard append-only em catalogo.ts).
import { pool } from '../src/db/pool.js'

const SLUG = 'summer'

// Ids de demonstração do seed da Fase 1 — fora do cardápio real.
const IDS_DEMO = ['esp-frutas-vermelhas', 'caipirinha-limao', 'balde-heineken']

interface ItemSeed {
  nome: string
  preco: number
  rotulo: string
  descricao: string
}

interface CategoriaSeed {
  cat: string
  items: ItemSeed[]
}

const it = (nome: string, preco: number, rotulo: string, descricao = ''): ItemSeed => ({
  nome,
  preco,
  rotulo,
  descricao,
})

// Cardápio real (portado 1:1 do data/menu.js do app). Categorias precisam
// pertencer ao enum de catalogo.ts (categoriaSchema).
const CARDAPIO: CategoriaSeed[] = [
  {
    cat: 'Especiais',
    items: [
      it('Whisky Energético', 48, 'Copão 770ml', '02 doses de whisky + energético + gelo sabores (coco, maracujá, morango, melancia, maçã verde). Coco Leve.'),
      it('Ice Gin Sabores', 25, 'Copão 770ml', 'Ice de limão, Gin Theros, xarope de frutas (maracujá, melancia ou maçã verde) e gelo sabor. Coco Leve.'),
      it('Big Apple', 30, 'Copão 770ml', 'Bacardi Big Apple, vodka, refrigerante Citrus e gelo de maçã verde. Coco Leve.'),
      it('Rabo Quente', 35, 'Copão 770ml', 'Borda de sal e limão, tequila, vodka, maracujá, laranja, limão, pimenta, xarope simples e gelo.'),
      it('Tetê de ET', 28, 'Mamadeira 330ml', 'Leite extraterrestre à base de vodka, leite condensado e Yakult.'),
      it('Apple Martini', 32, 'Copão 770ml', 'Borda de sal e limão, Bacardi Big Apple, vodka, licor de laranja, xarope e gelo de maçã verde. Coco Leve.'),
      it('Salsa Twist', 30, 'Copão 770ml', 'Borda de sal e limão, Bacardi Big Apple, vodka, xarope de maçã verde, salsinha e gelo. Coco Leve.'),
    ],
  },
  {
    cat: 'Balada',
    items: [
      it('Fuscão Rosa', 25, 'Copão 770ml', 'Corote de melancia, suco em pó de melancia, leite condensado, gelo de coco morango e picolé. Coco Leve.'),
      it('Ferrari', 25, 'Copão 770ml', 'Corote de morango, suco em pó de morango, leite condensado, picolé e gelo de coco morango. Coco Leve.'),
      it('Brasília Amarela', 25, 'Copão 770ml', 'Corote de maracujá, suco em pó de maracujá, leite condensado, Fanta Laranja, picolé e gelo de coco. Coco Leve.'),
      it('Chevette', 25, 'Copão 770ml', 'Corote de baunilha, suco em pó de baunilha c/ limão, leite condensado, picolé e gelo de coco. Coco Leve.'),
      it('Kombi Furiosa', 25, 'Copão 770ml', 'Corote de açaí c/ catuaba, suco em pó de uva, leite condensado, Fanta Uva, picolé e gelo de coco. Coco Leve.'),
      it('Opala Azul', 25, 'Copão 770ml', 'Corote de blueberry, suco em pó de baunilha c/ limão, leite condensado, Fanta Uva, picolé e gelo de coco. Coco Leve.'),
    ],
  },
  {
    cat: 'Aperol',
    items: [
      it('Aperol Spritz', 58, 'Copão 770ml', 'Aperol, Espumante Prosseco, Acqua Mix Soda, laranja e gelo.'),
      it('Aperol Ice Gin', 52, 'Copão 770ml', 'Aperol, Gin Apogee, Ice Ultra Spritz, laranja e gelo.'),
      it('Spaghetti', 45, 'Copão 770ml', 'Aperol, vodka, cerveja, suco de limão, laranja, copo encrustado com sal, limão e gelo.'),
    ],
  },
  {
    cat: 'Campari',
    items: [
      it('Boulevardier', 42, 'Copão 550ml', 'Campari, whisky, Vermute Rosso, Bitter Angostura e gelo.'),
      it('Negroni', 35, 'Copão 550ml', 'Campari, Gin Apogee, Vermute Rosso, Bitter Angostura e gelo.'),
      it('Garibaldi', 32, 'Copo 550ml', 'Campari e suco de laranja.'),
    ],
  },
  {
    cat: 'Batidinhas',
    items: [
      it('Limonada das Neves', 28, 'Copão 770ml', 'Leite de coco, suco de limão, champanhe, vodka, leite condensado e gelo.'),
      it('Espanhola', 25, 'Copão 770ml', 'Vinho tinto, vodka, morango ou abacaxi ou maracujá, leite condensado e gelo.'),
      it('Frutas', 23, 'Copão 770ml', 'Champanhe, vodka, coco, morango ou maracujá, leite condensado e gelo.'),
      it('Abacaxi c/ Maçã Verde', 25, 'Copão 770ml', 'Rum, abacaxi, xarope de maçã verde, leite condensado e gelo.'),
      it('Abacaxi c/ Hortelã', 25, 'Copão 770ml', 'Champanhe, vodka, abacaxi, hortelã, leite condensado e gelo.'),
      it('Paçoquita', 30, 'Copão 770ml', 'Champanhe, vodka, leite condensado, doce de leite, paçoquinha e gelo.'),
    ],
  },
  {
    cat: 'Caipirinhas',
    items: [
      it('Caipiroska', 25, 'Copão 550ml', 'Vodka, abacaxi, limão, morango ou maracujá.'),
      it('Caipirinha', 23, 'Copão 550ml', 'Cachaça, abacaxi, limão, morango ou maracujá.'),
      it('Caipirinha Gelo Água de Coco', 30, 'Copão 550ml', 'Vodka, limão, morango ou maracujá, xarope simples e gelo água de coco.'),
      it('Caipirinha Maracujá c/ Manjericão', 28, 'Copão 550ml', 'Vodka ou cachaça, maracujá, limão, manjericão, açúcar e gelo.'),
      it('CaipiCerva', 25, 'Copão 770ml', 'Caipirinha de cerveja c/ Vodka Orloff, limão, açúcar e gelo.'),
      it('CaipiRíssima Abacaxi c/ Hortelã', 28, 'Copão 550ml', 'Vodka, abacaxi, limão, açúcar, hortelã e gelo.'),
      it('Caipiroska Morango c/ Maracujá', 28, 'Copão 550ml', 'Vodka, morango, maracujá, limão, açúcar e gelo.'),
    ],
  },
  {
    cat: 'Doses',
    items: [
      it('Whisky', 25, 'Dose 100ml'),
      it('Tequila José Cuervo', 18, 'Dose'),
      it('Tequila Tequiloka', 8, 'Dose'),
      it('Campari', 20, 'Dose 100ml'),
      it('Conhaque', 15, 'Dose 100ml'),
      it('Licor de Morango', 20, 'Dose 100ml'),
      it('Licor Doce de Leite', 20, 'Dose 100ml'),
      it('Cachaça VB Gold', 7, 'Dose'),
      it('Chicletes Trident', 4.5, 'Unidade'),
      it('Corotes Sabores', 12, 'Unidade'),
      it('Gelo Coco Leve', 10, 'Unidade'),
      it('Red Bull', 20, 'Lata 250ml'),
      it('Monster', 16, 'Lata 250ml'),
    ],
  },
  {
    cat: 'Potes',
    items: [
      it('Pote Whisky Premium', 148, 'Pote 1,8L', '06 doses de whisky Red Label, White Horse ou Ballantines + energético Power Bull, com 02 gelos sabores. Coco Leve.'),
      it('Pote Whisky Passaport', 129, 'Pote 1,8L', '06 doses de whisky Passaport ou Natu Nóbilis + energético Power Bull, com 02 gelos sabores. Coco Leve.'),
      it('Pote Gin ou Vodka', 123, 'Pote 1,8L', '06 doses de gin ou vodka + energético sabores (maçã verde, mango loko, melancia ou citrus) com 02 gelos. Coco Leve.'),
      it('Pote Corotes', 98, 'Pote 1,8L', '02 drinks Corotes: Chevette, Opala, Brasília, Ferrari, Fusca ou Kombi, com 02 gelos. Coco Leve.'),
    ],
  },
  {
    cat: 'Baldes',
    items: [
      it('Balde Whisky Premium', 178, 'Balde 2,2L', '10 doses Red Label, White Horse ou Ballantines + Power Bull, 04 copão 550ml + 04 gelos. Reutilize o balde e ganhe 10% na próxima compra.'),
      it('Balde Whisky Passaport', 156, 'Balde 2,2L', '10 doses Passaport ou Natu Nóbilis + Power Bull, 04 copão 550ml + 04 gelos. Reutilize e ganhe 10% na próxima compra.'),
      it('Balde Gin ou Vodka', 148, 'Balde 2,2L', '10 doses de gin ou vodka + energético sabores + 04 copão 550ml + 04 gelos. Reutilize e ganhe 10% na próxima compra.'),
      it('Balde Corotes', 115, 'Balde 2,2L', '04 drinks Corotes + 04 copão 550ml + 04 gelos. Reutilize o balde e ganhe 10% na próxima compra.'),
    ],
  },
]

/** Slug estável do nome: minúsculas sem acento, [a-z0-9] com hífens. */
function slug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main(): Promise<void> {
  const t = await pool.query<{ id: string }>(`SELECT id FROM tenant WHERE slug = $1`, [SLUG])
  const tid = t.rows[0]?.id
  if (!tid) {
    throw new Error(`tenant '${SLUG}' não existe — rode 'npm run seed' antes deste script.`)
  }

  // Ids duplicados quebrariam o upsert silenciosamente (o segundo venceria).
  const ids = CARDAPIO.flatMap((c) => c.items.map((x) => slug(x.nome)))
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new Error(`id duplicado no cardápio do seed: '${dup}'`)

  let ordem = 0
  let upserts = 0
  for (const categoria of CARDAPIO) {
    for (const item of categoria.items) {
      ordem += 1
      await pool.query(
        `INSERT INTO catalogo_item (tenant_id, id, cat, nome, descricao, tamanhos, img, ordem)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, '', $7)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET cat = EXCLUDED.cat, nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
               tamanhos = EXCLUDED.tamanhos, ordem = EXCLUDED.ordem,
               atualizado_em = now()`,
        [
          tid,
          slug(item.nome),
          categoria.cat,
          item.nome,
          item.descricao,
          JSON.stringify([{ rotulo: item.rotulo, preco: item.preco }]),
          ordem,
        ],
      )
      upserts += 1
    }
  }

  const demo = await pool.query(
    `DELETE FROM catalogo_item WHERE tenant_id = $1 AND id = ANY($2::text[])`,
    [tid, IDS_DEMO],
  )

  // Itens fora do seed (cadastrados pela gestão) são preservados — só avisa.
  const extras = await pool.query<{ id: string }>(
    `SELECT id FROM catalogo_item WHERE tenant_id = $1 AND NOT (id = ANY($2::text[]))`,
    [tid, ids],
  )
  if (extras.rows.length) {
    console.log(`[seed-menu] mantidos ${extras.rows.length} itens fora do seed: ${extras.rows.map((r) => r.id).join(', ')}`)
  }

  console.log(`[seed-menu] OK — ${upserts} itens do cardápio real, ${demo.rowCount ?? 0} demo removidos (tenant='${SLUG}')`)
  await pool.end()
}

main().catch((e: unknown) => {
  console.error('[seed-menu] falhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
