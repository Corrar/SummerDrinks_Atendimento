// Agente de impressão — roda num PC/mini-PC na rede da operação (ao lado da
// Tanca TP-620). Faz login no backend, acompanha os pedidos NOVOS do dia (do PDV
// e do app do cliente) e imprime cada um automaticamente com CORTE PARCIAL.
//
// Fluxo: login → a cada POLL_MS lê GET /orders → imprime as senhas ainda não
// impressas. No 1º ciclo, marca o que já existe SEM imprimir (não cospe o
// histórico). Re-loga sozinho quando o token expira (401).
//
// Config por variáveis de ambiente (.env) — ver .env.example.
import { criarApi } from './api.js'
import { criarEstado } from './estado.js'
import { imprimir } from './impressora.js'
import { ticketPedido } from './escpos.js'

const cfg = {
  apiUrl: (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, ''),
  tenant: process.env.TENANT || 'summer',
  usuario: process.env.PRINTER_USER || '',
  senha: process.env.PRINTER_PASS || '',
  host: process.env.IMPRESSORA_HOST || '',
  port: Number(process.env.IMPRESSORA_PORT || 9100),
  pollMs: Number(process.env.POLL_MS || 4000),
  colunas: Number(process.env.COLUNAS || 48),
  corte: process.env.CORTE || 'parcial', // parcial | total | nenhum
  dryRun: /^(1|true|sim)$/i.test(process.env.DRY_RUN || ''),
  trailer: process.env.TRAILER || 'Summer Drinks',
}

const api = criarApi(cfg)
const estado = criarEstado(process.env.ESTADO_ARQUIVO || 'impressos.json')
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))
let primeiroCiclo = true

async function garantirLogin() {
  if (api.temToken) return
  if (!cfg.usuario || !cfg.senha) throw new Error('PRINTER_USER/PRINTER_PASS não definidos')
  await api.login(cfg.usuario, cfg.senha)
  console.log(`[agente] login ok como "${cfg.usuario}" em ${cfg.apiUrl} (tenant=${cfg.tenant})`)
}

async function ciclo() {
  await garantirLogin()
  let snap
  try {
    snap = await api.getOrders()
  } catch (e) {
    if (e.status === 401) { await api.login(cfg.usuario, cfg.senha); snap = await api.getOrders() }
    else throw e
  }
  const orders = Array.isArray(snap?.orders) ? snap.orders : []

  if (primeiroCiclo) {
    estado.semImprimir(orders.map((o) => o.senha))
    primeiroCiclo = false
    console.log(`[agente] pronto — ${orders.length} pedido(s) do dia marcados como já vistos. Aguardando novos…`)
    return
  }

  for (const o of orders) {
    if (estado.jaImpresso(o.senha)) continue
    const bytes = ticketPedido(o, { colunas: cfg.colunas, corte: cfg.corte, trailer: cfg.trailer })
    try {
      await imprimir(bytes, { host: cfg.host, port: cfg.port, dryRun: cfg.dryRun })
      estado.marcar(o.senha)
      console.log(`[agente] impresso pedido senha ${o.senha} (${o.items?.length || 0} item(ns)).`)
    } catch (e) {
      console.error(`[agente] FALHA ao imprimir senha ${o.senha}:`, e.message, '— tentará de novo no próximo ciclo.')
      // não marca como impresso → tenta de novo
    }
  }
}

async function main() {
  console.log(`[agente] iniciando. impressora=${cfg.dryRun ? 'DRY_RUN' : `${cfg.host}:${cfg.port}`} corte=${cfg.corte} poll=${cfg.pollMs}ms`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await ciclo() } catch (e) { console.error('[agente] erro no ciclo:', e.message) }
    await dorme(cfg.pollMs)
  }
}

main().catch((e) => { console.error('[agente] fatal:', e); process.exit(1) })
