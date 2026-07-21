import { useMemo, useState } from 'react';
import { useViewport } from '../hooks/useViewport.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SLOTS = [
  { key: 'tarde',     rotulo: 'Tarde',     hora: '14h às 18h' },
  { key: 'noite',     rotulo: 'Noite',     hora: '19h às 23h' },
  { key: 'madrugada', rotulo: 'Madrugada', hora: '23h às 03h' },
];

const isoOf = (a, m, d) => `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Período canônico a partir da hora da agenda (espelha acl.MAPA_SLOT). */
function periodoDe(hora) {
  const h = parseInt(String(hora || '').split(':')[0], 10);
  if (Number.isNaN(h)) return null;
  if (h >= 19 && h < 23) return 'noite';
  if (h >= 23 || h < 6) return 'madrugada';
  return 'tarde';
}

/**
 * Disponibilidade — a gestão DECLARA quais dias/períodos o trailer atende
 * eventos. Dia não declarado = indisponível no app do cliente. Ocupação por
 * agenda aceita aparece como overlay informativo (o bloqueio real é feito no
 * merge da borda pública).
 */
export function Dispo({ dispoApi, agendas }) {
  const { isTablet } = useViewport();
  const { ano, mes, dias, carregando, navegar, salvar } = dispoApi;
  const [sel, setSel] = useState(null);        // iso selecionado
  const [salvando, setSalvando] = useState(false);

  const primeiraCasa = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // ocupação informativa por dia (agendas aceitas)
  const ocupacao = useMemo(() => {
    const mapa = {};
    for (const a of agendas) {
      if (a.status !== 'agendado' && a.status !== 'confirmado') continue;
      const p = periodoDe(a.hora);
      if (!p) continue;
      (mapa[a.data] = mapa[a.data] || {})[p] = true;
    }
    return mapa;
  }, [agendas]);

  const info = sel ? dias[sel] : null;
  const declarado = !!info;
  const slotsDoDia = { tarde: info?.tarde ?? false, noite: info?.noite ?? false, madrugada: info?.madrugada ?? false };

  async function aplicar(novo) {
    if (!sel || salvando) return;
    setSalvando(true);
    try {
      await salvar(sel, novo);
    } catch (e) {
      alert(e?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  // Status do dia descontando ocupação por evento aceito (espelha o merge da borda).
  function statusDoDia(iso) {
    const d = dias[iso];
    if (!d) return null; // não declarado
    const bk = ocupacao[iso] || {};
    const livres = ['tarde', 'noite', 'madrugada'].filter((k) => d[k] && !bk[k]).length;
    if (livres === 0) return { cor: '#e2615a', key: 'ocupado' };
    if (livres === 3) return { cor: '#7cc142', key: 'livre' };
    return { cor: '#f5a623', key: 'parcial' };
  }

  const nEventos = useMemo(() => {
    const m = {};
    for (const a of agendas) m[a.data] = (m[a.data] || 0) + 1;
    return m;
  }, [agendas]);

  const celulas = [];
  for (let i = 0; i < primeiraCasa; i++) celulas.push(<span key={'x' + i} />);
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = isoOf(ano, mes, d);
    const passado = Date.UTC(ano, mes, d) < hojeUtc;
    const st = statusDoDia(iso);
    const selecionado = sel === iso;
    const nEv = nEventos[iso] || 0;
    // Tinge a célula por status (livre/parcial/ocupado), como no protótipo.
    let bg = passado ? 'transparent' : 'var(--surface2)';
    let borda = selecionado ? 'var(--accent)' : 'var(--border)';
    if (!passado && st) {
      bg = selecionado ? `color-mix(in srgb, ${st.cor} 26%, transparent)` : `color-mix(in srgb, ${st.cor} 14%, transparent)`;
      if (!selecionado) borda = `color-mix(in srgb, ${st.cor} 40%, transparent)`;
    } else if (!passado && selecionado) {
      bg = 'color-mix(in srgb, var(--accent) 18%, transparent)';
    }
    celulas.push(
      <button
        key={d}
        onClick={() => setSel(selecionado ? null : iso)}
        disabled={passado}
        style={{
          aspectRatio: '1/1', borderRadius: '12px', position: 'relative',
          border: `1px solid ${borda}`, background: bg,
          color: passado ? 'color-mix(in srgb, var(--fg) 25%, transparent)' : 'var(--fg)',
          fontWeight: 800, fontSize: '14px', fontFamily: 'Hanken Grotesk',
          cursor: passado ? 'default' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}
      >
        <span>{d}</span>
        {st && !passado && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.cor }} />}
        {nEv > 0 && <span style={{ position: 'absolute', top: '4px', right: '5px', fontSize: '9px', fontWeight: 800, color: '#4aa8d8' }}>{nEv}</span>}
      </button>,
    );
  }

  return (
     <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '22px 24px' }}>
      {/* cabeçalho da seção */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ maxWidth: '520px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '9px', background: 'color-mix(in srgb,var(--accent) 16%,transparent)', color: 'var(--accent)', flex: 'none' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
            </span>
            <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', letterSpacing: '-.01em' }}>Disponibilidade no app do cliente</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '7px', lineHeight: 1.5 }}>
            Controla o calendário que o cliente vê ao solicitar um evento. Toque num dia para liberar ou bloquear os horários de <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>Tarde</strong>, <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>Noite</strong> e <strong style={{ color: 'var(--fg)', fontWeight: 600 }}>Madrugada</strong>.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Legenda cor="#7cc142" texto="Livre" />
          <Legenda cor="#f5a623" texto="Parcial" />
          <Legenda cor="#e2615a" texto="Ocupado" />
        </div>
      </div>

      {/* Calendário com largura-teto (não estica em telas largas — tamanho padrão). */}
      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(300px, 600px) minmax(280px, 1fr)', gap: '18px', alignItems: 'start' }}>
      {/* calendário */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', width: '100%', maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <button onClick={() => navegar(-1)} style={navBtn}>‹</button>
          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '18px', color: 'var(--fg)' }}>
            {MESES[mes]} {ano}{carregando ? ' · carregando…' : ''}
          </span>
          <button onClick={() => navegar(1)} style={navBtn}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '5px', marginBottom: '6px' }}>
          {WEEK.map((w, i) => (
            <span key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--muted)' }}>{w}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '5px' }}>{celulas}</div>

        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Nº azul = eventos no dia · sem cor = não declarado (indisponível no app)</span>
        </div>
      </div>

      {/* editor do dia */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
        {!sel ? (
          <div style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '40px 10px', lineHeight: 1.6 }}>
            Selecione um dia no calendário para liberar ou fechar períodos.<br />
            <b style={{ color: 'var(--fg)' }}>Dias não declarados não aparecem para o cliente.</b>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '2px' }}>
              {new Date(sel + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>
            <div style={{ fontSize: '12.5px', color: declarado ? 'var(--accent2)' : 'var(--muted)', fontWeight: 700, marginBottom: '14px' }}>
              {declarado ? 'Dia declarado' : 'Não declarado — invisível no app do cliente'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '14px' }}>
              {SLOTS.map((s) => {
                const livre = slotsDoDia[s.key];
                const ocupadoSlot = ocupacao[sel]?.[s.key];
                return (
                  <button
                    key={s.key}
                    disabled={salvando}
                    onClick={() => aplicar({ ...slotsDoDia, [s.key]: !livre })}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 15px', borderRadius: '13px',
                      border: `1px solid ${livre ? 'color-mix(in srgb, var(--accent2) 50%, transparent)' : 'var(--border)'}`,
                      background: livre ? 'color-mix(in srgb, var(--accent2) 13%, transparent)' : 'var(--surface2)',
                      color: 'var(--fg)', textAlign: 'left',
                    }}
                  >
                    <span>
                      <span style={{ display: 'block', fontWeight: 800, fontSize: '14px' }}>{s.rotulo}</span>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                        {s.hora}{ocupadoSlot ? ' · evento aceito neste período' : ''}
                      </span>
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: livre ? 'var(--accent2)' : 'var(--muted)' }}>
                      {livre ? 'LIVRE' : 'FECHADO'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '9px' }}>
              <button
                disabled={salvando}
                onClick={() => aplicar({ tarde: true, noite: true, madrugada: true })}
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '13px' }}
              >
                Liberar todos
              </button>
              <button
                disabled={salvando}
                onClick={() => aplicar({ tarde: false, noite: false, madrugada: false })}
                style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '13px' }}
              >
                Fechar todos
              </button>
            </div>
            {salvando && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>Salvando…</div>}
          </>
        )}
      </div>
      </div>
     </div>
  );
}

const navBtn = {
  width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--fg)', fontSize: '18px', fontWeight: 800,
};

function Legenda({ cor, borda, texto }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cor, border: borda ? `1.5px solid ${borda}` : 'none', boxSizing: 'border-box' }} />
      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{texto}</span>
    </span>
  );
}
