import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CATS = ['Especiais', 'Balada', 'Aperol', 'Campari', 'Batidinhas', 'Caipirinhas', 'Doses', 'Potes', 'Baldes'];
const CAT_COR = { Especiais: '#f5a623', Balada: '#ff5da2', Aperol: '#ff7a2f', Campari: '#e23b3b', Batidinhas: '#b07be0', Caipirinhas: '#7cc142', Doses: '#4aa8d8', Potes: '#3fcaa8', Baldes: '#e0b341' };

/**
 * Cardápio — CRUD do catálogo. Regras herdadas do domínio:
 *  - `tamanhos` é APPEND-ONLY: adicionar e editar rotulo/preço são seguros;
 *    remover invalidaria referências posicionais já entregues ao app do
 *    cliente (o backend recusa com 409 TAMANHOS_SHRINK) — a UI nem oferece.
 *  - Edição usa estado local + botão Salvar explícito (nada de PUT por tecla).
 *  - O /menu público é cacheado 60s: mudanças demoram até 1 min pro cliente.
 */
export function Cardapio({ itens, recarregar }) {
  const [filtro, setFiltro] = useState('Todos');
  const [edits, setEdits] = useState({});          // id → item editado (dirty)
  const [salvando, setSalvando] = useState(null);  // id em request
  const [excluindo, setExcluindo] = useState(null);// item no modal de exclusão

  const lista = useMemo(() => {
    const l = filtro === 'Todos' ? itens : itens.filter((i) => i.cat === filtro);
    return l.slice().sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome));
  }, [itens, filtro]);

  const itemDe = (id) => edits[id] ?? itens.find((i) => i.id === id);
  const dirty = (id) => !!edits[id];

  function editar(id, patch) {
    setEdits((e) => {
      const base = e[id] ?? itens.find((i) => i.id === id);
      return { ...e, [id]: { ...base, ...patch } };
    });
  }
  function editarTamanho(id, idx, patch) {
    const base = itemDe(id);
    const tamanhos = base.tamanhos.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    editar(id, { tamanhos });
  }
  function addTamanho(id) {
    const base = itemDe(id);
    editar(id, { tamanhos: [...base.tamanhos, { rotulo: 'Novo tamanho', preco: 0 }] });
  }
  function descartar(id) {
    setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
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
    const novo = {
      id, cat: cat === 'Todos' ? 'Especiais' : cat, nome: 'Nova bebida', descricao: '',
      tamanhos: [{ rotulo: 'Copo', preco: 0 }], img: '', ordem: itens.length + 1,
    };
    setSalvando(id);
    try {
      await api.criarItemCatalogo(novo);
      await recarregar();
      setEdits((e) => ({ ...e, [id]: novo }));   // abre já em edição
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

  const chip = (ativo, cor) => ({
    padding: '7px 13px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
    border: '1px solid var(--border)',
    background: ativo ? (cor || 'var(--accent)') : 'var(--surface2)',
    color: ativo ? '#1a1206' : 'var(--muted)',
  });
  const inputStyle = {
    padding: '9px 12px', borderRadius: '10px', background: 'var(--surface2)',
    border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13.5px', fontWeight: 600,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button onClick={() => setFiltro('Todos')} style={chip(filtro === 'Todos')}>Todos</button>
        {CATS.map((c) => (
          <button key={c} onClick={() => setFiltro(c)} style={chip(filtro === c, CAT_COR[c])}>{c}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => adicionar(filtro)}
          style={{ padding: '9px 16px', borderRadius: '11px', border: 'none', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '13px' }}
        >
          + Adicionar bebida
        </button>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
        Alterações aparecem no app do cliente em até 1 minuto (cache do menu público).
        Tamanhos podem ser adicionados e editados, mas não removidos.
      </div>

      {lista.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
          Nenhuma bebida nesta categoria.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '12px' }}>
        {lista.map((original) => {
          const item = itemDe(original.id);
          const emEdicao = dirty(original.id);
          return (
            <div key={original.id} style={{ background: 'var(--card)', border: `1px solid ${emEdicao ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '16px', padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: CAT_COR[item.cat] || 'var(--accent)', flex: '0 0 auto' }} />
                <input
                  value={item.nome}
                  onChange={(e) => editar(original.id, { nome: e.target.value })}
                  style={{ ...inputStyle, flex: 1, fontWeight: 800, fontSize: '15px', background: emEdicao ? 'var(--surface2)' : 'transparent', border: emEdicao ? inputStyle.border : '1px solid transparent' }}
                />
                <select
                  value={item.cat}
                  onChange={(e) => editar(original.id, { cat: e.target.value })}
                  style={{ ...inputStyle, fontWeight: 700, fontSize: '12px' }}
                >
                  {CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>

              <textarea
                value={item.descricao}
                onChange={(e) => editar(original.id, { descricao: e.target.value })}
                placeholder="Descrição (ingredientes)…"
                rows={2}
                style={{ ...inputStyle, width: '100%', resize: 'none', marginBottom: '10px' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                {item.tamanhos.map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '7px' }}>
                    <input
                      value={t.rotulo}
                      onChange={(e) => editarTamanho(original.id, idx, { rotulo: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      value={t.preco}
                      onChange={(e) => editarTamanho(original.id, idx, { preco: e.target.value.replace(',', '.') })}
                      inputMode="decimal"
                      style={{ ...inputStyle, width: '92px', textAlign: 'right' }}
                    />
                  </div>
                ))}
                <button
                  onClick={() => addTamanho(original.id)}
                  style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: '9px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: '12px' }}
                >
                  + Tamanho
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ flex: 1, fontSize: '12px', color: 'var(--muted)' }}>
                  {item.tamanhos.length > 1 ? 'a partir de ' : ''}{brl(Math.min(...item.tamanhos.map((t) => Number(t.preco) || 0)))}
                </span>
                {emEdicao ? (
                  <>
                    <button onClick={() => descartar(original.id)} style={{ padding: '8px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontWeight: 800, fontSize: '12px' }}>
                      Descartar
                    </button>
                    <button
                      onClick={() => salvar(original.id)}
                      disabled={salvando === original.id}
                      style={{ padding: '8px 15px', borderRadius: '10px', border: 'none', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '12px' }}
                    >
                      {salvando === original.id ? 'Salvando…' : 'Salvar'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setExcluindo(original)} style={{ padding: '8px 13px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: '#e23b3b', fontWeight: 800, fontSize: '12px' }}>
                    Excluir
                  </button>
                )}
              </div>
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
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '8px' }}>
              Excluir “{excluindo.nome}”?
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>
              A bebida some do cardápio do app do cliente em até 1 minuto. Pedidos já feitos não são afetados.
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={() => setExcluindo(null)} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}>
                Cancelar
              </button>
              <button onClick={excluir} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: '#e23b3b', color: '#fff', fontWeight: 800, fontSize: '14px' }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
