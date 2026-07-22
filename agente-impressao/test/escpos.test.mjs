// Testes do gerador ESC/POS — sem impressora, só asserções sobre os bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ticketPedido, ascii, brl } from '../src/escpos.js'

const pedido = {
  senha: 45, hora: '16:47', pagamento: 'Pix', pago: true, atendente: 'Administrador',
  items: [{ nome: 'Caipirinha · Copão 770ml', preco: 23, qty: 2 }],
}

test('ascii translitera acentos do Português', () => {
  assert.equal(ascii('Caipirinha Energético ção'), 'Caipirinha Energetico cao')
  assert.equal(ascii('R$ 12,00'), 'R$ 12,00')
})

test('brl formata em reais com vírgula', () => {
  assert.equal(brl(23), 'R$ 23,00')
  assert.equal(brl(23.5), 'R$ 23,50')
})

test('ticket contém senha (3 dígitos), total e cabeçalho', () => {
  const buf = ticketPedido(pedido)
  const txt = buf.toString('ascii')
  assert.match(txt, /SUMMER DRINKS/i)
  assert.match(txt, /045/)          // senha zero-padded
  assert.match(txt, /TOTAL/)
  assert.match(txt, /R\$ 46,00/)    // 23 × 2
})

test('termina em CORTE PARCIAL (GS V B) por padrão', () => {
  const buf = ticketPedido(pedido)
  // procura a sequência 0x1D 0x56 0x42 (GS 'V' 66)
  let achou = false
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0x1d && buf[i + 1] === 0x56 && buf[i + 2] === 66) { achou = true; break }
  }
  assert.ok(achou, 'esperava o comando de corte parcial GS V B (0x1D 0x56 0x42)')
})

test('corte:total usa GS V A (0x1D 0x56 0x41)', () => {
  const buf = ticketPedido(pedido, { corte: 'total' })
  let achou = false
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0x1d && buf[i + 1] === 0x56 && buf[i + 2] === 65) { achou = true; break }
  }
  assert.ok(achou, 'esperava corte total GS V A')
})

test('inicia com ESC @ (reset)', () => {
  const buf = ticketPedido(pedido)
  assert.equal(buf[0], 0x1b)
  assert.equal(buf[1], 0x40)
})
