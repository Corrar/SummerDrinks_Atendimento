import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, sessaoAtual, onSessaoExpirada, logout as apiLogout } from '../lib/api.js';

const AuthCtx = createContext(null);

/** Sessão do operador: login/logout + queda automática quando o refresh falha. */
export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => sessaoAtual());
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    onSessaoExpirada(() => setSessao(null));
  }, []);

  const login = useCallback(async (usuario, senha) => {
    setCarregando(true);
    setErro(null);
    try {
      const s = await api.login(usuario, senha);
      setSessao(s);
      return true;
    } catch (e) {
      setErro(e?.status === 401 || e?.status === 403 ? 'Usuário ou senha inválidos.' : (e?.message || 'Falha no login.'));
      return false;
    } finally {
      setCarregando(false);
    }
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setSessao(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ sessao, autenticado: !!sessao?.token, papel: sessao?.papel, login, logout, erro, carregando }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
