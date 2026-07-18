import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Semana canônica — pares dia/curto compatíveis com o matching do app do
// cliente (lib/schedule.js normaliza acento/caixa antes de comparar).
const SEMANA = [
  { dia: 'Segunda-feira', curto: 'Seg' },
  { dia: 'Terça-feira',   curto: 'Ter' },
  { dia: 'Quarta-feira',  curto: 'Qua' },
  { dia: 'Quinta-feira',  curto: 'Qui' },
  { dia: 'Sexta-feira',   curto: 'Sex' },
  { dia: 'Sábado',        curto: 'Sáb' },
  { dia: 'Domingo',       curto: 'Dom' },
];

/**
 * Config — horários semanais, locais e contato. O PUT substitui a config
 * INTEIRA com version lock: em 409 (outro operador salvou antes) recarrega e
 * pede para reaplicar — sem merge silencioso de um replace total.
 * O que sai na borda pública: horarios+locais (o app deriva Aberto/Fechado
 * e endereço). telefone/whatsapp são PII comercial: só aqui na gestão.
 */
export function Config({ ativo }) {
  const [form, setForm] = useState(null);     // {horarios, locais, telefone, whatsapp, version}
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    api.lerConfig().then((cfg) => { if (vivo) { setForm(cfg); setDirty(false); } }).catch(() => {});
    return () => { vivo = false; };
  }, [ativo]);

  if (!form) {
    return <div style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>Carregando…</div>;
  }

  function mutar(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setAviso(null);
  }
  const setHorario = (i, patch) => mutar({ horarios: form.horarios.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  const setLocal = (id, patch) => mutar({ locais: form.locais.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  function addDia() {
    const usados = new Set(form.horarios.map((h) => h.curto));
    const prox = SEMANA.find((d) => !usados.has(d.curto));
    if (!prox) return;
    mutar({ horarios: [...form.horarios, { ...prox, aberto: true, abre: '18:00', fecha: '23:59' }] });
  }
  function removerDia(i) {
    mutar({ horarios: form.horarios.filter((_, idx) => idx !== i) });
  }
  function addLocal() {
    mutar({ locais: [...form.locais, { id: 'l' + Date.now(), nome: 'Novo local', endereco: '', ativo: form.locais.length === 0 }] });
  }
  function removerLocal(id) {
    mutar({ locais: form.locais.filter((l) => l.id !== id) });
  }

  async function salvar() {
    if (salvando || !dirty) return;
    setSalvando(true);
    setAviso(null);
    try {
      const salvo = await api.salvarConfig({
        horarios: form.horarios,
        locais: form.locais,
        telefone: form.telefone || '',
        whatsapp: form.whatsapp || '',
        version: form.version,
      });
      setForm(salvo);
      setDirty(false);
      setAviso({ tipo: 'ok', texto: 'Configuração salva. O app do cliente atualiza em até 1 minuto.' });
    } catch (e) {
      if (e?.codigo === 'CONFLITO_VERSAO') {
        const fresca = await api.lerConfig().catch(() => null);
        if (fresca) { setForm(fresca); setDirty(false); }
        setAviso({ tipo: 'erro', texto: 'Outro operador salvou antes. Recarreguei os dados atuais — reaplique suas mudanças e salve de novo.' });
      } else {
        setAviso({ tipo: 'erro', texto: e?.message || 'Não foi possível salvar.' });
      }
    } finally {
      setSalvando(false);
    }
  }

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' };
  const inputStyle = {
    padding: '9px 12px', borderRadius: '10px', background: 'var(--surface2)',
    border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13.5px', fontWeight: 600,
  };
  const titulo = { fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)', marginBottom: '12px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' }}>
      {/* barra de salvar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: dirty ? 'var(--accent)' : 'var(--muted)' }}>
          {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
        </span>
        <button
          onClick={salvar}
          disabled={!dirty || salvando}
          style={{
            padding: '11px 22px', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '14px',
            background: dirty ? 'var(--accent2)' : 'var(--surface2)',
            color: dirty ? '#1a1206' : 'var(--muted)',
          }}
        >
          {salvando ? 'Salvando…' : 'Salvar tudo'}
        </button>
      </div>
      {aviso && (
        <div style={{
          borderRadius: '12px', padding: '11px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--fg)',
          background: aviso.tipo === 'ok' ? 'color-mix(in srgb, var(--accent2) 14%, transparent)' : 'color-mix(in srgb, #e23b3b 14%, transparent)',
          border: `1px solid ${aviso.tipo === 'ok' ? 'var(--accent2)' : '#e23b3b'}`,
        }}>
          {aviso.texto}
        </div>
      )}

      {/* horários */}
      <div style={card}>
        <div style={titulo}>Horário de funcionamento</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {form.horarios.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setHorario(i, { aberto: !h.aberto })}
                style={{
                  width: '110px', padding: '9px 0', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '13px',
                  background: h.aberto ? 'color-mix(in srgb, var(--accent2) 16%, transparent)' : 'var(--surface2)',
                  color: h.aberto ? 'var(--accent2)' : 'var(--muted)',
                }}
              >
                {h.dia.split('-')[0]}
              </button>
              {h.aberto ? (
                <>
                  <input type="time" value={h.abre} onChange={(e) => setHorario(i, { abre: e.target.value })} style={inputStyle} />
                  <span style={{ color: 'var(--muted)', fontSize: '12px' }}>às</span>
                  <input type="time" value={h.fecha} onChange={(e) => setHorario(i, { fecha: e.target.value })} style={inputStyle} />
                </>
              ) : (
                <span style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 700 }}>Fechado</span>
              )}
              <span style={{ flex: 1 }} />
              <button onClick={() => removerDia(i)} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: '15px', fontWeight: 800 }} title="Remover dia">×</button>
            </div>
          ))}
        </div>
        {form.horarios.length < 7 && (
          <button onClick={addDia} style={{ marginTop: '10px', padding: '8px 14px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: '12.5px' }}>
            + Adicionar dia
          </button>
        )}
        <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '10px' }}>
          O indicador Aberto/Fechado do app do cliente segue estes horários (fechamento depois da meia-noite é suportado).
        </div>
      </div>

      {/* locais */}
      <div style={card}>
        <div style={titulo}>Locais do trailer</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {form.locais.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setLocal(l.id, { ativo: !l.ativo })}
                title={l.ativo ? 'Local ativo (aparece no app)' : 'Inativo'}
                style={{
                  width: '34px', height: '34px', borderRadius: '10px', border: 'none', fontWeight: 800,
                  background: l.ativo ? 'var(--accent2)' : 'var(--surface2)',
                  color: l.ativo ? '#1a1206' : 'var(--muted)',
                }}
              >
                ✓
              </button>
              <input value={l.nome} onChange={(e) => setLocal(l.id, { nome: e.target.value })} placeholder="Nome" style={{ ...inputStyle, width: '190px' }} />
              <input value={l.endereco} onChange={(e) => setLocal(l.id, { endereco: e.target.value })} placeholder="Endereço" style={{ ...inputStyle, flex: 1, minWidth: '180px' }} />
              <button onClick={() => removerLocal(l.id)} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: '15px', fontWeight: 800 }} title="Remover local">×</button>
            </div>
          ))}
        </div>
        <button onClick={addLocal} style={{ marginTop: '10px', padding: '8px 14px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: '12.5px' }}>
          + Adicionar local
        </button>
        <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '10px' }}>
          O primeiro local ATIVO aparece no mapa da aba Contato do app do cliente.
        </div>
      </div>

      {/* contato */}
      <div style={card}>
        <div style={titulo}>Contato (interno da gestão)</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: '200px' }}>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '5px' }}>TELEFONE</span>
            <input value={form.telefone || ''} onChange={(e) => mutar({ telefone: e.target.value })} placeholder="(81) 3333-0000" style={{ ...inputStyle, width: '100%' }} />
          </label>
          <label style={{ flex: 1, minWidth: '200px' }}>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--muted)', marginBottom: '5px' }}>WHATSAPP</span>
            <input value={form.whatsapp || ''} onChange={(e) => mutar({ whatsapp: e.target.value })} placeholder="(81) 9 9999-0000" style={{ ...inputStyle, width: '100%' }} />
          </label>
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '10px' }}>
          Estes contatos NUNCA saem na borda pública — ficam só na gestão (o app do cliente usa os contatos fixos do próprio app).
        </div>
      </div>
    </div>
  );
}
