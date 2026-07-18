import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { Login } from './screens/Login.jsx';
import { PDV } from './screens/PDV.jsx';
import { Painel } from './screens/Painel.jsx';
import { Agenda } from './screens/Agenda.jsx';
import { Dispo } from './screens/Dispo.jsx';
import { useOrders } from './hooks/useOrders.js';
import { useAgendas } from './hooks/useAgendas.js';
import { useDispo } from './hooks/useDispo.js';

const ABAS = [
  { key: 'pdv', rotulo: 'PDV' },
  { key: 'painel', rotulo: 'Painel de senhas' },
  { key: 'agenda', rotulo: 'Agenda' },
  { key: 'dispo', rotulo: 'Disponibilidade' },
];

function Shell() {
  const { autenticado, logout, papel } = useAuth();
  const [aba, setAba] = useState('pdv');
  const [tema, setTema] = useState(() => localStorage.getItem('sdp_tema') || 'Noturno');

  // hooks só pollam quando autenticado (agendas também alimentam a ocupação da Dispo)
  const ordersApi = useOrders(autenticado);
  const agendasApi = useAgendas(autenticado && (aba === 'agenda' || aba === 'dispo'));
  const dispoApi = useDispo(autenticado && aba === 'dispo');

  function toggleTema() {
    const t = tema === 'Claro' ? 'Noturno' : 'Claro';
    localStorage.setItem('sdp_tema', t);
    setTema(t);
  }

  if (!autenticado) {
    return (
      <div className="sd-painel" data-tema={tema}>
        <Login />
      </div>
    );
  }

  const solicitadas = agendasApi.agendas.filter((a) => a.status === 'solicitado').length;

  return (
    <div className="sd-painel" data-tema={tema} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px',
          background: 'var(--headerbg)', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 20,
        }}
      >
        <div
          style={{
            width: '38px', height: '38px', borderRadius: '11px', background: 'var(--accent)', color: 'var(--onAccent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '15px', flex: '0 0 auto',
          }}
        >
          SD
        </div>
        <div style={{ lineHeight: 1.15, marginRight: '8px' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)', letterSpacing: '-.3px' }}>
            Summer Drinks
          </div>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2.5px', color: 'var(--accent)' }}>ATENDIMENTO</div>
        </div>

        <nav className="sd-scroll" style={{ display: 'flex', gap: '6px', flex: 1, overflowX: 'auto' }}>
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              style={{
                flex: '0 0 auto', padding: '9px 15px', borderRadius: '999px', border: 'none',
                fontSize: '13px', fontWeight: 800, fontFamily: 'Hanken Grotesk', position: 'relative',
                background: aba === a.key ? 'var(--accent)' : 'transparent',
                color: aba === a.key ? 'var(--onAccent)' : 'var(--muted)',
              }}
            >
              {a.rotulo}
              {a.key === 'agenda' && solicitadas > 0 && (
                <span style={{ marginLeft: '7px', background: '#e23b3b', color: '#fff', borderRadius: '999px', padding: '1px 7px', fontSize: '11px' }}>
                  {solicitadas}
                </span>
              )}
            </button>
          ))}
        </nav>

        <button onClick={toggleTema} title="Alternar tema" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 700 }}>
          {tema === 'Claro' ? '🌙' : '☀️'}
        </button>
        <button onClick={logout} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', borderRadius: '10px', padding: '8px 12px', fontSize: '12.5px', fontWeight: 700 }}>
          Sair{papel ? ` (${papel})` : ''}
        </button>
      </header>

      <main style={{ padding: '18px 20px 40px', maxWidth: '1180px', margin: '0 auto' }}>
        {ordersApi.erro && (
          <div style={{ background: 'color-mix(in srgb, #e23b3b 14%, transparent)', border: '1px solid #e23b3b', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
            Sem conexão com o servidor — tentando de novo… (última sincronização mantida)
          </div>
        )}
        {aba === 'pdv' && (
          <PDV
            orders={ordersApi.orders}
            criar={ordersApi.criar}
            marcar={ordersApi.marcar}
            togglePago={ordersApi.togglePago}
            entregar={ordersApi.entregar}
          />
        )}
        {aba === 'painel' && (
          <Painel orders={ordersApi.orders} painel={ordersApi.painel} reordenar={ordersApi.reordenar} />
        )}
        {aba === 'agenda' && (
          <Agenda agendas={agendasApi.agendas} transicionar={agendasApi.transicionar} orcar={agendasApi.orcar} />
        )}
        {aba === 'dispo' && (
          <Dispo dispoApi={dispoApi} agendas={agendasApi.agendas} />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
