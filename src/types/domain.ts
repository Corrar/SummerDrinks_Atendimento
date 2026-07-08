// Tipos de domínio — espelham EXATAMENTE os shapes do frontend (MEGABRAIN §2).
// Não renomeie campos: o frontend depende destes nomes.

export type Pagamento = 'Pix' | 'Dinheiro' | 'Cartão'
export type StatusPedido = 'preparo' | 'pronto' | 'entregue'
export type StatusAgenda = 'solicitado' | 'agendado' | 'confirmado' | 'recusado'
export type SlotDispo = 'tarde' | 'noite' | 'madrugada'

export interface ItemPedido {
  nome: string // "Drink · Rótulo"
  preco: number
  qty: number
}

export interface Pedido {
  senha: number
  hora: string // 'HH:MM' — do servidor
  pagamento: Pagamento
  status: StatusPedido
  cliente: string
  pago: boolean
  items: ItemPedido[]
}

export interface Tamanho {
  rotulo: string
  preco: number
}

export interface ItemCatalogo {
  id: string
  cat: string
  nome: string
  desc: string
  tamanhos: Tamanho[]
  img: string
}

export interface Agenda {
  id: string
  cliente: string
  telefone: string
  tipo: string
  data: string // 'YYYY-MM-DD'
  hora: string
  local: string
  pessoas: number
  valor: number
  obs: string
  status: StatusAgenda
}

// Base de disponibilidade do dia (gestão edita; o público lê já mesclado c/ ocupação).
export interface DispoDia {
  iso: string // 'YYYY-MM-DD'
  tarde: boolean
  noite: boolean
  madrugada: boolean
  version: number
}

export interface PainelEstado {
  sort: number[]
  ultimaChamada: number | null
  chamadaHist: number[]
  version: number
}

// Transições de status válidas (nunca retroceder de 'entregue').
export const TRANSICOES: Readonly<Record<StatusPedido, readonly StatusPedido[]>> = {
  preparo: ['pronto', 'entregue'],
  pronto: ['entregue', 'preparo'],
  entregue: [],
}

// ---------- erros de domínio tipados ----------
export class ErroDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
    public readonly status = 400,
  ) {
    super(mensagem)
    this.name = 'ErroDominio'
  }
}

export class ConflitoVersao extends ErroDominio {
  constructor(public readonly atual: unknown) {
    super('CONFLITO_VERSAO', 'Versão desatualizada; reconcilie e tente de novo.', 409)
  }
}

export class TransicaoInvalida extends ErroDominio {
  constructor(de: StatusPedido, para: StatusPedido) {
    super('TRANSICAO_INVALIDA', `Transição inválida: ${de} → ${para}.`, 409)
  }
}

// ---------- máquina de estados da AGENDA (espelha TRANSICOES de pedido) ----------
export const TRANSICOES_AGENDA: Readonly<Record<StatusAgenda, readonly StatusAgenda[]>> = {
  solicitado: ['agendado', 'recusado'],
  agendado:   ['confirmado', 'recusado'],
  confirmado: [],   // terminal
  recusado:   [],   // terminal
}

export class TransicaoAgendaInvalida extends ErroDominio {
  constructor(de: StatusAgenda, para: StatusAgenda) {
    super('TRANSICAO_AGENDA_INVALIDA', `Transição de agenda ${de}→${para} não permitida.`, 409)
  }
}
