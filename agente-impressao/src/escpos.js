// Gerador de ticket ESC/POS para a Tanca TP-620 (compatível ESC/POS, bobina 80mm).
// Produz os BYTES crus do comprovante — mesmo layout da tela do PDV — terminando
// em CORTE PARCIAL: o papel sai "quase 100% cortado, grudado só um pedacinho no
// centro" (GS V B — feed + partial cut). Sem dependências: só Buffer.
//
// Codepage: a bobina térmica varia (CP850/CP437/1252); pra não sair acento
// embaralhado, transliteramos para ASCII (é→e, ç→c, ã→a...). Legível em qualquer
// impressora. Se um dia fixarmos o codepage da Tanca, dá pra manter os acentos.

const ESC = 0x1b
const GS = 0x1d

// ---- transliteração de acentos (Português) → ASCII ----
const ACENTOS = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c', ñ: 'n',
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Ô: 'O',
  Õ: 'O', Ú: 'U', Ç: 'C', ª: 'a', º: 'o',
}
export function ascii(s) {
  return String(s == null ? '' : s).replace(/[^\x00-\x7F]/g, (c) => ACENTOS[c] ?? '')
}

export function brl(n) {
  return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',')
}

// Acumulador de bytes com helpers ESC/POS.
class Bytes {
  constructor() { this.partes = [] }
  raw(...b) { this.partes.push(Buffer.from(b)); return this }
  texto(s) { this.partes.push(Buffer.from(ascii(s), 'ascii')); return this }
  linha(s = '') { return this.texto(s).raw(0x0a) }
  init() { return this.raw(ESC, 0x40) }             // ESC @ — reset
  esquerda() { return this.raw(ESC, 0x61, 0) }      // ESC a 0
  centro() { return this.raw(ESC, 0x61, 1) }        // ESC a 1
  negrito(on) { return this.raw(ESC, 0x45, on ? 1 : 0) } // ESC E n
  // GS ! n — tamanho: n = (largura<<4)|altura, cada 0..7. 0=normal, 0x11=2x, 0x33=4x.
  tamanho(n) { return this.raw(GS, 0x21, n & 0x77) }
  feed(linhas = 1) { return this.raw(ESC, 0x64, linhas & 0xff) } // ESC d n
  // GS V B n — avança n e faz CORTE PARCIAL (deixa a "pontinha" grudada no centro).
  cortarParcial(feed = 3) { return this.raw(GS, 0x56, 66, feed & 0xff) }
  // GS V A n — corte total (alternativa; não usado por padrão).
  cortarTotal(feed = 3) { return this.raw(GS, 0x56, 65, feed & 0xff) }
  buffer() { return Buffer.concat(this.partes) }
}

const divisor = (larg) => '-'.repeat(larg)

// "1x Caipirinha .............. R$ 23,00" — direita alinhada; trunca à esquerda.
function linhaLR(esq, dir, larg) {
  esq = ascii(esq); dir = ascii(dir)
  const espaco = larg - dir.length
  if (espaco <= 1) return (esq + ' ' + dir).slice(0, larg)
  if (esq.length > espaco - 1) esq = esq.slice(0, espaco - 1)
  return esq + ' '.repeat(larg - esq.length - dir.length) + dir
}

/**
 * Monta o comprovante de um pedido.
 * pedido: { senha, hora, pagamento, cliente, pago, atendente?, items:[{nome,preco,qty}] }
 * opts:   { colunas=48, trailer='Summer Drinks', corte='parcial'|'total'|'nenhum' }
 */
export function ticketPedido(pedido, opts = {}) {
  const larg = opts.colunas || 48 // 80mm, Font A ≈ 48 colunas
  const nome = opts.trailer || 'Summer Drinks'
  const items = Array.isArray(pedido.items) ? pedido.items : []
  const total = items.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qty) || 0), 0)

  const b = new Bytes()
  b.init().centro()
  b.tamanho(0x11).negrito(true).linha(nome).negrito(false).tamanho(0)
  b.linha('COMPROVANTE DE PEDIDO')
  b.linha(divisor(larg))
  b.linha('SUA SENHA')
  b.tamanho(0x33).negrito(true).linha(String(pedido.senha ?? '').padStart(3, '0')).negrito(false).tamanho(0)
  b.linha(divisor(larg))

  b.esquerda()
  for (const it of items) {
    b.linha(linhaLR(`${it.qty}x ${it.nome}`, brl((Number(it.preco) || 0) * (Number(it.qty) || 0)), larg))
  }
  b.linha(divisor(larg))
  b.negrito(true).linha(linhaLR('TOTAL', brl(total), larg)).negrito(false)
  const pag = `${pedido.pagamento || ''}${pedido.pago ? ' - Pago' : ''}`.trim()
  b.linha(linhaLR(pag || '-', pedido.hora || '', larg))
  if (pedido.cliente) b.linha(`Cliente: ${pedido.cliente}`)
  else if (pedido.atendente) b.linha(`Atendido por ${pedido.atendente}`)

  b.linha(divisor(larg))
  b.centro()
  b.linha('Aguarde sua senha no painel.')
  b.linha('Obrigado pela preferencia!')

  if (opts.corte === 'total') b.cortarTotal(3)
  else if (opts.corte === 'nenhum') b.feed(4)
  else b.cortarParcial(3) // padrão: corte parcial (pedido do cliente)
  return b.buffer()
}

export { Bytes }
