import { useMemo, useState } from 'react';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIPO_COR = { 'Aniversário': '#ff5da2', 'Casamento': '#f5a623', 'Corporativo': '#4aa8d8', 'Formatura': '#b07be0', 'Confraternização': '#7cc142', 'Festa Particular': '#3fcaa8', 'Outro': '#a99a83' };
const STATUS_META = {
  solicitado: { rotulo: 'Solicitado', cor: '#f5a623' },
  agendado:   { rotulo: 'Agendado',   cor: '#4aa8d8' },
  confirmado: { rotulo: 'Confirmado', cor: '#7cc142' },
  recusado:   { rotulo: 'Recusado',   cor: '#e23b3b' },
};

const dataObj = (a) => new Date(a.data + 'T' + (a.hora || '00:00'));
function dataFmt(a) {
  try {
    const s = dataObj(a).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch { return a.data; }
}
function countdown(a) {
  const now = new Date(); const ev = dataObj(a);
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const e0 = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate());
  const dias = Math.round((e0 - d0) / 86400000);
  if (dias < 0) return 'Encerrado';
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return 'Em ' + dias + ' dias';
}
const telLink = (a) => 'tel:' + String(a.telefone || '').replace(/[^0-9+]/g, '');
const pill = (cor) => ({ fontSize: '10.5px', fontWeight: 700, padding: '4px 11px', borderRadius: '999px', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.05em', color: cor, background: `color-mix(in srgb,${cor} 18%,transparent)`, border: `1px solid color-mix(in srgb,${cor} 45%,transparent)` });

/**
 * Gerenciar agenda — igual ao protótipo: cabeçalho com contagens, hero do próximo
 * evento, solicitações pendentes em cards e a lista de eventos aceitos com filtros.
 * Transições (agendar/confirmar/recusar) e orçamento chamam o backend; quem veio
 * do app recebe a notificação via outbox automaticamente.
 */
export function Agenda({ agendas, transicionar, orcar }) {
  const [filtro, setFiltro] = useState('todas');
  const [expandido, setExpandido] = useState(null);
  const [recusando, setRecusando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [orcando, setOrcando] = useState(null);
  const [valorEdit, setValorEdit] = useState('');

  const porData = (a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || ''));
  const solicitados = useMemo(() => agendas.filter((a) => a.status === 'solicitado').slice().sort(porData), [agendas]);
  const aceitasFull = useMemo(() => agendas.filter((a) => a.status === 'agendado' || a.status === 'confirmado').slice().sort(porData), [agendas]);
  const recusadas = useMemo(() => agendas.filter((a) => a.status === 'recusado').slice().sort(porData), [agendas]);

  const nAgendadas = aceitasFull.filter((a) => a.status === 'agendado').length;
  const nConfirmadas = aceitasFull.filter((a) => a.status === 'confirmado').length;

  const aceitas = useMemo(() => {
    if (filtro === 'agendadas') return aceitasFull.filter((a) => a.status === 'agendado');
    if (filtro === 'confirmadas') return aceitasFull.filter((a) => a.status === 'confirmado');
    if (filtro === 'recusadas') return recusadas;
    return aceitasFull;
  }, [filtro, aceitasFull, recusadas]);

  const hoje = new Date(); const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const prox = aceitasFull.find((a) => dataObj(a) >= hoje0) || null;

  async function confirmarRecusa() {
    if (!recusando || !motivo.trim()) return;
    const id = recusando.id;
    setRecusando(null); setMotivo('');
    await transicionar(id, 'recusado', motivo.trim());
  }
  async function salvarValor(id) {
    const v = Number(String(valorEdit).replace(',', '.'));
    setOrcando(null);
    if (Number.isFinite(v) && v >= 0) await orcar(id, v);
  }

  const filtros = [['todas', 'Todas', aceitasFull.length], ['agendadas', 'Agendadas', nAgendadas], ['confirmadas', 'Confirmadas', nConfirmadas], ['recusadas', 'Recusadas', recusadas.length]];

  const ctx = {
    expandido, setExpandido, transicionar,
    orcando, setOrcando, valorEdit, setValorEdit, salvarValor,
    abrirRecusa: (a) => { setRecusando(a); setMotivo(''); },
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* cabeçalho */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em', lineHeight: 1 }}>Gerenciar agenda</div>
        <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '6px' }}>{solicitados.length} solicitações pendentes · {nAgendadas} agendas aceitas · {nConfirmadas} confirmadas</div>
      </div>

      {/* hero: próximo evento */}
      {prox ? (
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '22px', border: '1px solid var(--border)', background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent2) 24%, var(--surface)) 0%, var(--surface) 62%)', padding: '26px 28px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '28px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '240px', flex: 1 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '999px', padding: '8px 15px', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.16em', color: 'var(--accent2)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent2)', boxShadow: '0 0 8px var(--accent2)', animation: 'pulseGlow 1.8s infinite' }} />
                Próximo evento · {countdown(prox)}
              </div>
              <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '34px', letterSpacing: '-.025em', lineHeight: 1.06, marginTop: '14px' }}>{prox.cliente}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 600 }}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: TIPO_COR[prox.tipo] || 'var(--accent)' }} />{prox.tipo}</span>
                <span style={{ color: 'var(--muted)' }}>·</span>
                <span style={{ fontSize: '13px' }}>{dataFmt(prox)} · {prox.hora}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--muted)', marginTop: '8px' }}>📍 <span>{prox.local || 'Local a definir'}</span></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '230px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '13px 15px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Convidados</div>
                  <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '22px', marginTop: '5px', lineHeight: 1 }}>{prox.pessoas || 0}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '13px 15px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Valor</div>
                  <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '22px', marginTop: '5px', lineHeight: 1 }}>{prox.valor && Number(prox.valor) > 0 ? brl(prox.valor) : 'A combinar'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {prox.telefone && <a href={telLink(prox)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '13px', fontWeight: 700, fontSize: '13.5px', color: 'var(--fg)' }}>☎ Ligar</a>}
                {prox.status === 'agendado' ? (
                  <button onClick={() => transicionar(prox.id, 'confirmado')} style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#7cc142', color: '#14240a', border: 'none', borderRadius: '12px', padding: '13px 16px', fontWeight: 700, fontSize: '13.5px', cursor: 'pointer' }}>✓ Confirmar</button>
                ) : (
                  <span style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', background: 'color-mix(in srgb,#7cc142 18%,transparent)', color: '#7cc142', border: '1px solid color-mix(in srgb,#7cc142 45%,transparent)', borderRadius: '12px', padding: '13px 16px', fontWeight: 700, fontSize: '13px' }}>✓ Confirmado</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: '22px', border: '1px dashed var(--border)', background: 'var(--surface)', padding: '30px 28px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '18px' }}>Nenhum evento agendado</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>Aceite uma solicitação abaixo para ver o próximo evento aqui.</div>
        </div>
      )}

      {/* solicitações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '17px' }}>Solicitações de agendamento</div>
        <span style={{ fontSize: '12px', color: 'var(--accent)', background: 'color-mix(in srgb,var(--accent) 16%,transparent)', borderRadius: '999px', padding: '3px 10px', fontWeight: 700 }}>{solicitados.length}</span>
      </div>
      {solicitados.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', textAlign: 'center', color: 'var(--muted)', marginBottom: '30px' }}>Nenhuma solicitação pendente no momento.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '16px', marginBottom: '30px' }}>
          {solicitados.map((a) => <SolicitacaoCard key={a.id} a={a} onAgendar={() => transicionar(a.id, 'agendado')} onRecusar={() => ctx.abrirRecusa(a)} />)}
        </div>
      )}

      {/* eventos aceitos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '17px', marginRight: '6px' }}>Eventos</div>
        {filtros.map(([k, label, n]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', whiteSpace: 'nowrap', border: filtro === k ? 'none' : '1px solid var(--border)', background: filtro === k ? 'var(--accent)' : 'var(--bg)', color: filtro === k ? 'var(--onAccent)' : 'var(--muted)' }}>
            {label} · {n}
          </button>
        ))}
      </div>
      {aceitas.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>Nenhum evento neste filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          {aceitas.map((a) => <EventoCard key={a.id} a={a} ctx={ctx} />)}
        </div>
      )}

      {/* modal de recusa com motivo obrigatório */}
      {recusando && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRecusando(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
        >
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', marginBottom: '6px' }}>Recusar solicitação</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>{recusando.cliente} · {dataFmt(recusando)}. O motivo será enviado ao cliente.</div>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa (obrigatório)" rows={3} autoFocus style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '14px', resize: 'none', marginBottom: '14px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={() => setRecusando(null)} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarRecusa} disabled={!motivo.trim()} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: motivo.trim() ? '#e23b3b' : 'var(--surface2)', color: motivo.trim() ? '#fff' : 'var(--muted)', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>Recusar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Card de solicitação — desenho do protótipo (grid de dados + ações).
function SolicitacaoCard({ a, onAgendar, onRecusar }) {
  const meta = STATUS_META[a.status] || STATUS_META.solicitado;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '17px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <span style={pill(meta.cor)}>{meta.rotulo}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{countdown(a)}</span>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', flex: 'none', background: TIPO_COR[a.tipo] || 'var(--accent)' }} />
          <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', letterSpacing: '-.01em', lineHeight: 1.1 }}>{a.cliente}</span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', marginLeft: '20px' }}>{a.tipo}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 14px', padding: '13px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <Campo k="Data" v={`${dataFmt(a)} · ${a.hora}`} />
        <Campo k="Convidados" v={`${a.pessoas || 0} pessoas`} />
        <Campo k="Local" v={a.local || '—'} />
        <Campo k="Valor acordado" v={a.valor && Number(a.valor) > 0 ? brl(a.valor) : 'A combinar'} forte />
      </div>
      {a.cardapio && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', lineHeight: 1.4 }}><span style={{ color: 'var(--accent)' }}>★</span><span style={{ fontWeight: 600 }}>{a.cardapio}</span></div>
      )}
      {a.obs && <div style={{ fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.45 }}>{a.obs}</div>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        <button onClick={onAgendar} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '11px', padding: '11px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>✓ Agendar</button>
        {a.telefone && <a href={telLink(a)} title="Ligar" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', height: '42px', textDecoration: 'none', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '11px', color: 'var(--fg)', fontSize: '16px' }}>☎</a>}
        <button onClick={onRecusar} title="Recusar" style={{ flex: 'none', width: '42px', height: '42px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '11px', color: '#e2615a', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
    </div>
  );
}

// Card de evento aceito — expansível com contato/valor + ações (confirmar/orçar).
function EventoCard({ a, ctx }) {
  const { expandido, setExpandido, transicionar, orcando, setOrcando, valorEdit, setValorEdit, salvarValor, abrirRecusa } = ctx;
  const meta = STATUS_META[a.status] || STATUS_META.agendado;
  const aberto = expandido === a.id;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
      <button onClick={() => setExpandido(aberto ? null : a.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '15px 18px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: TIPO_COR[a.tipo] || 'var(--accent)', flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.cliente} <span style={{ fontWeight: 600, color: 'var(--muted)' }}>· {a.tipo}</span></span>
          <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>{dataFmt(a)} · {a.hora} · {a.pessoas} pessoas · {a.local || 'local a definir'}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 'none' }}>
          <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px' }}>{a.valor && Number(a.valor) > 0 ? brl(a.valor) : '—'}</span>
          <span style={pill(meta.cor)}>{meta.rotulo}</span>
        </span>
      </button>
      {aberto && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', padding: '14px 0' }}>
            <Campo k="Telefone" v={a.telefone || '—'} />
            <Campo k="E-mail" v={a.email || '—'} />
            <Campo k="Protocolo" v={a.protocolo || '—'} />
            {a.cardapio ? <Campo k="Cardápio" v={a.cardapio} /> : null}
            {a.obs ? <Campo k="Observação" v={a.obs} /> : null}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {a.status === 'agendado' && <button onClick={() => transicionar(a.id, 'confirmado')} style={{ background: '#7cc142', color: '#14240a', border: 'none', borderRadius: '10px', padding: '9px 14px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>✓ Confirmar</button>}
            {orcando === a.id ? (
              <span style={{ display: 'inline-flex', gap: '6px' }}>
                <input value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} placeholder="Valor R$" autoFocus style={{ width: '110px', padding: '8px 10px', borderRadius: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px', fontWeight: 700, outline: 'none' }} />
                <button onClick={() => salvarValor(a.id)} style={{ background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '10px', padding: '9px 14px', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>OK</button>
              </span>
            ) : (
              <button onClick={() => { setOrcando(a.id); setValorEdit(a.valor && Number(a.valor) > 0 ? String(a.valor) : ''); }} style={{ background: 'var(--surface2)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '9px 14px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>Orçar</button>
            )}
            {a.status === 'agendado' && <button onClick={() => abrirRecusa(a)} style={{ background: 'color-mix(in srgb,#e2615a 12%,transparent)', color: '#e2615a', border: '1px solid color-mix(in srgb,#e2615a 38%,transparent)', borderRadius: '10px', padding: '9px 14px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>Recusar</button>}
            {a.telefone && <a href={telLink(a)} style={{ background: 'var(--surface2)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '9px 14px', fontWeight: 700, fontSize: '12.5px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>☎ Ligar</a>}
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ k, v, forte }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div>
      <div style={{ fontSize: forte ? '15px' : '13px', fontWeight: forte ? 700 : 600, marginTop: '2px', lineHeight: 1.3, fontFamily: forte ? "'Bricolage Grotesque',sans-serif" : 'inherit' }}>{v}</div>
    </div>
  );
}
