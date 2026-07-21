import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { Login, Entrando } from './screens/Login.jsx';
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
import { useAberto } from './hooks/useAberto.js';

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

// Abas mais acessadas — aparecem na barra inferior do celular (as demais vão no
// "Menu" que sobe do rodapé).
const PRIMARIAS = ['pdv', 'painel', 'cardapio'];

// Ícone por aba (linha, estilo do modelo). `menu` = hambúrguer (as 3 "-").
function AbaIcone({ nome, size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (nome) {
    case 'pdv': return (<svg {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>);
    case 'painel': return (<svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>);
    case 'agenda': return (<svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
    case 'cardapio': return (<svg {...p}><path d="M5.5 3h13l-6.5 9v6" /><path d="M8.5 21h7" /></svg>);
    case 'editor': return (<svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>);
    case 'relatorio': return (<svg {...p}><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>);
    case 'ajustes': return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
    case 'menu': return (<svg {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>);
    default: return null;
  }
}

const normTxt = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Shell() {
  const { autenticado, logout, papel, carregando } = useAuth();
  const [aba, setAba] = useState('pdv');
  const [tema, setTema] = useState(() => localStorage.getItem('sdp_tema') || 'Noturno');
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState('');
  const { isMobile } = useViewport();
  const { aberto } = useAberto(autenticado);

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
        {carregando ? <Entrando /> : <Login />}
      </div>
    );
  }

  const permitidas = telasPermitidas(papel);
  const abas = ABAS.filter((a) => permitidas.includes(a.key));
  const abaAtual = permitidas.includes(aba) ? aba : 'pdv';
  const barras = abas.filter((a) => PRIMARIAS.includes(a.key)); // barra inferior (mobile)
  const abaEhPrimaria = barras.some((a) => a.key === abaAtual);

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

        {/* abas — grupo com borda arredondada (desktop). No celular a navegação vai
            para a barra inferior (bottom nav), então o nav do topo some. */}
        {!isMobile && (
          <nav className="sd-scroll" style={{ display: 'flex', gap: '6px', background: 'var(--surface)', padding: '5px', borderRadius: '13px', border: '1px solid var(--border)', overflowX: 'auto', maxWidth: '100%' }}>
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
        )}

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

          {/* status aberto/fechado — segue os horários (Ajustes). Oculto no mobile. */}
          {!isMobile && (() => {
            const fechado = aberto === false;
            const cor = fechado ? '#e2615a' : 'var(--accent2)';
            return (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', padding: '9px 14px', borderRadius: '11px' }}
                className="sd-status"
                title="Segue os horários de atendimento definidos em Ajustes"
              >
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: cor, boxShadow: `0 0 8px ${cor}` }} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{fechado ? 'Fechado' : 'Aberto'}</span>
              </div>
            );
          })()}
        </div>
      </header>

      <main style={{ paddingBottom: isMobile ? '92px' : 0 }}>
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
            carregando={ordersApi.carregando}
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

      {/* ===== navegação inferior (mobile) ===== */}
      {isMobile && (
        <>
          <nav
            style={{
              position: 'fixed', left: '10px', right: '10px', bottom: '10px', zIndex: 35,
              display: 'flex', gap: '2px', background: 'var(--headerbg)', border: '1px solid var(--border)',
              borderRadius: '20px', padding: '8px 6px', boxShadow: '0 8px 30px rgba(0,0,0,.28)',
              paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {barras.map((a) => {
              const ativo = abaAtual === a.key && !menuAberto;
              return (
                <button key={a.key} onClick={() => { setAba(a.key); setMenuAberto(false); }} style={bottomItem(ativo)}>
                  <AbaIcone nome={a.key} size={22} />
                  <span style={{ fontSize: '11px', fontWeight: ativo ? 700 : 600 }}>{a.rotulo}</span>
                </button>
              );
            })}
            <button onClick={() => setMenuAberto(true)} style={bottomItem(!abaEhPrimaria || menuAberto)}>
              <AbaIcone nome="menu" size={22} />
              <span style={{ fontSize: '11px', fontWeight: (!abaEhPrimaria || menuAberto) ? 700 : 600 }}>Menu</span>
            </button>
          </nav>

          {menuAberto && (
            <>
              <div onClick={() => setMenuAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 44, animation: 'sd-cover .2s ease-out both' }} />
              <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, maxHeight: '86vh', background: 'var(--surface)', borderTopLeftRadius: '22px', borderTopRightRadius: '22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '0 -20px 50px rgba(0,0,0,.4)', animation: 'sd-sheetup .3s cubic-bezier(.22,1,.36,1) both', paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))' }}>
                {/* grabber (as 3 "-" / puxador) */}
                <div onClick={() => setMenuAberto(false)} style={{ padding: '12px 0 2px', display: 'flex', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
                  <span style={{ width: '42px', height: '5px', borderRadius: '999px', background: 'var(--muted)', opacity: 0.5 }} />
                </div>
                {/* topo: tema + sair */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 0', flex: 'none' }}>
                  <button onClick={toggleTema} title="Alternar tema" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '11px', color: 'var(--fg)', fontSize: '17px', cursor: 'pointer' }}>{tema === 'Claro' ? '☾' : '☀'}</button>
                  <button onClick={() => { setMenuAberto(false); logout(); }} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '11px', padding: '10px 15px', color: 'var(--muted)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Sair</button>
                </div>
                <div style={{ textAlign: 'center', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '22px', margin: '6px 0 14px', flex: 'none' }}>Menu</div>
                <div style={{ padding: '0 16px 12px', flex: 'none' }}>
                  <input value={buscaMenu} onChange={(e) => setBuscaMenu(e.target.value)} placeholder="O que você precisa?" style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '13px 15px', color: 'var(--fg)', fontSize: '14px', outline: 'none' }} />
                </div>
                <div className="sd-scroll" style={{ overflowY: 'auto', padding: '0 14px 4px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {abas.filter((a) => normTxt(a.rotulo).includes(normTxt(buscaMenu))).map((a) => {
                    const ativo = abaAtual === a.key;
                    return (
                      <button key={a.key} onClick={() => { setAba(a.key); setMenuAberto(false); setBuscaMenu(''); }} style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '15px 16px', borderRadius: '14px', border: '1px solid ' + (ativo ? 'var(--accent)' : 'var(--border)'), background: ativo ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'var(--bg)', color: 'var(--fg)', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ color: ativo ? 'var(--accent)' : 'var(--muted)', flex: 'none', display: 'flex' }}><AbaIcone nome={a.key} size={20} /></span>
                        <span style={{ flex: 1, fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px' }}>{a.rotulo}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                      </button>
                    );
                  })}
                  {abas.filter((a) => normTxt(a.rotulo).includes(normTxt(buscaMenu))).length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '20px 0' }}>Nada encontrado.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Item da barra inferior (mobile): ícone + rótulo, cor de acordo com ativo.
function bottomItem(ativo) {
  return {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
    background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer',
    color: ativo ? 'var(--accent)' : 'var(--muted)',
  };
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
