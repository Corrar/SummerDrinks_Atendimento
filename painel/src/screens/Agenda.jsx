import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Dispo } from './Dispo.jsx';
import { useViewport } from '../hooks/useViewport.js';

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
export function Agenda({ agendas, transicionar, orcar, criar, dispoApi }) {
  const { isMobile } = useViewport();
  const [filtro, setFiltro] = useState('todas');
  const [expandido, setExpandido] = useState(null);
  const [recusando, setRecusando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [orcando, setOrcando] = useState(null);
  const [valorEdit, setValorEdit] = useState('');
  const [novaOpen, setNovaOpen] = useState(false);
  const [ceOpen, setCeOpen] = useState(false);

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
    <div style={{ padding: isMobile ? '16px' : '24px 28px' }}>
      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em', lineHeight: 1 }}>Gerenciar agenda</div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '6px' }}>{solicitados.length} solicitações pendentes · {nAgendadas} agendas aceitas · {nConfirmadas} confirmadas</div>
        </div>
        <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
          <button onClick={() => setCeOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: '11px', padding: '12px 18px', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '13.5px', cursor: 'pointer' }}><span style={{ color: 'var(--accent)' }}>★</span> Criar cardápio</button>
          <button onClick={() => setNovaOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '11px', padding: '12px 18px', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '13.5px', cursor: 'pointer' }}>+ Nova agenda</button>
        </div>
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

      {/* disponibilidade no app do cliente (entre o hero e as solicitações, como no protótipo) */}
      {dispoApi && (
        <div style={{ marginBottom: '24px' }}>
          <Dispo dispoApi={dispoApi} agendas={agendas} />
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

      {novaOpen && <NovaAgendaModal onClose={() => setNovaOpen(false)} criar={criar} />}
      {ceOpen && <CardapiosEventoModal onClose={() => setCeOpen(false)} />}
    </div>
  );
}

const modalInp = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 13px', color: 'var(--fg)', fontSize: '14px', outline: 'none' };
const modalRotulo = { fontSize: '10.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: '5px', display: 'block' };

function ModalCasca({ titulo, onClose, children, largura = '520px' }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 47, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}>
      <div style={{ width: '100%', maxWidth: largura, maxHeight: '88vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '20px', letterSpacing: '-.01em' }}>{titulo}</div>
          <button onClick={onClose} style={{ flex: 'none', width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div className="sd-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

const TIPOS = ['Aniversário', 'Casamento', 'Corporativo', 'Formatura', 'Confraternização', 'Festa Particular', 'Outro'];
const SLOTS_EV = ['Tarde', 'Noite', 'Madrugada'];

// Nova agenda (origem gestão) → POST /agendas via `criar`.
function NovaAgendaModal({ onClose, criar }) {
  const hojeIso = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ nome: '', telefone: '', email: '', tipo: 'Aniversário', data: hojeIso, slot: 'Noite', pessoas: '', local: '', obs: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  async function salvar() {
    if (!f.nome.trim() || f.telefone.replace(/\D/g, '').length < 8) { setErro('Preencha nome e um telefone válido.'); return; }
    setSalvando(true); setErro('');
    try {
      // pessoas precisa ser inteiro (schema z.coerce.number().int()); telefone ≤ 20.
      await criar({ nome: f.nome.trim(), telefone: f.telefone.trim().slice(0, 20), email: f.email.trim(), tipo: f.tipo, data: f.data, slot: f.slot, pessoas: Math.max(0, Math.floor(Number(f.pessoas) || 0)), local: f.local.trim(), obs: f.obs.trim() });
      onClose();
    } catch (e) {
      setErro(e?.message || 'Não foi possível criar a agenda.');
    } finally { setSalvando(false); }
  }

  return (
    <ModalCasca titulo="Nova agenda" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
        <div><label style={modalRotulo}>Cliente</label><input value={f.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome do cliente" style={modalInp} autoFocus /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div><label style={modalRotulo}>Telefone</label><input value={f.telefone} onChange={(e) => set({ telefone: e.target.value })} maxLength={20} placeholder="(81) 90000-0000" style={modalInp} /></div>
          <div><label style={modalRotulo}>E-mail (opcional)</label><input value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="cliente@email.com" style={modalInp} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div><label style={modalRotulo}>Tipo</label><select value={f.tipo} onChange={(e) => set({ tipo: e.target.value })} style={{ ...modalInp, cursor: 'pointer' }}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label style={modalRotulo}>Convidados</label><input type="number" min="0" step="1" value={f.pessoas} onChange={(e) => set({ pessoas: e.target.value })} placeholder="0" style={modalInp} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div><label style={modalRotulo}>Data</label><input type="date" min={hojeIso} value={f.data} onChange={(e) => set({ data: e.target.value })} style={modalInp} /></div>
          <div><label style={modalRotulo}>Período</label><select value={f.slot} onChange={(e) => set({ slot: e.target.value })} style={{ ...modalInp, cursor: 'pointer' }}>{SLOTS_EV.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div><label style={modalRotulo}>Local</label><input value={f.local} onChange={(e) => set({ local: e.target.value })} placeholder="Endereço / referência do evento" style={modalInp} /></div>
        <div><label style={modalRotulo}>Observação</label><textarea value={f.obs} onChange={(e) => set({ obs: e.target.value })} rows={2} placeholder="Pacote, bebidas, estrutura, pendências..." style={{ ...modalInp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }} /></div>
        {erro && <div style={{ fontSize: '12.5px', color: '#ff927d', fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: '9px', marginTop: '2px' }}>
          <button onClick={salvar} disabled={salvando} style={{ flex: 1, background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '11px', padding: '13px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>{salvando ? 'Criando…' : 'Criar agenda'}</button>
          <button onClick={onClose} style={{ flex: 'none', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: '11px', padding: '13px 18px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </ModalCasca>
  );
}

// Cardápios de evento — gerencia config.cardapiosEvento (mesma fonte da aba Ajustes).
function CardapiosEventoModal({ onClose }) {
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    api.lerConfig().then((c) => { if (vivo) setForm(c); }).catch(() => { if (vivo) setAviso('Não foi possível carregar os cardápios.'); });
    return () => { vivo = false; };
  }, []);

  const ce = () => form?.cardapiosEvento || [];
  const setCe = (lista) => setForm((f) => ({ ...f, cardapiosEvento: lista }));
  const add = () => setCe([...ce(), { id: 'ce' + Date.now(), nome: 'Novo cardápio', itens: '' }]);
  const edit = (id, patch) => setCe(ce().map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const rm = (id) => setCe(ce().filter((c) => c.id !== id));

  async function salvar() {
    if (!form || salvando) return;
    setSalvando(true); setAviso('');
    try {
      const salvo = await api.salvarConfig({ ...form, cardapiosEvento: ce() });
      setForm(salvo);
      setAviso('Cardápios salvos.');
    } catch (e) {
      setAviso(e?.codigo === 'CONFLITO_VERSAO' ? 'Outro operador salvou antes — reabra e tente de novo.' : (e?.message || 'Não foi possível salvar.'));
    } finally { setSalvando(false); }
  }

  return (
    <ModalCasca titulo="★ Cardápios de evento" onClose={onClose}>
      {!form ? (
        <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '14px 0', textAlign: 'center' }}>Carregando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Presets oferecidos como atalho quando o cliente solicita um evento (também editáveis em Ajustes).</div>
          {ce().length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '14px 0' }}>Nenhum cardápio de evento ainda.</div>}
          {ce().map((c) => (
            <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '13px', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent)', fontSize: '15px' }}>★</span>
                <input value={c.nome} onChange={(e) => edit(c.id, { nome: e.target.value })} placeholder="Nome do cardápio (ex.: Festa Tropical)" style={{ ...modalInp, fontWeight: 600, background: 'var(--surface)' }} />
                <button onClick={() => rm(c.id)} title="Excluir" style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '9px', background: 'var(--surface)', border: '1px solid var(--border)', color: '#e2615a', fontSize: '13px', cursor: 'pointer' }}>🗑</button>
              </div>
              <textarea value={c.itens} onChange={(e) => edit(c.id, { itens: e.target.value })} rows={2} placeholder="Drinks incluídos..." style={{ ...modalInp, background: 'var(--surface)', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
            </div>
          ))}
          <button onClick={add} style={{ background: 'none', border: '1.5px dashed var(--border)', color: 'var(--muted)', borderRadius: '13px', padding: '14px', fontWeight: 700, fontSize: '13.5px', cursor: 'pointer' }}>+ Novo cardápio</button>
          {aviso && <div style={{ fontSize: '12.5px', color: aviso.includes('salvos') ? 'var(--accent2)' : '#ff927d', fontWeight: 600 }}>{aviso}</div>}
          <div style={{ display: 'flex', gap: '9px' }}>
            <button onClick={salvar} disabled={salvando} style={{ flex: 1, background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '11px', padding: '13px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>{salvando ? 'Salvando…' : 'Salvar cardápios'}</button>
            <button onClick={onClose} style={{ flex: 'none', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: '11px', padding: '13px 18px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>Fechar</button>
          </div>
        </div>
      )}
    </ModalCasca>
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
