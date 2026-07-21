/* ============================================================
   Aberto/Fechado a partir dos `horarios` da config — MESMA regra do app do
   cliente (SummerDrinks_Cliente/src/lib/schedule.js), para o indicador do
   cabeçalho bater com o que o cliente vê. Trata horário que atravessa a
   meia-noite (ex.: abre 18h, fecha 02h).
   ============================================================ */

const DIA_POR_INDICE = [
  { pt: 'Domingo',       curto: 'Dom' },
  { pt: 'Segunda-feira', curto: 'Seg' },
  { pt: 'Terça-feira',   curto: 'Ter' },
  { pt: 'Quarta-feira',  curto: 'Qua' },
  { pt: 'Quinta-feira',  curto: 'Qui' },
  { pt: 'Sexta-feira',   curto: 'Sex' },
  { pt: 'Sábado',        curto: 'Sáb' },
];

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.\-_]/g, '');
}

export function horarioDoDia(horarios, diaSemana) {
  if (!Array.isArray(horarios)) return undefined;
  const def = DIA_POR_INDICE[diaSemana];
  if (!def) return undefined;
  const alvos = new Set([norm(def.pt), norm(def.curto), norm(def.pt.replace('-feira', ''))]);
  return horarios.find((h) => alvos.has(norm(h?.dia)) || alvos.has(norm(h?.curto)));
}

function minutosDeHora(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Está aberto agora? Sem horarios → `fallback`. */
export function estaAberto(horarios, agora = new Date(), fallback = false) {
  if (!Array.isArray(horarios) || !horarios.length) return fallback;
  const diaHoje = agora.getDay();
  const diaOntem = (diaHoje + 6) % 7;
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const hoje = horarioDoDia(horarios, diaHoje);
  const ontem = horarioDoDia(horarios, diaOntem);

  // Aberto atravessando a meia-noite herdado de ontem?
  if (ontem && ontem.aberto) {
    const abre = minutosDeHora(ontem.abre);
    const fecha = minutosDeHora(ontem.fecha);
    if (abre != null && fecha != null && fecha < abre && minutosAgora < fecha) return true;
  }

  if (!hoje || !hoje.aberto) return false;
  const abre = minutosDeHora(hoje.abre);
  const fecha = minutosDeHora(hoje.fecha);
  if (abre == null || fecha == null) return false;
  if (fecha >= abre) return minutosAgora >= abre && minutosAgora < fecha;
  return minutosAgora >= abre; // horário do próprio dia atravessa a meia-noite
}
