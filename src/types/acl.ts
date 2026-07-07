// ACL — Anti-Corruption Layer.
// Traduz os shapes do APP DO CLIENTE (zip Sistema_para_React) para o domínio do
// SISTEMA DE ATENDIMENTO. Funções PURAS, sem I/O: fáceis de testar, impossíveis
// de acoplar. Toda a tradução do mundo hostil externo mora aqui.
//
// Regras invioláveis:
//  - Preço e senha são do SERVIDOR. O que o cliente manda de preço é ignorado.
//  - method do cliente ('pix'|'cartao'|'especie') → Pagamento do domínio.
//  - id de item do cliente é uma REFERÊNCIA opaca "catalogoId__tamanhoIdx".

import type { Pagamento } from './domain.js'

// ---------- pagamento ----------
const MAPA_PAGAMENTO: Readonly<Record<string, Pagamento>> = {
  pix: 'Pix',
  cartao: 'Cartão',
  especie: 'Dinheiro',
}

export function pagamentoDoMetodo(method: string): Pagamento {
  const p = MAPA_PAGAMENTO[method]
  if (!p) throw new Error(`método de pagamento desconhecido: ${method}`)
  return p
}

// ---------- referência de item do cliente ----------
// O menu público entrega ids no formato "catalogoId__idxTamanho". Decodificar
// devolve as duas partes para o EdgeIngestService re-precificar pelo catálogo.
export interface RefItem {
  catalogoId: string
  tamanhoIdx: number
}

const SEP = '__'

export function encodeRefItem(catalogoId: string, tamanhoIdx: number): string {
  return `${catalogoId}${SEP}${tamanhoIdx}`
}

export function decodeRefItem(id: string): RefItem | null {
  const i = id.lastIndexOf(SEP)
  if (i <= 0) return null
  const catalogoId = id.slice(0, i)
  const idx = Number(id.slice(i + SEP.length))
  if (!catalogoId || !Number.isInteger(idx) || idx < 0) return null
  return { catalogoId, tamanhoIdx: idx }
}

// ---------- nome de exibição do item (drink · rótulo) ----------
export function nomeItem(nome: string, rotulo: string): string {
  const r = (rotulo ?? '').trim()
  return r ? `${nome} · ${r}` : nome
}

// ---------- slot de evento → hora 'HH:MM' ----------
export type SlotEvento = 'Tarde' | 'Noite' | 'Madrugada'

const MAPA_SLOT: Readonly<Record<SlotEvento, string>> = {
  Tarde: '14:00',
  Noite: '19:00',
  Madrugada: '23:00',
}

export function horaDoSlot(slot: SlotEvento): string {
  return MAPA_SLOT[slot]
}

// ---------- dobra e-mail em obs quando não há coluna dedicada no destino ----------
// (mantido para compat; a migration 002 já cria coluna email, então NÃO usar em
// produção — preferir a coluna. Exposto só para relatórios legados.)
export function dobrarEmailEmObs(obs: string, email: string): string {
  const e = (email ?? '').trim()
  if (!e) return obs
  return obs ? `${obs}\n[e-mail: ${e}]` : `[e-mail: ${e}]`
}
