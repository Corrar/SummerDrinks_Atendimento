import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/** Catálogo (rota autenticada) — para o PDV montar a venda. Fetch único + reload. */
export function useCatalogo(ativo = true) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const rows = await api.listarCatalogo();
      setItens(Array.isArray(rows) ? rows : []);
      setErro(null);
    } catch (e) {
      setErro(e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (ativo) recarregar();
  }, [ativo, recarregar]);

  return { itens, carregando, erro, recarregar };
}
