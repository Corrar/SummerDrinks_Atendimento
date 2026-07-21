import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useViewport } from '../hooks/useViewport.js';
import { Skel } from '../components/Skeleton.jsx';

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
 * O que sai na borda pública: horarios+locais (Aberto/Fechado e endereço) e o
 * contato COMERCIAL (telefone/whatsapp/email/instagram) — a aba Contato do app
 * do cliente exibe estes canais. Preencha com os dados públicos do bar.
 */
export function Config({ ativo }) {
  const { isMobile } = useViewport();
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
    return (
      <div style={{ padding: isMobile ? '16px' : '24px 28px', maxWidth: '980px', margin: '0 auto' }}>
        <Skel w="200px" h={30} style={{ marginBottom: '8px' }} />
        <Skel w="320px" h={14} style={{ marginBottom: '22px' }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px 22px', marginBottom: '16px' }}>
            <Skel w="180px" h={16} style={{ marginBottom: '16px' }} />
            <Skel w="100%" h={42} style={{ marginBottom: '11px' }} />
            <Skel w="100%" h={42} />
          </div>
        ))}
      </div>
    );
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
  const ce = () => form.cardapiosEvento || [];
  function addCardapioEvento() {
    mutar({ cardapiosEvento: [...ce(), { id: 'ce' + Date.now(), nome: 'Novo cardápio', itens: '' }] });
  }
  const setCardapioEvento = (id, patch) => mutar({ cardapiosEvento: ce().map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  function removerCardapioEvento(id) {
    mutar({ cardapiosEvento: ce().filter((c) => c.id !== id) });
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
        email: form.email || '',
        instagram: form.instagram || '',
        cardapiosEvento: form.cardapiosEvento || [],
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

  const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px 22px', marginBottom: '16px' };
  const secTitulo = { fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '16px', marginBottom: '4px' };
  const secDesc = { fontSize: '12.5px', color: 'var(--muted)', marginBottom: '16px' };
  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', color: 'var(--fg)', fontSize: '13.5px', outline: 'none' };
  const addBtn = { display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '9px', padding: '8px 13px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' };
  const pill = (on) => ({ cursor: 'pointer', border: on ? 'none' : '1px solid var(--border)', fontSize: '11px', fontWeight: 700, padding: '6px 13px', borderRadius: '999px', whiteSpace: 'nowrap', transition: 'all .12s', ...(on ? { background: 'color-mix(in srgb,#7cc142 20%,transparent)', color: '#a7e76b' } : { background: 'var(--bg)', color: 'var(--muted)' }) });
  const lixo = { flex: 'none', width: '38px', height: '38px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)', color: '#e2615a', fontSize: '15px', cursor: 'pointer', lineHeight: 1 };

  const nDiasAbertos = form.horarios.filter((d) => d.aberto).length;
  const nLocaisAtivos = form.locais.filter((l) => l.ativo).length;

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 28px', maxWidth: '980px', margin: '0 auto', position: 'relative' }}>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em', lineHeight: 1 }}>Ajustes</div>
        <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '6px' }}>{nDiasAbertos} dias de atendimento · {nLocaisAtivos} locais ativos</div>
      </div>

      {aviso && (
        <div style={{
          borderRadius: '12px', padding: '11px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '16px',
          background: aviso.tipo === 'ok' ? 'color-mix(in srgb, var(--accent2) 14%, transparent)' : 'color-mix(in srgb, #e23b3b 14%, transparent)',
          border: `1px solid ${aviso.tipo === 'ok' ? 'var(--accent2)' : '#e23b3b'}`,
        }}>{aviso.texto}</div>
      )}

      {/* HORÁRIO */}
      <div style={panel}>
        <div style={secTitulo}>Horário de atendimento</div>
        <div style={secDesc}>Defina os dias e horários em que o trailer atende.</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {form.horarios.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '14px', padding: '11px 0', borderTop: '1px solid color-mix(in srgb,var(--border) 60%,transparent)', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <span style={{ width: isMobile ? '84px' : '130px', flex: 'none', fontWeight: 600, fontSize: '13.5px' }}>{h.dia}</span>
              <button onClick={() => setHorario(i, { aberto: !h.aberto })} style={pill(h.aberto)}>{h.aberto ? 'Aberto' : 'Fechado'}</button>
              {h.aberto && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginLeft: isMobile ? 0 : 'auto' }}>
                  <input type="time" value={h.abre} onChange={(e) => setHorario(i, { abre: e.target.value })} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 11px', color: 'var(--fg)', fontSize: '13.5px', fontWeight: 600, outline: 'none', fontFamily: "'Bricolage Grotesque',sans-serif" }} />
                  <span style={{ color: 'var(--muted)', fontSize: '13px' }}>até</span>
                  <input type="time" value={h.fecha} onChange={(e) => setHorario(i, { fecha: e.target.value })} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 11px', color: 'var(--fg)', fontSize: '13.5px', fontWeight: 600, outline: 'none', fontFamily: "'Bricolage Grotesque',sans-serif" }} />
                </div>
              )}
              <button onClick={() => removerDia(i)} title="Remover dia" style={{ marginLeft: h.aberto ? 0 : 'auto', border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: '16px', fontWeight: 800, cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
        {form.horarios.length < 7 && (
          <button onClick={addDia} style={{ marginTop: '12px', padding: '8px 14px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>+ Adicionar dia</button>
        )}
      </div>

      {/* LOCAIS */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
          <div style={secTitulo}>Locais de atendimento</div>
          <button onClick={addLocal} style={addBtn}>+ Local</button>
        </div>
        <div style={secDesc}>Pontos onde o trailer costuma atender.</div>
        {form.locais.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '14px 0' }}>Nenhum local cadastrado. Toque em “+ Local”.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          {form.locais.map((l) => (
            <div key={l.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <input value={l.nome} onChange={(e) => setLocal(l.id, { nome: e.target.value })} placeholder="Nome do local" style={{ ...inp, flex: 1, minWidth: 0, fontWeight: 600 }} />
                <button onClick={() => setLocal(l.id, { ativo: !l.ativo })} style={pill(l.ativo)}>{l.ativo ? 'Ativo' : 'Inativo'}</button>
                <button onClick={() => removerLocal(l.id)} title="Excluir" style={lixo}>🗑</button>
              </div>
              <input value={l.endereco} onChange={(e) => setLocal(l.id, { endereco: e.target.value })} placeholder="Endereço / referência" style={{ ...inp, fontSize: '13px' }} />
            </div>
          ))}
        </div>
      </div>

      {/* CARDÁPIOS DE EVENTO */}
      <div style={panel}>
        <div style={secTitulo}>Cardápios de evento — mais utilizados</div>
        <div style={secDesc}>Cardápios oferecidos como atalho quando o cliente solicita um evento.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          {ce().map((c) => (
            <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent)', fontSize: '15px' }}>★</span>
                <input value={c.nome} onChange={(e) => setCardapioEvento(c.id, { nome: e.target.value })} placeholder="Nome do cardápio" style={{ ...inp, flex: 1, minWidth: 0, fontWeight: 600 }} />
                <button onClick={() => removerCardapioEvento(c.id)} title="Remover" style={{ ...lixo, width: '32px', height: '32px', fontSize: '13px' }}>🗑</button>
              </div>
              <textarea value={c.itens} onChange={(e) => setCardapioEvento(c.id, { itens: e.target.value })} rows={2} placeholder="Drinks incluídos..." style={{ ...inp, fontSize: '13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
            </div>
          ))}
        </div>
        <button onClick={addCardapioEvento} style={{ marginTop: '12px', padding: '8px 14px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>+ Adicionar cardápio</button>
      </div>

      {/* USUÁRIOS */}
      <div style={panel}><Usuarios /></div>

      {/* CONTATO */}
      <div style={{ ...panel, marginBottom: dirty ? '80px' : '16px' }}>
        <div style={secTitulo}>Contato</div>
        <div style={secDesc}>Canais usados para contato e pedidos (aparecem na aba Contato do app do cliente).</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
          <CampoContato rotulo="Telefone para contato" icone="☎" corIcone="var(--muted)" valor={form.telefone || ''} onChange={(v) => mutar({ telefone: v })} placeholder="(31) 0000-0000" />
          <CampoContato rotulo="WhatsApp" icone="✆" corIcone="#25d366" borda="color-mix(in srgb,#25d366 32%,var(--border))" valor={form.whatsapp || ''} onChange={(v) => mutar({ whatsapp: v })} placeholder="(31) 90000-0000" />
          <CampoContato rotulo="E-mail" icone="✉" corIcone="var(--muted)" valor={form.email || ''} onChange={(v) => mutar({ email: v })} placeholder="contato@summerdrinks.com.br" />
          <CampoContato rotulo="Instagram" icone="@" corIcone="var(--muted)" valor={form.instagram || ''} onChange={(v) => mutar({ instagram: v })} placeholder="@summerdrinks" />
        </div>
      </div>

      {/* barra de salvar (fixa, só quando há mudanças) */}
      {dirty && (
        <div style={{ position: 'sticky', bottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: '14px', padding: '12px 16px', boxShadow: '0 10px 30px rgba(0,0,0,.35)' }}>
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>Alterações não salvas</span>
          <button onClick={salvar} disabled={salvando} style={{ padding: '11px 22px', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '14px', background: 'var(--accent2)', color: '#1a1206', cursor: 'pointer' }}>
            {salvando ? 'Salvando…' : 'Salvar tudo'}
          </button>
        </div>
      )}
    </div>
  );
}

function CampoContato({ rotulo, icone, corIcone, borda, valor, onChange, placeholder }) {
  return (
    <div>
      <label style={{ fontSize: '10.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px', display: 'block' }}>{rotulo}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: 'var(--bg)', border: `1px solid ${borda || 'var(--border)'}`, borderRadius: '10px', padding: '0 12px' }}>
        <span style={{ color: corIcone, fontSize: '15px' }}>{icone}</span>
        <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: '12px 0', color: 'var(--fg)', fontSize: '14px', fontWeight: 600, outline: 'none' }} />
      </div>
    </div>
  );
}

const PAPEIS = [
  { valor: 'gestao', label: 'Admin' },
  { valor: 'pdv', label: 'Atendente' },
];

/**
 * Gestão de operadores (gestão-only). Diferente da config, cada ação salva na
 * hora nos endpoints /usuarios (senha vira hash bcrypt no servidor; nunca volta).
 * O backend garante que sempre resta ao menos um admin ativo (409 ULTIMO_ADMIN).
 */
function Usuarios() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);
  const [novo, setNovo] = useState({ login: '', senha: '', papel: 'pdv' });
  const [criando, setCriando] = useState(false);

  async function carregar() {
    try { setLista(await api.listarUsuarios()); setErro(null); }
    catch (e) { setErro(e?.message || 'Falha ao carregar usuários.'); }
  }
  useEffect(() => { carregar(); }, []);

  async function criar() {
    if (!novo.login.trim() || !novo.senha || criando) return;
    setCriando(true);
    try {
      await api.criarUsuario({ login: novo.login.trim(), senha: novo.senha, papel: novo.papel });
      setNovo({ login: '', senha: '', papel: 'pdv' });
      await carregar();
    } catch (e) {
      alert(e?.codigo === 'LOGIN_EM_USO' ? 'Já existe um usuário com este login.' : (e?.message || 'Não foi possível criar.'));
    } finally { setCriando(false); }
  }
  async function acao(fn) {
    try { await fn(); await carregar(); }
    catch (e) { alert(e?.codigo === 'ULTIMO_ADMIN' ? 'Deve restar ao menos um administrador ativo.' : (e?.message || 'Não foi possível salvar.')); }
  }
  async function trocarSenha(u) {
    const s = typeof window !== 'undefined' ? window.prompt(`Nova senha para "${u.login}" (mín. 4):`) : null;
    if (s && s.length >= 4) await acao(() => api.atualizarUsuario(u.id, { senha: s }));
  }

  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', color: 'var(--fg)', fontSize: '13.5px', outline: 'none' };
  const papelPill = (ativo) => ({ cursor: 'pointer', border: ativo ? 'none' : '1px solid var(--border)', fontSize: '11px', fontWeight: 700, padding: '7px 13px', borderRadius: '999px', whiteSpace: 'nowrap', background: ativo ? 'var(--accent)' : 'var(--bg)', color: ativo ? 'var(--onAccent)' : 'var(--muted)' });
  const miniBtn = { border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', borderRadius: '9px', padding: '7px 11px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' };
  const lixo = { flex: 'none', width: '38px', height: '38px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)', color: '#e2615a', fontSize: '15px', cursor: 'pointer', lineHeight: 1 };
  const n = (lista || []).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '16px' }}>Usuários</div>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '16px' }}>
        Contas com acesso ao sistema ({n}). <strong style={{ color: 'var(--fg)' }}>Admin</strong> acessa tudo; <strong style={{ color: 'var(--fg)' }}>Atendente</strong> vê apenas Atendente, Painel e Cardápio.
      </div>
      {erro && <div style={{ fontSize: '12.5px', color: '#ff927d', marginBottom: '10px' }}>{erro}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
        {(lista || []).map((u) => (
          <div key={u.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '13px 14px', display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
            <span style={{ flex: 1.2, minWidth: '120px', fontSize: '14px', fontWeight: 700, color: u.ativo ? 'var(--fg)' : 'var(--muted)' }}>
              {u.login}{!u.ativo && <span style={{ fontSize: '11px', color: 'var(--muted)' }}> · inativo</span>}
            </span>
            <button onClick={() => acao(() => api.atualizarUsuario(u.id, { papel: u.papel === 'gestao' ? 'pdv' : 'gestao' }))} title="Alternar nível de permissão" style={papelPill(u.papel === 'gestao')}>
              {u.papel === 'gestao' ? 'Admin' : 'Atendente'}
            </button>
            <button onClick={() => acao(() => api.atualizarUsuario(u.id, { ativo: !u.ativo }))} style={miniBtn}>{u.ativo ? 'Desativar' : 'Ativar'}</button>
            <button onClick={() => trocarSenha(u)} style={miniBtn}>Senha</button>
            <button onClick={() => acao(() => api.excluirUsuario(u.id))} title="Excluir" style={lixo}>🗑</button>
          </div>
        ))}
        {lista && lista.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Nenhum usuário.</div>}
        {!lista && !erro && <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Carregando…</div>}

        {/* nova conta */}
        <div style={{ background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '13px 14px', display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={novo.login} onChange={(e) => setNovo((x) => ({ ...x, login: e.target.value }))} placeholder="Novo login" autoComplete="off" style={{ ...inp, flex: 1, minWidth: '120px' }} />
          <input value={novo.senha} onChange={(e) => setNovo((x) => ({ ...x, senha: e.target.value }))} placeholder="Senha" type="password" autoComplete="new-password" style={{ ...inp, flex: 1, minWidth: '110px' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            {PAPEIS.map((p) => (
              <button key={p.valor} onClick={() => setNovo((x) => ({ ...x, papel: p.valor }))} style={papelPill(novo.papel === p.valor)}>{p.label}</button>
            ))}
          </div>
          <button onClick={criar} disabled={criando} style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
            {criando ? 'Criando…' : '+ Usuário'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '10px' }}>
        A senha é guardada como hash no servidor (nunca em claro). Sempre resta ao menos um admin ativo.
      </div>
    </>
  );
}
