import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { Login } from './screens/Login.jsx';
import { PDV } from './screens/PDV.jsx';
import { Painel } from './screens/Painel.jsx';
import { Agenda } from './screens/Agenda.jsx';
import { Cardapio } from './screens/Cardapio.jsx';
import { CardapioView } from './screens/CardapioView.jsx';
import { Config } from './screens/Config.jsx';
import { Relatorio } from './screens/Relatorio.jsx';
import { useOrders } from './hooks/useOrders.js';
import { useAgendas } from './hooks/useAgendas.js';
import { useDispo } from './hooks/useDispo.js';
import { useCatalogo } from './hooks/useCatalogo.js';
import { useViewport } from './hooks/useViewport.js';

const NOME_TRAILER = 'Summer Drinks';

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
  const { isMobile } = useViewport();

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

  const papelLabel = papel === 'gestao' ? 'Administrador' : 'Atendente';
  const inicial = (papelLabel[0] || '?').toUpperCase();
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  // Estilo dos botões de aba — idêntico ao protótipo (mkTab/tabBase).
  const tabBase = {
    border: 'none', borderRadius: '9px', padding: '9px 16px', fontSize: '13.5px',
    fontWeight: 600, cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap',
    fontFamily: 'Hanken Grotesk',
  };

  return (
    <div className="sd-painel" data-tema={tema} style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: isMobile ? '10px' : '16px', flexWrap: 'wrap',
          padding: isMobile ? '10px 14px' : '14px 24px', background: 'var(--headerbg)', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 30,
        }}
      >
        {/* marca: nome + "Gestão & Senhas" (sem monograma, como no protótipo) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', letterSpacing: '-.02em', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {NOME_TRAILER}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase', marginTop: '3px' }}>
              Gestão &amp; Senhas
            </div>
          </div>
        </div>

        {/* abas — dentro de um grupo com borda arredondada (protótipo). No mobile
            ocupam uma linha própria e rolam horizontalmente. */}
        <nav className="sd-scroll" style={{ display: 'flex', gap: '6px', background: 'var(--surface)', padding: '5px', borderRadius: '13px', border: '1px solid var(--border)', overflowX: 'auto', maxWidth: '100%', ...(isMobile ? { order: 3, flex: '1 1 100%' } : {}) }}>
          {abas.map((a) => {
            const ativo = abaAtual === a.key;
            return (
              <button
                key={a.key}
                onClick={() => setAba(a.key)}
                style={{
                  ...tabBase,
                  background: ativo ? 'var(--accent)' : 'transparent',
                  color: ativo ? 'var(--onAccent)' : 'var(--muted)',
                }}
              >
                {a.rotulo}
              </button>
            );
          })}
        </nav>

        {/* cluster direito: usuário, tema, sair, data, status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '9px' : '14px', flex: 'none' }}>
          {/* chip de usuário (ícone à esquerda; no mobile só o avatar) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: 'var(--surface)', border: '1px solid var(--border)', padding: isMobile ? '5px' : '6px 13px 6px 7px', borderRadius: '11px' }}>
            <span style={{ width: '28px', height: '28px', flex: 'none', borderRadius: '8px', background: 'var(--accent)', color: 'var(--onAccent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '13px' }}>
              {inicial}
            </span>
            {!isMobile && (
              <div style={{ textAlign: 'left' }} className="sd-userchip">
                <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{papelLabel}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.09em', marginTop: '2px' }}>{papelLabel}</div>
              </div>
            )}
          </div>

          {/* tema */}
          <button
            onClick={toggleTema}
            title="Alternar tema claro/escuro"
            style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '11px', color: 'var(--fg)', fontSize: '17px', cursor: 'pointer', lineHeight: 1 }}
          >
            {tema === 'Claro' ? '☾' : '☀'}
          </button>

          {/* sair */}
          <button
            onClick={logout}
            title="Sair"
            style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '11px', color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </button>

          {/* data de hoje — oculta no mobile p/ economizar espaço */}
          {!isMobile && (
            <div style={{ textAlign: 'right' }} className="sd-hoje">
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Hoje</div>
              <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px' }}>{hoje}</div>
            </div>
          )}

          {/* status aberto — oculto no mobile */}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', padding: '9px 14px', borderRadius: '11px' }} className="sd-status">
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--accent2)', boxShadow: '0 0 8px var(--accent2)' }} />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Aberto</span>
            </div>
          )}
        </div>
      </header>

      <main>
        {ordersApi.erro && (
          <div style={{ margin: '14px 28px 0', background: 'color-mix(in srgb, #e23b3b 14%, transparent)', border: '1px solid #e23b3b', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
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
          <Agenda
            agendas={agendasApi.agendas}
            transicionar={agendasApi.transicionar}
            orcar={agendasApi.orcar}
            criar={agendasApi.criar}
            dispoApi={dispoApi}
          />
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
