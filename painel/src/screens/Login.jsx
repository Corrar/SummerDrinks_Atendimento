import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

const NOME_TRAILER = 'Summer Drinks';
const LARANJA = '#d88a10';

// Formas decorativas de fundo (compartilhadas entre Login e Entrando).
function Blobs() {
  return (
    <svg aria-hidden="true" viewBox="0 0 854 472" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <path fill="rgba(255,255,255,.05)" d="M854 -40 L854 512 L760 512 C 690 512, 660 460, 685 400 C 705 352, 700 320, 665 285 C 620 240, 615 170, 665 115 C 700 76, 705 30, 685 -40 Z" />
      <path fill="rgba(255,255,255,.05)" d="M0 472 L0 175 C 55 155, 95 180, 110 230 C 122 272, 158 290, 205 282 C 268 272, 310 305, 305 360 C 300 415, 255 445, 195 440 C 150 436, 120 452, 105 472 Z" />
    </svg>
  );
}

/**
 * Tela "Entrando…" — mostrada logo após clicar em Entrar, enquanto a sessão é
 * criada. Mesmo fundo laranja do login, com spinner e o nome do trailer.
 */
export function Entrando() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: LARANJA, overflow: 'hidden' }}>
      <Blobs />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px', textAlign: 'center', animation: 'sdFade .3s ease' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', border: '4px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'sd-spin .8s linear infinite' }} />
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '24px', letterSpacing: '-.01em', color: '#fff' }}>{NOME_TRAILER}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,.85)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Entrando…</div>
      </div>
    </div>
  );
}

/**
 * Login do operador — igual ao protótipo: fundo laranja da marca com formas
 * decorativas, ícone da taça, campos claros com placeholder espaçado e botão
 * branco. Ligado ao useAuth real (login/erro/carregando).
 */
export function Login() {
  const { login, erro, carregando } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [dica, setDica] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!usuario || !senha || carregando) return;
    await login(usuario, senha);
  }

  const campo = {
    display: 'flex', alignItems: 'center', gap: '11px',
    border: '1.5px solid rgba(255,255,255,.65)', borderRadius: '14px',
    padding: '0 14px', background: 'rgba(255,255,255,.04)',
  };
  const input = {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    padding: '13px 0', fontSize: '12.5px', letterSpacing: '.12em', color: '#fff', minWidth: 0,
  };

  return (
    <div
      id="login-scr"
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: LARANJA, overflow: 'hidden' }}
    >
      {/* formas decorativas de fundo */}
      <Blobs />

      <form
        onSubmit={submit}
        style={{ position: 'relative', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '15px', animation: 'sdRise .6s ease-out both' }}
      >
        {/* marca */}
        <div style={{ textAlign: 'center', marginBottom: '26px', color: '#fff' }}>
          <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.5 3h13l-6.5 9v6" />
            <path d="M8.5 21h7" />
            <path d="M5.5 3l3 4" />
          </svg>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '24px', letterSpacing: '-.01em', marginTop: '8px' }}>
            {NOME_TRAILER}
          </div>
        </div>

        {/* usuário */}
        <div style={campo}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="USUÁRIO" autoComplete="username" autoFocus style={input} />
        </div>

        {/* senha */}
        <div style={campo}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input type={verSenha ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="SENHA" autoComplete="current-password" style={input} />
          <button type="button" onClick={() => setVerSenha((v) => !v)} title={verSenha ? 'Ocultar senha' : 'Mostrar senha'} style={{ flex: 'none', display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: '4px', marginRight: '-4px', cursor: 'pointer', color: 'rgba(255,255,255,.75)' }}>
            {verSenha ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        </div>

        {erro && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,.22)', color: '#fff', borderRadius: '6px', padding: '10px 13px', fontSize: '13px', fontWeight: 600 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={carregando}
          style={{ width: '100%', background: '#fff', color: LARANJA, border: 'none', borderRadius: '6px', padding: '14px', fontSize: '13px', fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: 'pointer', letterSpacing: '.14em', textTransform: 'uppercase', marginTop: '6px', boxShadow: '0 4px 14px rgba(0,0,0,.15)', opacity: carregando ? 0.75 : 1 }}
        >
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setDica((d) => !d)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            Esqueceu a senha?
          </button>
        </div>

        {dica && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.35)', color: '#fff', borderRadius: '14px', padding: '11px 14px', fontSize: '13px', fontWeight: 600, lineHeight: 1.35 }}>
            Peça a um administrador para redefinir sua senha em Ajustes → Usuários.
          </div>
        )}
      </form>
    </div>
  );
}
