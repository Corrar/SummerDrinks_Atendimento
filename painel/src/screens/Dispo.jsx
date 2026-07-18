import { useMemo, useState } from 'react';

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

  function corDoDia(iso) {
    const d = dias[iso];
    if (!d) return null; // não declarado
    const livres = [d.tarde, d.noite, d.madrugada].filter(Boolean).length;
    if (livres === 0) return '#e23b3b';
    if (livres === 3) return 'var(--accent2)';
    return 'var(--accent)';
  }

  const celulas = [];
  for (let i = 0; i < primeiraCasa; i++) celulas.push(<span key={'x' + i} />);
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = isoOf(ano, mes, d);
    const passado = Date.UTC(ano, mes, d) < hojeUtc;
    const cor = corDoDia(iso);
    const ocupado = ocupacao[iso];
    const selecionado = sel === iso;
    celulas.push(
      <button
        key={d}
        onClick={() => setSel(selecionado ? null : iso)}
        disabled={passado}
        style={{
          aspectRatio: '1/1', borderRadius: '12px', position: 'relative',
          border: `1px solid ${selecionado ? 'var(--accent)' : 'var(--border)'}`,
          background: selecionado
            ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
            : passado ? 'transparent' : 'var(--surface2)',
          color: passado ? 'color-mix(in srgb, var(--fg) 25%, transparent)' : 'var(--fg)',
          fontWeight: 800, fontSize: '14px', fontFamily: 'Hanken Grotesk',
          cursor: passado ? 'default' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}
      >
        <span>{d}</span>
        <span style={{ display: 'flex', gap: '3px' }}>
          {cor && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cor }} />}
          {ocupado && <span title="Há evento aceito" style={{ width: '6px', height: '6px', borderRadius: '50%', border: '1.5px solid #4aa8d8', boxSizing: 'border-box' }} />}
        </span>
      </button>,
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(280px, 1fr)', gap: '18px', alignItems: 'start' }}>
      {/* calendário */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
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

        <div style={{ display: 'flex', gap: '14px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <Legenda cor="var(--accent2)" texto="Todos os períodos livres" />
          <Legenda cor="var(--accent)" texto="Parcial" />
          <Legenda cor="#e23b3b" texto="Fechado" />
          <Legenda cor="transparent" borda="#4aa8d8" texto="Evento aceito no dia" />
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Sem bolinha = não declarado (indisponível no app)</span>
        </div>
      </div>

      {/* editor do dia */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' }}>
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
