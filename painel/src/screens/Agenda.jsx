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

/**
 * Gestão de agenda igual ao protótipo: seção de Solicitações (pendentes) com
 * ações rápidas, destaque do próximo evento, e a lista de Eventos aceitos com
 * filtros. Transições (agendar/confirmar/recusar) e orçamento chamam o backend;
 * quem veio do app recebe a notificação via outbox automaticamente.
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

  function Card({ a, quickActions = false }) {
    const meta = STATUS_META[a.status] || STATUS_META.solicitado;
    const aberto = expandido === a.id;
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
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
          <span style={{ textAlign: 'right', flex: '0 0 auto' }}>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 11px', borderRadius: '999px', color: meta.cor, background: `color-mix(in srgb,${meta.cor} 16%,transparent)`, border: `1px solid color-mix(in srgb,${meta.cor} 42%,transparent)` }}>{meta.rotulo}</span>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{countdown(a)}</span>
          </span>
        </button>

        {(quickActions || aberto) && (
          <div style={{ padding: '0 16px 15px', borderTop: '1px solid var(--border)' }}>
            {aberto && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', padding: '12px 0', fontSize: '13px', color: 'var(--fg)' }}>
                <Info k="Telefone" v={a.telefone || '—'} />
                <Info k="E-mail" v={a.email || '—'} />
                <Info k="Local" v={a.local || '—'} />
                <Info k="Protocolo" v={a.protocolo || '—'} />
                <Info k="Valor" v={a.valor && Number(a.valor) > 0 ? brl(a.valor) : 'A combinar'} />
                {a.obs ? <Info k="Obs" v={a.obs} /> : null}
                {a.status === 'recusado' && a.motivo_recusa ? <Info k="Motivo" v={a.motivo_recusa} /> : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: aberto ? 0 : '12px' }}>
              {a.status === 'solicitado' && <button onClick={() => transicionar(a.id, 'agendado')} style={btn('#4aa8d8', '#fff')}>Agendar</button>}
              {a.status === 'agendado' && <button onClick={() => transicionar(a.id, 'confirmado')} style={btn('#7cc142')}>Confirmar</button>}
              {(a.status === 'solicitado' || a.status === 'agendado') && <button onClick={() => { setRecusando(a); setMotivo(''); }} style={btn('#e23b3b', '#fff')}>Recusar</button>}
              {orcando === a.id ? (
                <span style={{ display: 'inline-flex', gap: '6px' }}>
                  <input value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} placeholder="Valor R$" autoFocus style={{ width: '110px', padding: '8px 10px', borderRadius: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px', fontWeight: 700 }} />
                  <button onClick={() => salvarValor(a.id)} style={btn('var(--accent)', 'var(--onAccent)')}>OK</button>
                </span>
              ) : (a.status !== 'recusado' && (
                <button onClick={() => { setOrcando(a.id); setValorEdit(a.valor && Number(a.valor) > 0 ? String(a.valor) : ''); }} style={btn('var(--surface2)', 'var(--fg)')}>Orçar</button>
              ))}
              {a.telefone && (
                <a href={'tel:' + a.telefone.replace(/[^0-9+]/g, '')} style={{ ...btn('var(--surface2)', 'var(--fg)'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Ligar</a>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Solicitações pendentes */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '12px' }}>
          <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', margin: 0 }}>Solicitações</h2>
          <span style={{ fontSize: '12px', fontWeight: 800, color: solicitados.length ? '#f5a623' : 'var(--muted)' }}>{solicitados.length}</span>
        </div>
        {solicitados.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>
            Nenhuma solicitação pendente.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {solicitados.map((a) => <Card key={a.id} a={a} quickActions />)}
          </div>
        )}
      </section>

      {/* Próximo evento */}
      {prox && (
        <section>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'var(--accent)', marginBottom: '8px' }}>PRÓXIMO EVENTO</div>
          <div style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', borderRadius: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: TIPO_COR[prox.tipo] || 'var(--accent)' }} />
              <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)' }}>{prox.cliente}</span>
              <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 800, color: 'var(--accent)' }}>{countdown(prox)}</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
              {prox.tipo} · {dataFmt(prox)} · {prox.hora} · {prox.pessoas} pessoas · {prox.local || 'local a definir'}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginTop: '4px' }}>
              {prox.valor && Number(prox.valor) > 0 ? brl(prox.valor) : 'Valor a combinar'}
            </div>
          </div>
        </section>
      )}

      {/* Eventos aceitos */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', margin: '0 6px 0 0' }}>Eventos</h2>
          {filtros.map(([k, label, n]) => (
            <button
              key={k} onClick={() => setFiltro(k)}
              style={{
                fontSize: '11.5px', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', whiteSpace: 'nowrap',
                border: filtro === k ? 'none' : '1px solid var(--border)',
                background: filtro === k ? 'var(--accent)' : 'var(--bg)',
                color: filtro === k ? 'var(--onAccent)' : 'var(--muted)',
              }}
            >
              {label} · {n}
            </button>
          ))}
        </div>
        {aceitas.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>
            Nenhum evento neste filtro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {aceitas.map((a) => <Card key={a.id} a={a} />)}
          </div>
        )}
      </section>

      {/* modal de recusa com motivo obrigatório */}
      {recusando && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRecusando(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
        >
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '6px' }}>Recusar solicitação</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              {recusando.cliente} · {dataFmt(recusando)}. O motivo será enviado ao cliente.
            </div>
            <textarea
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da recusa (obrigatório)" rows={3} autoFocus
              style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '14px', resize: 'none', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={() => setRecusando(null)} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}>Cancelar</button>
              <button onClick={confirmarRecusa} disabled={!motivo.trim()} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: motivo.trim() ? '#e23b3b' : 'var(--surface2)', color: motivo.trim() ? '#fff' : 'var(--muted)', fontWeight: 800, fontSize: '14px' }}>Recusar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btn = (bg, fg = '#1a1206') => ({ border: 'none', borderRadius: '10px', padding: '9px 13px', background: bg, color: fg, fontWeight: 800, fontSize: '12.5px' });

function Info({ k, v }) {
  return (
    <span>
      <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>{k}</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </span>
  );
}
