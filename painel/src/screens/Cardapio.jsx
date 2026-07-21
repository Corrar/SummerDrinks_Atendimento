import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useViewport } from '../hooks/useViewport.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CATS = ['Especiais', 'Balada', 'Aperol', 'Campari', 'Batidinhas', 'Caipirinhas', 'Doses', 'Potes', 'Baldes'];
const CAT_COR = { Especiais: '#f5a623', Balada: '#ff5da2', Aperol: '#ff7a2f', Campari: '#e23b3b', Batidinhas: '#b07be0', Caipirinhas: '#7cc142', Doses: '#4aa8d8', Potes: '#3fcaa8', Baldes: '#e0b341' };

const inpBase = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
  color: 'var(--fg)', fontSize: '13.5px', outline: 'none',
};

/**
 * Editar cardápio — CRUD do catálogo em acordeão por categoria (igual ao
 * protótipo). Regras do domínio preservadas:
 *  - `tamanhos` é APPEND-ONLY: adicionar/editar rotulo/preço são seguros; remover
 *    invalidaria referências posicionais já entregues ao app (backend recusa com
 *    409 TAMANHOS_SHRINK) — a UI nem oferece remover.
 *  - Edição usa estado local + Salvar explícito (sem PUT por tecla).
 *  - O /menu público é cacheado 60s: mudanças demoram até 1 min pro cliente.
 */
export function Cardapio({ itens, recarregar }) {
  const { isMobile } = useViewport();
  const [abertos, setAbertos] = useState(() => new Set()); // categorias expandidas
  const [edits, setEdits] = useState({});                  // id → item editado (dirty)
  const [salvando, setSalvando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

  const grupos = useMemo(
    () => CATS.map((c) => ({
      cat: c, cor: CAT_COR[c],
      itens: itens.filter((i) => i.cat === c).slice().sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome)),
    })),
    [itens],
  );

  const itemDe = (id) => edits[id] ?? itens.find((i) => i.id === id);
  const dirty = (id) => !!edits[id];

  function toggleCat(cat) {
    setAbertos((s) => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  }
  function editar(id, patch) {
    setEdits((e) => {
      const base = e[id] ?? itens.find((i) => i.id === id);
      return { ...e, [id]: { ...base, ...patch } };
    });
  }
  function editarTamanho(id, idx, patch) {
    const base = itemDe(id);
    editar(id, { tamanhos: base.tamanhos.map((t, i) => (i === idx ? { ...t, ...patch } : t)) });
  }
  function addTamanho(id) {
    const base = itemDe(id);
    editar(id, { tamanhos: [...base.tamanhos, { rotulo: 'Novo tamanho', preco: 0 }] });
  }
  function descartar(id) {
    setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
  }
  function setImg(id, file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => editar(id, { img: String(r.result) });
    r.readAsDataURL(file);
  }

  async function salvar(id) {
    const item = edits[id];
    if (!item || salvando) return;
    setSalvando(id);
    try {
      await api.salvarItemCatalogo({
        ...item,
        tamanhos: item.tamanhos.map((t) => ({ rotulo: t.rotulo, preco: Number(t.preco) || 0 })),
        ordem: Number(item.ordem) || 0,
      });
      descartar(id);
      await recarregar();
    } catch (e) {
      alert(e?.codigo === 'TAMANHOS_SHRINK'
        ? 'Não é possível remover tamanhos (referências do app do cliente).'
        : e?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(null);
    }
  }

  async function adicionar(cat) {
    const id = 'd' + Date.now();
    const novo = { id, cat, nome: 'Nova bebida', descricao: '', tamanhos: [{ rotulo: 'Copo', preco: 0 }], img: '', ordem: itens.length + 1 };
    setSalvando(id);
    try {
      await api.criarItemCatalogo(novo);
      await recarregar();
      setEdits((e) => ({ ...e, [id]: novo }));
      setAbertos((s) => new Set(s).add(cat));
    } catch (e) {
      alert(e?.message || 'Não foi possível criar.');
    } finally {
      setSalvando(null);
    }
  }

  async function excluir() {
    const item = excluindo;
    setExcluindo(null);
    if (!item) return;
    try {
      await api.excluirItemCatalogo(item.id);
      descartar(item.id);
      await recarregar();
    } catch (e) {
      alert(e?.message || 'Não foi possível excluir.');
    }
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 28px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em', lineHeight: 1 }}>Editar cardápio</div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '6px' }}>{itens.length} drinks · as alterações atualizam o cardápio e o QR dos clientes na hora</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '22px' }}>
        {grupos.map((g) => {
          const aberto = abertos.has(g.cat);
          return (
            <div key={g.cat} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
              <div onClick={() => toggleCat(g.cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '13px', width: '14px', display: 'inline-block', transition: 'transform .15s', transform: aberto ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: g.cor }} />
                  <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '17px', letterSpacing: '-.01em' }}>{g.cat}</span>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--bg)', borderRadius: '999px', padding: '3px 9px', fontWeight: 600 }}>{g.itens.length}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); adicionar(g.cat); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '9px', padding: '8px 13px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>+ Drink</button>
              </div>

              {aberto && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                  {g.itens.length === 0 && (
                    <div style={{ fontSize: '12.5px', color: 'var(--muted)', padding: '14px 2px 2px' }}>Nenhum drink aqui ainda — use “+ Drink”.</div>
                  )}
                  {g.itens.map((original) => {
                    const item = itemDe(original.id);
                    const emEdicao = dirty(original.id);
                    return (
                      <div key={original.id} style={{ background: 'var(--bg)', border: `1px solid ${emEdicao ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '11px', padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '12px' }}>
                        {/* nome + preço (1º tamanho) + excluir */}
                        <div style={{ display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input value={item.nome} onChange={(e) => editar(original.id, { nome: e.target.value })} placeholder="Nome do drink" style={{ ...inpBase, flex: 1, minWidth: '170px', padding: '9px 11px', fontWeight: 600 }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 11px' }}>
                            <span style={{ color: 'var(--muted)', fontSize: '12.5px', fontWeight: 600 }}>R$</span>
                            <input value={item.tamanhos[0]?.preco ?? 0} onChange={(e) => editarTamanho(original.id, 0, { preco: e.target.value.replace(',', '.') })} inputMode="decimal" style={{ width: '64px', background: 'none', border: 'none', padding: '9px 0', color: 'var(--fg)', fontSize: '13.5px', fontWeight: 700, outline: 'none', fontFamily: "'Bricolage Grotesque',sans-serif" }} />
                          </div>
                          <button onClick={() => setExcluindo(original)} title="Excluir" style={{ flex: 'none', width: '38px', height: '38px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: '#e2615a', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>🗑</button>
                        </div>

                        {/* tamanho(s) + categoria */}
                        <div style={{ display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input value={item.tamanhos[0]?.rotulo ?? ''} onChange={(e) => editarTamanho(original.id, 0, { rotulo: e.target.value })} placeholder="Tamanho" style={{ ...inpBase, width: '180px', padding: '8px 11px', fontSize: '12.5px' }} />
                          <select value={item.cat} onChange={(e) => editar(original.id, { cat: e.target.value })} style={{ ...inpBase, padding: '8px 11px', fontSize: '12.5px', cursor: 'pointer' }}>
                            {CATS.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>

                        {/* tamanhos adicionais (append-only) */}
                        {item.tamanhos.slice(1).map((t, i) => (
                          <div key={i + 1} style={{ display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input value={t.rotulo} onChange={(e) => editarTamanho(original.id, i + 1, { rotulo: e.target.value })} placeholder="Tamanho" style={{ ...inpBase, width: '180px', padding: '8px 11px', fontSize: '12.5px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 11px' }}>
                              <span style={{ color: 'var(--muted)', fontSize: '12.5px', fontWeight: 600 }}>R$</span>
                              <input value={t.preco} onChange={(e) => editarTamanho(original.id, i + 1, { preco: e.target.value.replace(',', '.') })} inputMode="decimal" style={{ width: '64px', background: 'none', border: 'none', padding: '9px 0', color: 'var(--fg)', fontSize: '13.5px', fontWeight: 700, outline: 'none', fontFamily: "'Bricolage Grotesque',sans-serif" }} />
                            </div>
                          </div>
                        ))}
                        <button onClick={() => addTamanho(original.id)} style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: '9px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>+ Tamanho</button>

                        {/* descrição */}
                        <textarea value={item.descricao} onChange={(e) => editar(original.id, { descricao: e.target.value })} placeholder="Descrição / ingredientes" rows={2} style={{ ...inpBase, width: '100%', padding: '8px 11px', fontSize: '12px', lineHeight: 1.45, resize: 'vertical', fontFamily: 'inherit' }} />

                        {/* foto */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap', paddingTop: '2px' }}>
                          <div style={{ width: '50px', height: '50px', flex: 'none', borderRadius: '9px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {item.img ? (
                              <img src={item.img} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            ) : (
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M21 16l-5-5L5 20" /></svg>
                            )}
                          </div>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 13px', color: 'var(--fg)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                            {item.img ? 'Trocar foto' : 'Adicionar foto'}
                            <input type="file" accept="image/*" onChange={(e) => setImg(original.id, e.target.files?.[0])} style={{ display: 'none' }} />
                          </label>
                          {item.img && (
                            <button onClick={() => editar(original.id, { img: '' })} style={{ background: 'none', border: 'none', color: '#e2615a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: '6px' }}>Remover foto</button>
                          )}
                        </div>

                        {/* ações (só quando há edição pendente) */}
                        {emEdicao && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
                            <span style={{ flex: 1, fontSize: '12px', color: 'var(--muted)' }}>{item.tamanhos.length > 1 ? 'a partir de ' : ''}{brl(Math.min(...item.tamanhos.map((t) => Number(t.preco) || 0)))}</span>
                            <button onClick={() => descartar(original.id)} style={{ padding: '8px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Descartar</button>
                            <button onClick={() => salvar(original.id)} disabled={salvando === original.id} style={{ padding: '8px 15px', borderRadius: '10px', border: 'none', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>{salvando === original.id ? 'Salvando…' : 'Salvar'}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* modal de exclusão */}
      {excluindo && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setExcluindo(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
        >
          <div style={{ width: '100%', maxWidth: '380px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '8px' }}>
              Excluir “{excluindo.nome}”?
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>
              A bebida some do cardápio do app do cliente em até 1 minuto. Pedidos já feitos não são afetados.
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={() => setExcluindo(null)} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={excluir} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: '#e23b3b', color: '#fff', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
