// Renderização de mensagens WhatsApp a partir de (tipo, agenda). Função PURA:
// dado o mesmo par, produz sempre o mesmo texto. Sem I/O, sem timestamps, sem
// PII saindo em qualquer caminho de erro (retorna null para tipo desconhecido —
// o worker decide se marca 'falha' ou 'entregue' silenciosamente).

import type { StatusAgenda } from '../types/domain.js'

/** Dados vindos do JOIN outbox × agenda. Só o mínimo para renderizar. */
export interface DadosAgenda {
  nome: string
  telefone: string
  data: string       // 'YYYY-MM-DD' (formato do to_char no SELECT)
  hora: string       // 'HH:MM'
  protocolo: string
  motivo_recusa: string | null
  status: StatusAgenda
}

/** Converte 'YYYY-MM-DD' → 'DD/MM/YYYY' sem depender de locale/Date. */
function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Slot legível a partir da hora canônica (acl.MAPA_SLOT: 14:00/19:00/23:00). */
function nomeSlot(hora: string): string {
  if (hora.startsWith('14')) return 'Tarde'
  if (hora.startsWith('19')) return 'Noite'
  if (hora.startsWith('23')) return 'Madrugada'
  return hora
}

/**
 * Renderiza a mensagem para um tipo do outbox. Retorna `null` se o tipo
 * for desconhecido — o worker registra e marca 'falha' com `ultimo_erro='tipo_desconhecido'`.
 */
export function renderizar(tipo: string, ag: DadosAgenda): string | null {
  const data = formatarData(ag.data)
  const slot = nomeSlot(ag.hora)
  const nome = ag.nome || 'Cliente'

  switch (tipo) {
    case 'evento:recebido':
      return (
        `Olá, ${nome}! Recebemos sua solicitação de evento para ${data} · ${slot}. ` +
        `Vamos analisar e retornar em até 24h. Protocolo: ${ag.protocolo}.`
      )
    case 'evento:agendado':
      return (
        `Boas notícias, ${nome}! Sua solicitação para ${data} · ${slot} foi agendada. ` +
        `Aguarde a confirmação final. Protocolo: ${ag.protocolo}.`
      )
    case 'evento:confirmado':
      return (
        `${nome}, tudo certo! Seu evento em ${data} · ${slot} está confirmado. ` +
        `Nos vemos lá! Protocolo: ${ag.protocolo}.`
      )
    case 'evento:recusado':
      return (
        `${nome}, infelizmente não conseguiremos atender ${data} · ${slot}. ` +
        (ag.motivo_recusa ? `Motivo: ${ag.motivo_recusa}. ` : '') +
        `Escolha outra data pelo app ou fale conosco. Protocolo: ${ag.protocolo}.`
      )
    default:
      return null
  }
}
