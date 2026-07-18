import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const POLL_MS = 5000;

/**
 * Pedidos do dia com verdade no servidor (espelha as ações do SistemaContext,
 * agora contra a API). Polling de snapshot a cada 5s + refresh imediato após
 * cada mutação. Erros de rede não derrubam a tela — mantém o último snapshot.
 */
export function useOrders(ativo = true) {
  const [snap, setSnap] = useState({ orders: [], painel: { sort: [], ultimaChamada: null, chamadaHist: [], version: 0 }, proximaSenha: null });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const vivoRef = useRef(true);

  const recarregar = useCallback(async () => {
    try {
      const s = await api.snapshot();
      if (!vivoRef.current) return;
      setSnap(s);
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

  // ---------- ações (todas re-sincronizam depois) ----------
  const criar = useCallback(async (dados) => {
    const pedido = await api.criarPedido(dados);
    await recarregar();
    return pedido;
  }, [recarregar]);

  const marcar = useCallback(async (senha, status) => {
    await api.marcarStatus(senha, status);
    await recarregar();
  }, [recarregar]);

  const togglePago = useCallback(async (senha) => {
    await api.togglePago(senha);
    await recarregar();
  }, [recarregar]);

  const entregar = useCallback(async (senha, receberAntes) => {
    await api.entregar(senha, receberAntes);
    await recarregar();
  }, [recarregar]);

  const reordenar = useCallback(async (sort) => {
    try {
      await api.reordenarPainel(sort, snap.painel.version);
    } catch (e) {
      // 409/428 = versão velha → snapshot resolve; qualquer outro erro idem.
    }
    await recarregar();
  }, [recarregar, snap.painel.version]);

  return { ...snap, carregando, erro, recarregar, criar, marcar, togglePago, entregar, reordenar };
}
