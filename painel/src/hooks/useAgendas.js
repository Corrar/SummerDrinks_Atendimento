import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const POLL_MS = 15000;

/** Agendas da gestão (com PII — rota autenticada). Polling 15s + ações. */
export function useAgendas(ativo = true) {
  const [agendas, setAgendas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const vivoRef = useRef(true);

  const recarregar = useCallback(async () => {
    try {
      const rows = await api.listarAgendas();
      if (!vivoRef.current) return;
      setAgendas(Array.isArray(rows) ? rows : []);
      setErro(null);
    } catch (e) {
      if (!vivoRef.current) return;
      setErro(e);
    } finally {
      if (vivoRef.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    vivoRef.current = true;
    if (!ativo) return undefined;
    recarregar();
    const t = setInterval(recarregar, POLL_MS);
    return () => {
      vivoRef.current = false;
      clearInterval(t);
    };
  }, [ativo, recarregar]);

  const transicionar = useCallback(async (id, status, motivo) => {
    await api.statusAgenda(id, status, motivo);
    await recarregar();
  }, [recarregar]);

  const orcar = useCallback(async (id, valor) => {
    await api.orcarAgenda(id, valor);
    await recarregar();
  }, [recarregar]);

  return { agendas, carregando, erro, recarregar, transicionar, orcar };
}
