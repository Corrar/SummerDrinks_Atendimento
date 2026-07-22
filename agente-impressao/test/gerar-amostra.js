// Gera um ticket de amostra (DRY_RUN) e mostra a prévia — pra conferir o layout
// sem impressora. Uso: npm run teste:ticket
import { ticketPedido } from '../src/escpos.js'
import { imprimir } from '../src/impressora.js'

const pedido = {
  senha: 45, hora: '16:47', pagamento: 'Pix', pago: true, atendente: 'Administrador',
  items: [
    { nome: 'Caipirinha · Copão 770ml · Dobrada', preco: 31, qty: 2 },
    { nome: 'Whisky Energético · Copão 770ml', preco: 48, qty: 1 },
  ],
}

await imprimir(ticketPedido(pedido, { corte: 'parcial' }), { dryRun: true, arquivoTeste: 'saida-teste.bin' })
