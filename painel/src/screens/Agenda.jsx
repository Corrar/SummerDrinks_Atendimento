import { useMemo, useState } from 'react';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIPO_COR = { 'Aniversário': '#ff5da2', 'Casamento': '#f5a623', 'Corporativo': '#4aa8d8', 'Formatura': '#b07be0', 'Confraternização': '#7cc142', 'Festa Particular': '#3fcaa8', 'Outro': '#a99a83' };
const STATUS_META = {
  solicitado: { rotulo: 'Solicitado', cor: '#f5a623' },
  agendado:   { rotulo: 'Agendado',   cor: '#4aa8d8' },
  confirmado: { rotulo: 'Confirmado', cor: '#7cc142' },
  recusado:   { rotulo: 'Recusado',   cor: '#e23b3b' },
};
const FILTROS = ['todos', 'solicitado', 'agendado', 'confirmado', 'recusado'];

function dataFmt(a) {
  try {
    const s = new Date(a.data + 'T' + (a.hora || '00:00')).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch { return a.data; }
}

/**
 * Gestão de agenda — solicitações do app do cliente + eventos manuais.
 * Transições (agendar/confirmar/recusar) e orçamento chamam o backend;
 * quem veio do app recebe a notificação via outbox automaticamente.
 */
export function Agenda({ agendas, transicionar, orcar }) {
  const [filtro, setFiltro] = useState('todos');
  const [expandido, setExpandido] = useState(null);
  const [recusando, setRecusando] = useState(null);   // agenda em recusa (modal de motivo)
  const [motivo, setMotivo] = useState('');
  const [orcando, setOrcando] = useState(null);       // id com editor de valor aberto
  const [valorEdit, setValorEdit] = useState('');

  const lista = useMemo(() => {
    const l = filtro === 'todos' ? agendas : agendas.filter((a) => a.status === filtro);
    return l.slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  }, [agendas, filtro]);

  const solicitadas = agendas.filter((a) => a.status === 'solicitado').length;

  async function confirmarRecusa() {
    if (!recusando || !motivo.trim()) return;
    const id = recusando.id;
    setRecusando(null);
    setMotivo('');
    await transicionar(id, 'recusado', motivo.trim());
  }

  async function salvarValor(id) {
    const v = Number(String(valorEdit).replace(',', '.'));
    setOrcando(null);
    if (Number.isFinite(v) && v >= 0) await orcar(id, v);
  }

  const chip = (ativo, cor) => ({
    padding: '7px 13px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
    border: '1px solid var(--border)',
    background: ativo ? (cor || 'var(--accent)') : 'var(--surface2)',
    color: ativo ? '#1a1206' : 'var(--muted)',
  });
  const btn = (bg, fg = '#1a1206') => ({
    border: 'none', borderRadius: '10px', padding: '9px 13px', background: bg, color: fg,
    fontWeight: 800, fontSize: '12.5px',
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {FILTROS.map((f) => (
          <button key={f} onClick={() => setFiltro(f)} style={chip(filtro === f, f !== 'todos' ? STATUS_META[f]?.cor : undefined)}>
            {f === 'todos' ? 'Todos' : STATUS_META[f].rotulo}
            {f === 'solicitado' && solicitadas > 0 ? ` · ${solicitadas}` : ''}
          </button>
        ))}
      </div>

      {lista.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
          Nenhum evento neste filtro.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {lista.map((a) => {
          const meta = STATUS_META[a.status] || STATUS_META.solicitado;
          const aberto = expandido === a.id;
          return (
            <div key={a.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <button
                onClick={() => setExpandido(aberto ? null : a.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'transparent', border: 'none', textAlign: 'left' }}
              >
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: TIPO_COR[a.tipo] || 'var(--accent)', flex: '0 0 auto' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: '15px', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.cliente} <span style={{ fontWeight: 600, color: 'var(--muted)' }}>· {a.tipo}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>
                    {dataFmt(a)} · {a.hora} · {a.pessoas} pessoas{a.origem === 'app_cliente' ? ' · via app' : ''}
                  </span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: meta.cor, flex: '0 0 auto' }}>{meta.rotulo}</span>
              </button>

              {aberto && (
                <div style={{ padding: '0 16px 15px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', padding: '12px 0', fontSize: '13px', color: 'var(--fg)' }}>
                    <Info k="Telefone" v={a.telefone || '—'} />
                    <Info k="E-mail" v={a.email || '—'} />
                    <Info k="Local" v={a.local || '—'} />
                    <Info k="Protocolo" v={a.protocolo || '—'} />
                    <Info k="Valor" v={a.valor && Number(a.valor) > 0 ? brl(a.valor) : 'A combinar'} />
                    {a.obs ? <Info k="Obs" v={a.obs} /> : null}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {a.status === 'solicitado' && (
                      <button onClick={() => transicionar(a.id, 'agendado')} style={btn('#4aa8d8', '#fff')}>Agendar</button>
                    )}
                    {a.status === 'agendado' && (
                      <button onClick={() => transicionar(a.id, 'confirmado')} style={btn('#7cc142')}>Confirmar</button>
                    )}
                    {(a.status === 'solicitado' || a.status === 'agendado') && (
                      <button onClick={() => { setRecusando(a); setMotivo(''); }} style={btn('#e23b3b', '#fff')}>Recusar</button>
                    )}
                    {orcando === a.id ? (
                      <span style={{ display: 'inline-flex', gap: '6px' }}>
                        <input
                          value={valorEdit}
                          onChange={(e) => setValorEdit(e.target.value)}
                          placeholder="Valor R$"
                          autoFocus
                          style={{ width: '110px', padding: '8px 10px', borderRadius: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px', fontWeight: 700 }}
                        />
                        <button onClick={() => salvarValor(a.id)} style={btn('var(--accent)', 'var(--onAccent)')}>OK</button>
                      </span>
                    ) : (
                      <button onClick={() => { setOrcando(a.id); setValorEdit(a.valor && Number(a.valor) > 0 ? String(a.valor) : ''); }} style={btn('var(--surface2)', 'var(--fg)')}>
                        Orçar
                      </button>
                    )}
                    {a.telefone && (
                      <a
                        href={'tel:' + a.telefone.replace(/[^0-9+]/g, '')}
                        style={{ ...btn('var(--surface2)', 'var(--fg)'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      >
                        Ligar
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* modal de recusa com motivo obrigatório */}
      {recusando && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRecusando(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
        >
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '6px' }}>
              Recusar solicitação
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              {recusando.cliente} · {dataFmt(recusando)}. O motivo será enviado ao cliente.
            </div>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da recusa (obrigatório)"
              rows={3}
              autoFocus
              style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '14px', resize: 'none', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={() => setRecusando(null)} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}>
                Cancelar
              </button>
              <button
                onClick={confirmarRecusa}
                disabled={!motivo.trim()}
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: motivo.trim() ? '#e23b3b' : 'var(--surface2)', color: motivo.trim() ? '#fff' : 'var(--muted)', fontWeight: 800, fontSize: '14px' }}
              >
                Recusar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ k, v }) {
  return (
    <span>
      <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>{k}</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </span>
  );
}
