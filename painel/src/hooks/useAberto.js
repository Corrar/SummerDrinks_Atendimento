import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { estaAberto } from '../lib/schedule.js';

const POLL_CONFIG_MS = 300_000; // recarrega os horários a cada 5 min
const TICK_MS = 30_000;         // reavalia aberto/fechado a cada 30s (depende da hora)

/**
 * Deriva Aberto/Fechado agora a partir dos horários da config (mesma regra do
 * app do cliente). Recarrega os horários periodicamente e reavalia a cada 30s,
 * pois o estado muda com a passagem do tempo mesmo sem mudança de config.
 * Retorna `aberto`: true | false | null (null = horários ainda não carregados).
 */
export function useAberto(ativo = true) {
  const [horarios, setHorarios] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const carregar = () => api.lerConfig()
      .then((c) => { if (vivo) setHorarios(Array.isArray(c?.horarios) ? c.horarios : []); })
      .catch(() => {});
    carregar();
    const tc = setInterval(carregar, POLL_CONFIG_MS);
    const tt = setInterval(() => { if (vivo) setTick((t) => t + 1); }, TICK_MS);
    return () => { vivo = false; clearInterval(tc); clearInterval(tt); };
  }, [ativo]);

  const aberto = horarios == null ? null : estaAberto(horarios, new Date());
  return { aberto, horarios };
}
