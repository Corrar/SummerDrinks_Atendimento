import { useMemo, useState } from 'react';
import { useCatalogo } from '../hooks/useCatalogo.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CATS = ['Todos', 'Especiais', 'Balada', 'Aperol', 'Campari', 'Batidinhas', 'Caipirinhas', 'Doses', 'Potes', 'Baldes'];
const CAT_COR = { Especiais: '#f5a623', Balada: '#ff5da2', Aperol: '#ff7a2f', Campari: '#e23b3b', Batidinhas: '#b07be0', Caipirinhas: '#7cc142', Doses: '#4aa8d8', Potes: '#3fcaa8', Baldes: '#e0b341' };

const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * PDV — nova venda (catálogo → carrinho → gerar comanda) + fila de preparo/prontas.
 * Senha e hora SEMPRE do servidor (POST /orders). Ações da fila: pronto, entrega
 * (com trava de "não pago"), toggle pago.
 */
export function PDV({ orders, criar, marcar, togglePago, entregar }) {
  const { itens: catalogo } = useCatalogo();

  // ---------- nova venda ----------
  const [cat, setCat] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [cart, setCart] = useState({});           // key "id|rotulo" → {nome, rotulo, preco, qty}
  const [cliente, setCliente] = useState('');
  const [pagamento, setPagamento] = useState('Pix');
  const [pagoNovo, setPagoNovo] = useState(false);
  const [modal, setModal] = useState(null);       // item do catálogo em seleção
  const [modalTam, setModalTam] = useState(0);
  const [modalQty, setModalQty] = useState(1);
  const [gerando, setGerando] = useState(false);
  const [cupom, setCupom] = useState(null);       // último pedido gerado (recibo)
  const [entregaConfirm, setEntregaConfirm] = useState(null);

  const produtos = useMemo(() => {
    const termo = norm(busca);
    return termo
      ? catalogo.filter((p) => norm(p.nome).includes(termo) || norm(p.cat).includes(termo))
      : catalogo.filter((p) => cat === 'Todos' || p.cat === cat);
  }, [catalogo, cat, busca]);

  const cartItens = Object.entries(cart);
  const total = cartItens.reduce((s, [, c]) => s + c.preco * c.qty, 0);

  function confirmarModal() {
    if (!modal) return;
    const t = modal.tamanhos[modalTam];
    const key = modal.id + '|' + t.rotulo;
    setCart((c) => ({
      ...c,
      [key]: { nome: modal.nome, rotulo: t.rotulo, preco: Number(t.preco), qty: (c[key]?.qty || 0) + modalQty },
    }));
    setModal(null);
  }

  async function gerar() {
    if (!cartItens.length || gerando) return;
    setGerando(true);
    try {
      const items = cartItens.map(([, c]) => ({ nome: `${c.nome} · ${c.rotulo}`, preco: c.preco, qty: c.qty }));
      const pedido = await criar({ pagamento, cliente, pago: pagoNovo, items });
      setCupom(pedido);
      setCart({});
      setCliente('');
      setPagoNovo(false);
    } catch (e) {
      alert(e?.message || 'Não foi possível gerar a comanda.');
    } finally {
      setGerando(false);
    }
  }

  async function confirmarEntrega(o) {
    if (!o.pago) { setEntregaConfirm(o); return; }
    await entregar(o.senha, false);
  }

  // ---------- fila ----------
  const preparo = orders.filter((o) => o.status === 'preparo');
  const prontas = orders.filter((o) => o.status === 'pronto');

  const cardStyle = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px',
  };
  const btn = (bg, fg = 'var(--onAccent)') => ({
    border: 'none', borderRadius: '10px', padding: '9px 13px', background: bg, color: fg,
    fontWeight: 800, fontSize: '12.5px', fontFamily: 'Hanken Grotesk',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(300px, 1fr)', gap: '18px', alignItems: 'start' }}>
      {/* ============ NOVA VENDA ============ */}
      <div style={{ ...cardStyle, padding: '18px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '20px', color: 'var(--fg)', marginBottom: '12px' }}>
          Nova venda
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar bebida…"
          style={{ width: '100%', padding: '11px 14px', borderRadius: '11px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '14px', marginBottom: '10px' }}
        />

        <div className="sd-scroll" style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '12px' }}>
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); setBusca(''); }}
              style={{
                flex: '0 0 auto', padding: '7px 13px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                border: '1px solid var(--border)',
                background: cat === c && !busca ? 'var(--accent)' : 'var(--surface2)',
                color: cat === c && !busca ? 'var(--onAccent)' : 'var(--muted)',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="sd-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '9px', maxHeight: '46vh', overflowY: 'auto' }}>
          {produtos.map((p) => (
            <button
              key={p.id}
              onClick={() => { setModal(p); setModalTam(0); setModalQty(1); }}
              style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '13px', padding: '12px' }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CAT_COR[p.cat] || 'var(--accent)', marginBottom: '8px' }} />
              <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--fg)', lineHeight: 1.25 }}>{p.nome}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                {p.tamanhos.length > 1 ? 'a partir de ' : ''}{brl(Math.min(...p.tamanhos.map((t) => Number(t.preco))))}
              </div>
            </button>
          ))}
          {!produtos.length && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '30px 0' }}>
              Nenhuma bebida encontrada.
            </div>
          )}
        </div>

        {/* carrinho */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '14px', paddingTop: '12px' }}>
          {cartItens.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '6px 0' }}>
              Toque numa bebida para adicionar.
            </div>
          ) : (
            <>
              {cartItens.map(([key, c]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nome} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· {c.rotulo}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <button onClick={() => setCart((cc) => { const v = cc[key].qty - 1; const n = { ...cc }; if (v <= 0) delete n[key]; else n[key] = { ...cc[key], qty: v }; return n; })} style={btn('var(--surface2)', 'var(--fg)')}>−</button>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--fg)', minWidth: '18px', textAlign: 'center' }}>{c.qty}</span>
                    <button onClick={() => setCart((cc) => ({ ...cc, [key]: { ...cc[key], qty: cc[key].qty + 1 } }))} style={btn('var(--surface2)', 'var(--fg)')}>+</button>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--fg)', minWidth: '76px', textAlign: 'right' }}>{brl(c.preco * c.qty)}</div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '9px', marginTop: '10px' }}>
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  placeholder="Nome do cliente (opcional)"
                  style={{ flex: 1, padding: '10px 13px', borderRadius: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px' }}
                />
                <select
                  value={pagamento}
                  onChange={(e) => setPagamento(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px', fontWeight: 700 }}
                >
                  <option>Pix</option>
                  <option>Dinheiro</option>
                  <option>Cartão</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={pagoNovo} onChange={() => setPagoNovo((v) => !v)} />
                Pago no ato
              </label>

              <button
                onClick={gerar}
                disabled={gerando}
                style={{ ...btn('var(--accent)'), width: '100%', marginTop: '12px', padding: '14px', fontSize: '15px' }}
              >
                {gerando ? 'Gerando…' : `Gerar comanda · ${brl(total)}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ============ FILA ============ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)' }}>Em preparo</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)' }}>{preparo.length}</span>
          </div>
          {preparo.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Nada em preparo.</div>}
          {preparo.map((o) => (
            <FilaCard key={o.senha} o={o} acoes={
              <>
                <button onClick={() => marcar(o.senha, 'pronto')} style={btn('var(--accent2)', '#1a1206')}>Pronto</button>
                <button onClick={() => togglePago(o.senha)} style={btn(o.pago ? 'var(--surface2)' : '#e23b3b', o.pago ? 'var(--fg)' : '#fff')}>
                  {o.pago ? 'Pago ✓' : 'Não pago'}
                </button>
              </>
            } />
          ))}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)' }}>Prontas p/ retirada</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent2)' }}>{prontas.length}</span>
          </div>
          {prontas.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Nenhuma comanda pronta.</div>}
          {prontas.map((o) => (
            <FilaCard key={o.senha} o={o} acoes={
              <>
                <button onClick={() => confirmarEntrega(o)} style={btn('var(--accent)')}>Entregar</button>
                <button onClick={() => togglePago(o.senha)} style={btn(o.pago ? 'var(--surface2)' : '#e23b3b', o.pago ? 'var(--fg)' : '#fff')}>
                  {o.pago ? 'Pago ✓' : 'Não pago'}
                </button>
              </>
            } />
          ))}
        </div>
      </div>

      {/* ============ MODAL TAMANHO/QTD ============ */}
      {modal && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '4px' }}>{modal.nome}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>{modal.cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
            {modal.tamanhos.map((t, i) => (
              <button
                key={t.rotulo}
                onClick={() => setModalTam(i)}
                style={{
                  display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '11px',
                  border: `1px solid ${modalTam === i ? 'var(--accent)' : 'var(--border)'}`,
                  background: modalTam === i ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface2)',
                  color: 'var(--fg)', fontWeight: 700, fontSize: '14px',
                }}
              >
                <span>{t.rotulo}</span>
                <span>{brl(t.preco)}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
            <button onClick={() => setModalQty((q) => Math.max(1, q - 1))} style={{ width: '40px', height: '40px', borderRadius: '11px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', fontSize: '19px', fontWeight: 800 }}>−</button>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '24px', color: 'var(--fg)', minWidth: '34px', textAlign: 'center' }}>{modalQty}</span>
            <button onClick={() => setModalQty((q) => q + 1)} style={{ width: '40px', height: '40px', borderRadius: '11px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', fontSize: '19px', fontWeight: 800 }}>+</button>
          </div>
          <button onClick={confirmarModal} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '15px' }}>
            Adicionar · {brl((Number(modal.tamanhos[modalTam]?.preco) || 0) * modalQty)}
          </button>
        </Overlay>
      )}

      {/* ============ MODAL ENTREGA NÃO PAGA ============ */}
      {entregaConfirm && (
        <Overlay onClose={() => setEntregaConfirm(null)}>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '8px' }}>
            Comanda {entregaConfirm.senha} não está paga
          </div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>
            Total {brl(entregaConfirm.items.reduce((s, i) => s + i.preco * i.qty, 0))} · {entregaConfirm.pagamento}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <button
              onClick={async () => { const s = entregaConfirm.senha; setEntregaConfirm(null); await entregar(s, true); }}
              style={{ padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '14px' }}
            >
              Receber agora e entregar
            </button>
            <button
              onClick={async () => { const s = entregaConfirm.senha; setEntregaConfirm(null); await entregar(s, false); }}
              style={{ padding: '13px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}
            >
              Entregar mesmo assim
            </button>
          </div>
        </Overlay>
      )}

      {/* ============ CUPOM (última comanda) ============ */}
      {cupom && (
        <Overlay onClose={() => setCupom(null)}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', color: 'var(--muted)' }}>SENHA</div>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '64px', lineHeight: 1.1, color: 'var(--accent)' }}>{cupom.senha}</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              {cupom.hora} · {cupom.pagamento}{cupom.cliente ? ` · ${cupom.cliente}` : ''}
            </div>
            <div style={{ textAlign: 'left', background: 'var(--surface2)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px' }}>
              {cupom.items.map((i, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--fg)', padding: '3px 0' }}>
                  <span>{i.qty}× {i.nome}</span>
                  <span style={{ fontWeight: 700 }}>{brl(i.preco * i.qty)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '15px', color: 'var(--fg)', borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px' }}>
                <span>Total</span>
                <span>{brl(cupom.items.reduce((s, i) => s + i.preco * i.qty, 0))}</span>
              </div>
            </div>
            <button onClick={() => setCupom(null)} style={{ width: '100%', padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '14px' }}>
              Nova venda
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function FilaCard({ o, acoes }) {
  const total = o.items.reduce((s, i) => s + i.preco * i.qty, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '24px', color: 'var(--fg)', minWidth: '48px' }}>{o.senha}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {o.items.reduce((s, i) => s + i.qty, 0)} un · {o.items[0]?.nome}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)', marginTop: '2px' }}>
          {brl(total)} · {o.pagamento} · {o.hora}{o.cliente ? ` · ${o.cliente}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '7px', flex: '0 0 auto' }}>{acoes}</div>
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
    >
      <div style={{ width: '100%', maxWidth: '400px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
        {children}
      </div>
    </div>
  );
}
