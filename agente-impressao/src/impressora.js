// Envio dos bytes ESC/POS para a Tanca TP-620.
// Padrão: Ethernet (rede) via TCP na porta 9100 (RAW/JetDirect) — o jeito mais
// confiável pra impressão automática e silenciosa. Em DRY_RUN, em vez de imprimir,
// grava os bytes num arquivo e mostra um resumo (pra testar sem a impressora).
import net from 'node:net'
import { writeFileSync } from 'node:fs'

/**
 * Envia um Buffer ESC/POS para a impressora.
 * cfg: { host, port=9100, timeoutMs=8000, dryRun=false, arquivoTeste='saida-teste.bin' }
 */
export function imprimir(buffer, cfg = {}) {
  const { host, port = 9100, timeoutMs = 8000, dryRun = false, arquivoTeste = 'saida-teste.bin' } = cfg

  if (dryRun) {
    writeFileSync(arquivoTeste, buffer)
    const texto = buffer.toString('ascii').replace(/[^\x20-\x7E\n]/g, '.')
    console.log(`[impressora] DRY_RUN — ${buffer.length} bytes gravados em ${arquivoTeste}`)
    console.log('--- prévia (ASCII) ---\n' + texto + '\n----------------------')
    return Promise.resolve()
  }

  if (!host) return Promise.reject(new Error('IMPRESSORA_HOST não definido (IP da Tanca na rede).'))

  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    let pronto = false
    sock.setTimeout(timeoutMs)
    sock.once('error', (e) => { if (!pronto) { pronto = true; reject(e) } })
    sock.once('timeout', () => { if (!pronto) { pronto = true; sock.destroy(); reject(new Error('timeout ao falar com a impressora')) } })
    sock.connect(port, host, () => {
      sock.write(buffer, () => sock.end())
    })
    sock.once('close', () => { if (!pronto) { pronto = true; resolve() } })
  })
}
