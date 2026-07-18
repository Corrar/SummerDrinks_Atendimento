import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

/** Tela de login do operador. Visual coerente com o tema Noturno do sistema. */
export function Login() {
  const { login, erro, carregando } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!usuario || !senha || carregando) return;
    await login(usuario, senha);
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
    fontSize: '15px',
    fontWeight: 600,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(120% 80% at 50% 0%, var(--surface2) 0%, var(--bg) 60%)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '22px',
          padding: '34px 28px',
          animation: 'sdRise .4s cubic-bezier(.2,1,.3,1)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div
            style={{
              width: '58px', height: '58px', borderRadius: '16px', background: 'var(--accent)',
              color: 'var(--onAccent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px', fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '22px',
            }}
          >
            SD
          </div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '24px', color: 'var(--fg)', letterSpacing: '-.4px' }}>
            Summer Drinks
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '3px', color: 'var(--accent)', marginTop: '5px' }}>
            PAINEL DO ATENDIMENTO
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Usuário"
            autoComplete="username"
            autoFocus
            style={inputStyle}
          />
          <input
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            type="password"
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>

        {erro && (
          <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 600, color: '#e23b3b', textAlign: 'center' }}>
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={carregando || !usuario || !senha}
          style={{
            width: '100%', marginTop: '18px', padding: '15px', border: 'none', borderRadius: '13px',
            background: carregando || !usuario || !senha ? 'var(--surface2)' : 'var(--accent)',
            color: carregando || !usuario || !senha ? 'var(--muted)' : 'var(--onAccent)',
            fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: '15px',
          }}
        >
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
