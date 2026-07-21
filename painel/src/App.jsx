import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { Login } from './screens/Login.jsx';
import { PDV } from './screens/PDV.jsx';
import { Painel } from './screens/Painel.jsx';
import { Agenda } from './screens/Agenda.jsx';
import { Dispo } from './screens/Dispo.jsx';
import { Cardapio } from './screens/Cardapio.jsx';
import { CardapioView } from './screens/CardapioView.jsx';
import { Config } from './screens/Config.jsx';
import { Relatorio } from './screens/Relatorio.jsx';
import { useOrders } from './hooks/useOrders.js';
import { useAgendas } from './hooks/useAgendas.js';
import { useDispo } from './hooks/useDispo.js';
import { useCatalogo } from './hooks/useCatalogo.js';

const NOME_TRAILER = 'Summer Drinks';

// Monograma = iniciais do nome do trailer (espelha monograma() do protótipo).
function monograma(nome) {
  const w = (nome || '').split(/\s+/).filter((p) => p.length > 2);
  return (w.slice(0, 2).map((p) => p[0]).join('') || (nome || '').slice(0, 2)).toUpperCase();
}

// Abas com rótulos e chaves do protótipo. `dispo` é dobrada dentro de `agenda`.
const ABAS = [
  { key: 'pdv', rotulo: 'Atendente' },
  { key: 'painel', rotulo: 'Painel' },
  { key: 'agenda', rotulo: 'Agenda' },
  { key: 'cardapio', rotulo: 'Cardápio' },
  { key: 'editor', rotulo: 'Editar' },
  { key: 'relatorio', rotulo: 'Relatório' },
  { key: 'ajustes', rotulo: 'Ajustes' },
];

// Telas permitidas por papel (espelha telasPermitidas do protótipo):
// admin vê tudo; atendente só opera o balcão e consulta o cardápio.
function telasPermitidas(papel) {
  return papel === 'gestao'
    ? ['pdv', 'painel', 'agenda', 'cardapio', 'editor', 'relatorio', 'ajustes']
    : ['pdv', 'painel', 'cardapio'];
}

function Shell() {
  const { autenticado, logout, papel } = useAuth();
  const [aba, setAba] = useState('pdv');
  const [tema, setTema] = useState(() => localStorage.getItem('sdp_tema') || 'Noturno');

  // hooks só pollam quando autenticado (agendas também alimentam a ocupação da Dispo)
  const ordersApi = useOrders(autenticado);
  const agendasApi = useAgendas(autenticado && aba === 'agenda');
  const dispoApi = useDispo(autenticado && aba === 'agenda');
  const catalogoApi = useCatalogo(autenticado && (aba === 'cardapio' || aba === 'editor'));

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

  const permitidas = telasPermitidas(papel);
  const abas = ABAS.filter((a) => permitidas.includes(a.key));
  const abaAtual = permitidas.includes(aba) ? aba : 'pdv';
  const solicitadas = agendasApi.agendas.filter((a) => a.status === 'solicitado').length;

  const papelLabel = papel === 'gestao' ? 'Administrador' : 'Atendente';
  const inicial = (papelLabel[0] || '?').toUpperCase();

  return (
    <div className="sd-painel" data-tema={tema} style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: '13px', padding: '13px 20px',
          background: 'var(--headerbg)', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 20,
        }}
      >
        {/* monograma + nome */}
        <div
          style={{
            width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '15px', flex: '0 0 auto', letterSpacing: '-.5px',
          }}
        >
          {monograma(NOME_TRAILER)}
        </div>
        <div style={{ lineHeight: 1.12, marginRight: '6px' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)', letterSpacing: '-.3px' }}>
            {NOME_TRAILER}
          </div>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2.5px', color: 'var(--accent)' }}>ATENDIMENTO</div>
        </div>

        {/* abas */}
        <nav className="sd-scroll" style={{ display: 'flex', gap: '6px', flex: 1, overflowX: 'auto', padding: '0 4px' }}>
          {abas.map((a) => {
            const ativo = abaAtual === a.key;
            return (
              <button
                key={a.key}
                onClick={() => setAba(a.key)}
                style={{
                  flex: '0 0 auto', padding: '9px 16px', borderRadius: '9px', border: 'none',
                  fontSize: '13.5px', fontWeight: 600, fontFamily: 'Hanken Grotesk', whiteSpace: 'nowrap',
                  background: ativo ? 'var(--accent)' : 'transparent',
                  color: ativo ? 'var(--onAccent)' : 'var(--muted)',
                }}
              >
                {a.rotulo}
                {a.key === 'agenda' && solicitadas > 0 && (
                  <span style={{ marginLeft: '7px', background: '#e23b3b', color: '#fff', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
                    {solicitadas}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* tema */}
        <button
          onClick={toggleTema}
          title={tema === 'Claro' ? 'Tema escuro' : 'Tema claro'}
          style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', borderRadius: '10px', width: '38px', height: '38px', fontSize: '16px', fontWeight: 700, flex: '0 0 auto' }}
        >
          {tema === 'Claro' ? '☾' : '☀'}
        </button>

        {/* chip de usuário */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: '0 0 auto' }}>
          <div
            style={{
              width: '34px', height: '34px', borderRadius: '50%', background: 'var(--surface2)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px',
              border: '1px solid var(--border)',
            }}
          >
            {inicial}
          </div>
          <div style={{ lineHeight: 1.1 }} className="sd-userchip">
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--fg)' }}>{papelLabel}</div>
            <button
              onClick={logout}
              style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: '11px', fontWeight: 700, padding: 0, cursor: 'pointer' }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main style={{ padding: '18px 20px 40px', maxWidth: '1180px', margin: '0 auto' }}>
        {ordersApi.erro && (
          <div style={{ background: 'color-mix(in srgb, #e23b3b 14%, transparent)', border: '1px solid #e23b3b', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
            Sem conexão com o servidor — tentando de novo… (última sincronização mantida)
          </div>
        )}
        {abaAtual === 'pdv' && (
          <PDV
            orders={ordersApi.orders}
            criar={ordersApi.criar}
            marcar={ordersApi.marcar}
            togglePago={ordersApi.togglePago}
            entregar={ordersApi.entregar}
          />
        )}
        {abaAtual === 'painel' && (
          <Painel
            orders={ordersApi.orders}
            painel={ordersApi.painel}
            reordenar={ordersApi.reordenar}
            marcar={ordersApi.marcar}
            togglePago={ordersApi.togglePago}
            entregar={ordersApi.entregar}
          />
        )}
        {abaAtual === 'agenda' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
            <Agenda agendas={agendasApi.agendas} transicionar={agendasApi.transicionar} orcar={agendasApi.orcar} />
            <Dispo dispoApi={dispoApi} agendas={agendasApi.agendas} />
          </div>
        )}
        {abaAtual === 'cardapio' && <CardapioView itens={catalogoApi.itens} />}
        {abaAtual === 'editor' && (
          <Cardapio itens={catalogoApi.itens} recarregar={catalogoApi.recarregar} />
        )}
        {abaAtual === 'ajustes' && <Config ativo={abaAtual === 'ajustes'} />}
        {abaAtual === 'relatorio' && <Relatorio ativo={abaAtual === 'relatorio'} />}
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
