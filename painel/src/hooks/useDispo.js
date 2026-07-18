import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const mesStr = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, '0')}`;

/**
 * Base de disponibilidade da GESTÃO (crua, com version por dia — sem merge de
 * ocupação; o merge é da borda pública). Dia ausente do mapa = NÃO declarado =
 * indisponível no app do cliente.
 *
 * salvar() usa concorrência otimista: em 409 CONFLITO_VERSAO recarrega o mês e
 * tenta UMA vez com a version fresca (last-write-wins deliberado da gestão).
 */
export function useDispo(ativo = true) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());          // 0-indexado
  const [dias, setDias] = useState({});                     // iso → {tarde,noite,madrugada,version}
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const vivoRef = useRef(true);

  const recarregar = useCallback(async (a = ano, m = mes) => {
    try {
      const r = await api.listarDispo(mesStr(a, m));
      if (!vivoRef.current) return {};
      const mapa = {};
      for (const d of r.dias || []) mapa[d.iso] = d;
      setDias(mapa);
      setErro(null);
      return mapa;
    } catch (e) {
      if (vivoRef.current) setErro(e);
      return {};
    } finally {
      if (vivoRef.current) setCarregando(false);
    }
  }, [ano, mes]);

  useEffect(() => {
    vivoRef.current = true;
    if (!ativo) return undefined;
    setCarregando(true);
    recarregar();
    return () => { vivoRef.current = false; };
  }, [ativo, recarregar]);

  const navegar = useCallback((delta) => {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setAno(a); setMes(m);
  }, [ano, mes]);

  /** Salva a base de um dia. `novo` = {tarde,noite,madrugada}. */
  const salvar = useCallback(async (iso, novo) => {
    const atual = dias[iso];
    const version = atual?.version ?? 0;
    try {
      const row = await api.salvarDispo(iso, { ...novo, version });
      setDias((d) => ({ ...d, [iso]: row }));
    } catch (e) {
      if (e?.codigo === 'CONFLITO_VERSAO') {
        // Alguém salvou antes: pega a version fresca e reaplica a intenção 1x.
        const mapa = await recarregar();
        const fresca = mapa[iso]?.version ?? 0;
        const row = await api.salvarDispo(iso, { ...novo, version: fresca });
        setDias((d) => ({ ...d, [iso]: row }));
      } else {
        throw e;
      }
    }
  }, [dias, recarregar]);

  return { ano, mes, dias, carregando, erro, navegar, salvar, recarregar };
}
