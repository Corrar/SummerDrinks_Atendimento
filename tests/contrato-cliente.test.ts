// CONTRATO cliente ↔ atendimento — a fronteira de comunicação entre os dois
// sistemas, verificada em código. Cada payload aqui é EXATAMENTE o que o app do
// cliente (SummerDrinks_Cliente, src/lib/api.js + hooks) envia. Se qualquer um
// dos lados mudar a forma, este teste quebra — é o guarda contra drift de
// contrato entre os dois repositórios. Puro (sem DB, sem HTTP): valida os
// schemas zod da borda e as funções da ACL que traduzem os shapes do cliente.
import { describe, it, expect } from 'vitest'
import {
  pedidoPublicoSchema,
  eventoPublicoSchema,
  avaliacaoPublicaSchema,
} from '../src/types/schemas-publicos.js'
import {
  encodeRefItem,
  decodeRefItem,
  pagamentoDoMetodo,
  horaDoSlot,
} from '../src/types/acl.js'

describe('contrato: PEDIDO (POST /public/:tenant/pedidos)', () => {
  // Exatamente o objeto montado em useRemoteOrders.criarPedido do app.
  const payloadDoApp = {
    cliente: 'Ana',
    pagamento: 'pix',
    pago: false,
    itens: [
      { id: 'whe__0', qty: 2, p: 25 },
      { id: 'caipirinha__1', qty: 1, p: 24 },
    ],
  }

  it('aceita o payload real do app', () => {
    const r = pedidoPublicoSchema.safeParse(payloadDoApp)
    expect(r.success).toBe(true)
  })

  it('aceita os três métodos de pagamento que o app oferece', () => {
    for (const pagamento of ['pix', 'cartao', 'especie']) {
      expect(pedidoPublicoSchema.safeParse({ ...payloadDoApp, pagamento }).success).toBe(true)
    }
  })

  it('rejeita método de pagamento fora do enum e carrinho vazio', () => {
    expect(pedidoPublicoSchema.safeParse({ ...payloadDoApp, pagamento: 'boleto' }).success).toBe(false)
    expect(pedidoPublicoSchema.safeParse({ ...payloadDoApp, itens: [] }).success).toBe(false)
  })

  it('cliente omitido vira string vazia (o app às vezes não coleta o nome)', () => {
    const r = pedidoPublicoSchema.parse({ pagamento: 'pix', itens: [{ id: 'whe__0', qty: 1 }] })
    expect(r.cliente).toBe('')
    expect(r.pago).toBe(false)
  })
})

describe('contrato: referência de item (id do menu ↔ re-precificação)', () => {
  it('o id do menu público faz round-trip encode/decode', () => {
    const id = encodeRefItem('whe', 0)
    expect(id).toBe('whe__0')
    expect(decodeRefItem(id)).toEqual({ catalogoId: 'whe', tamanhoIdx: 0 })
  })

  it('o formato antigo do cardápio estático ("0-3") é REJEITADO (regressão da migração)', () => {
    // Antes da migração para o cardápio vivo, o app mandava id "ci-ii"; o
    // servidor precisa recusá-lo (vira 422 ITEM_INVALIDO), nunca decodificar.
    expect(decodeRefItem('0-3')).toBeNull()
    expect(decodeRefItem('semseparador')).toBeNull()
  })
})

describe('contrato: AVALIAÇÃO (POST /public/:tenant/pedido/:token/avaliacao)', () => {
  it('aceita { nota, comentario } do app', () => {
    expect(avaliacaoPublicaSchema.safeParse({ nota: 5, comentario: 'Drinks excelentes!' }).success).toBe(true)
    expect(avaliacaoPublicaSchema.safeParse({ nota: 3 }).success).toBe(true) // comentário opcional
  })

  it('rejeita nota fora de 1..5 e não-inteira', () => {
    for (const nota of [0, 6, 3.5, -1]) {
      expect(avaliacaoPublicaSchema.safeParse({ nota }).success).toBe(false)
    }
  })

  it('sanitiza HTML do comentário (semHtml)', () => {
    const r = avaliacaoPublicaSchema.parse({ nota: 5, comentario: '<script>x</script> bom' })
    expect(r.comentario).not.toMatch(/[<>]/)
    expect(r.comentario).toContain('bom')
  })
})

describe('contrato: EVENTO (POST /public/:tenant/eventos)', () => {
  // Exatamente o objeto montado em App.submitEvent do app.
  const payloadDoApp = {
    nome: 'Ana',
    telefone: '81999990000',
    email: 'ana@example.com',
    tipo: 'Aniversário',
    pessoas: '12', // o app manda string; o schema coage
    local: 'Sítio',
    obs: 'sem amendoim',
    data: '2099-12-31',
    slot: 'Noite',
  }

  it('aceita o payload real do app e coage pessoas para número', () => {
    const r = eventoPublicoSchema.parse(payloadDoApp)
    expect(r.pessoas).toBe(12)
    expect(typeof r.pessoas).toBe('number')
  })

  it('rejeita slot fora do enum Tarde/Noite/Madrugada', () => {
    expect(eventoPublicoSchema.safeParse({ ...payloadDoApp, slot: 'Almoço' }).success).toBe(false)
  })
})

describe('contrato: traduções da ACL (cliente → domínio)', () => {
  it('pagamento do método bate com o mapa do app', () => {
    expect(pagamentoDoMetodo('pix')).toBe('Pix')
    expect(pagamentoDoMetodo('cartao')).toBe('Cartão')
    expect(pagamentoDoMetodo('especie')).toBe('Dinheiro')
  })

  it('slot → hora canônica (usada na disponibilidade e na agenda)', () => {
    expect(horaDoSlot('Tarde')).toBe('14:00')
    expect(horaDoSlot('Noite')).toBe('19:00')
    expect(horaDoSlot('Madrugada')).toBe('23:00')
  })
})
