import { useMemo, useState } from 'react';
import { useCatalogo } from '../hooks/useCatalogo.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CATS = ['Todos', 'Especiais', 'Balada', 'Aperol', 'Campari', 'Batidinhas', 'Caipirinhas', 'Doses', 'Potes', 'Baldes'];
const CAT_COR = { Especiais: '#f5a623', Balada: '#ff5da2', Aperol: '#ff7a2f', Campari: '#e23b3b', Batidinhas: '#b07be0', Caipirinhas: '#7cc142', Doses: '#4aa8d8', Potes: '#3fcaa8', Baldes: '#e0b341' };
const PAGS = ['Pix', 'Cartão', 'Dinheiro'];

const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const descDe = (p) => p.desc ?? p.descricao ?? '';
const volLabel = (p) => {
  const t = p.tamanhos || [];
  if (!t.length) return '';
  return t.length === 1 ? t[0].rotulo : `${t[0].rotulo}–${t[t.length - 1].rotulo}`;
};
const precoMin = (p) => Math.min(...(p.tamanhos || [{ preco: 0 }]).map((t) => Number(t.preco)));

/**
 * Atendente (PDV) — a tela de VENDA do protótipo: busca + categorias, grade de
 * produtos com foto, modal de tamanho/quantidade, carrinho, pagamento, "pago no
 * ato" e "Gerar senha", terminando na comanda imprimível. Senha/hora/total são
 * SEMPRE do servidor (POST /orders). A fila de preparo/prontas vive no Painel.
 */
export function PDV({ criar }) {
  const { itens: catalogo } = useCatalogo();

  const [cat, setCat] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [cart, setCart] = useState({}); // key "id|rotulo" → {nome, rotulo, preco, qty}
  const [cliente, setCliente] = useState('');
  const [pagamento, setPagamento] = useState('Pix');
  const [pagoNovo, setPagoNovo] = useState(false);
  const [modal, setModal] = useState(null);
  const [modalTam, setModalTam] = useState(0);
  const [modalQty, setModalQty] = useState(1);
  const [gerando, setGerando] = useState(false);
  const [cupom, setCupom] = useState(null);

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

  const cardStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px' };
  const chipBtn = (ativo) => ({
    flex: '0 0 auto', border: '1px solid var(--border)', borderRadius: '11px', padding: '9px 15px',
    fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
    background: ativo ? 'var(--accent)' : 'var(--surface)',
    color: ativo ? 'var(--onAccent)' : 'var(--muted)',
    borderColor: ativo ? 'var(--accent)' : 'var(--border)',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.5fr) minmax(300px, 1fr)', gap: '18px', alignItems: 'start' }}>
      {/* ============ CATÁLOGO ============ */}
      <div style={{ ...cardStyle, padding: '18px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '20px', color: 'var(--fg)', marginBottom: '12px' }}>
          Nova venda
        </div>

        {/* busca */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar bebida…"
            style={{ width: '100%', padding: '12px 40px 12px 14px', borderRadius: '11px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '14px' }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: '18px', fontWeight: 700 }}>×</button>
          )}
        </div>

        {/* chips de categoria */}
        <div className="sd-scroll" style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '14px' }}>
          {CATS.map((c) => (
            <button key={c} onClick={() => { setCat(c); setBusca(''); }} style={chipBtn(cat === c && !busca)}>{c}</button>
          ))}
        </div>

        {/* grade de produtos */}
        <div className="sd-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: '10px', maxHeight: '52vh', overflowY: 'auto' }}>
          {produtos.map((p) => (
            <button
              key={p.id}
              onClick={() => { setModal(p); setModalTam(0); setModalQty(1); }}
              style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '7px' }}
            >
              {p.img ? (
                <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={p.img} alt="" style={{ maxWidth: '100%', maxHeight: '64px', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
                </div>
              ) : (
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: CAT_COR[p.cat] || 'var(--accent)' }} />
              )}
              <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--fg)', lineHeight: 1.22 }}>{p.nome}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{volLabel(p)}</div>
              <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '15px', color: CAT_COR[p.cat] || 'var(--accent)' }}>
                {p.tamanhos && p.tamanhos.length > 1 && <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>a partir de</span>}
                {brl(precoMin(p))}
              </div>
            </button>
          ))}
          {!produtos.length && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '30px 0' }}>
              Nenhuma bebida encontrada.
            </div>
          )}
        </div>
      </div>

      {/* ============ CARRINHO / CHECKOUT ============ */}
      <div style={{ ...cardStyle, padding: '18px', position: 'sticky', top: '90px' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '18px', color: 'var(--fg)', marginBottom: '12px' }}>
          Comanda
        </div>

        {cartItens.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
            Toque numa bebida para adicionar.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
              {cartItens.map(([key, c]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.rotulo} · {brl(c.preco)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button onClick={() => setCart((cc) => { const v = cc[key].qty - 1; const n = { ...cc }; if (v <= 0) delete n[key]; else n[key] = { ...cc[key], qty: v }; return n; })} style={qtyBtn}>−</button>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--fg)', minWidth: '18px', textAlign: 'center' }}>{c.qty}</span>
                    <button onClick={() => setCart((cc) => ({ ...cc, [key]: { ...cc[key], qty: cc[key].qty + 1 } }))} style={qtyBtn}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* cliente */}
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              style={{ width: '100%', padding: '11px 13px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px', marginBottom: '10px' }}
            />

            {/* pagamento — pills segmentadas */}
            <div style={{ display: 'flex', gap: '7px', marginBottom: '10px' }}>
              {PAGS.map((p) => {
                const sel = pagamento === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPagamento(p)}
                    style={{
                      flex: 1, borderRadius: '10px', padding: '10px 4px', fontSize: '12.5px', fontWeight: 600,
                      border: '1px solid ' + (sel ? 'var(--fg)' : 'var(--border)'),
                      background: sel ? 'var(--fg)' : 'var(--bg)',
                      color: sel ? 'var(--bg)' : 'var(--muted)',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {/* pago no ato — pill */}
            <button
              onClick={() => setPagoNovo((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%',
                borderRadius: '10px', padding: '11px 13px', fontSize: '12.5px', fontWeight: 600, marginBottom: '12px',
                border: '1px solid ' + (pagoNovo ? 'color-mix(in srgb,#7cc142 50%,transparent)' : 'var(--border)'),
                background: pagoNovo ? 'color-mix(in srgb,#7cc142 15%,transparent)' : 'var(--bg)',
                color: pagoNovo ? '#a7e76b' : 'var(--muted)',
              }}
            >
              Pago no ato
              <span style={{ fontWeight: 800 }}>{pagoNovo ? '✓ Sim' : 'Não'}</span>
            </button>

            <button
              onClick={gerar}
              disabled={gerando}
              style={{
                width: '100%', border: 'none', borderRadius: '12px', padding: '15px',
                fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15.5px',
                background: 'var(--accent)', color: 'var(--onAccent)',
              }}
            >
              {gerando ? 'Gerando…' : `Gerar senha · ${brl(total)}`}
            </button>
          </>
        )}
      </div>

      {/* ============ MODAL TAMANHO/QTD ============ */}
      {modal && (
        <Overlay onClose={() => setModal(null)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '4px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: CAT_COR[modal.cat] || 'var(--accent)' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>{modal.cat}</span>
          </div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '20px', color: 'var(--fg)', marginBottom: descDe(modal) ? '6px' : '14px' }}>{modal.nome}</div>
          {descDe(modal) && <div style={{ fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '14px' }}>{descDe(modal)}</div>}

          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            {modal.tamanhos.length === 1 ? 'Tamanho' : 'Escolha o tamanho'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {modal.tamanhos.map((t, i) => (
              <button
                key={t.rotulo}
                onClick={() => setModalTam(i)}
                style={{
                  flex: 1, minWidth: '84px', borderRadius: '13px', padding: '13px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  border: '1.5px solid ' + (modalTam === i ? 'var(--accent)' : 'var(--border)'),
                  background: modalTam === i ? 'var(--accent)' : 'var(--bg)',
                  color: modalTam === i ? 'var(--onAccent)' : 'var(--fg)',
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{t.rotulo}</span>
                <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '15px' }}>{brl(t.preco)}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', marginBottom: '16px' }}>
            <button onClick={() => setModalQty((q) => Math.max(1, q - 1))} style={bigQtyBtn}>−</button>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '26px', color: 'var(--fg)', minWidth: '34px', textAlign: 'center' }}>{modalQty}</span>
            <button onClick={() => setModalQty((q) => q + 1)} style={bigQtyBtn}>+</button>
          </div>
          <button onClick={confirmarModal} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '15px' }}>
            Adicionar · {brl((Number(modal.tamanhos[modalTam]?.preco) || 0) * modalQty)}
          </button>
        </Overlay>
      )}

      {/* ============ COMANDA (imprimível) ============ */}
      {cupom && (
        <Overlay onClose={() => setCupom(null)}>
          <div id="cupom-ticket" style={{ background: '#fff', color: '#1a1206', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', letterSpacing: '-.3px' }}>Summer Drinks</div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', color: '#b06a10', marginBottom: '10px' }}>COMANDA</div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '2px', color: '#8a7a5f' }}>SENHA</div>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '58px', lineHeight: 1.05, color: '#1a1206' }}>{cupom.senha}</div>
            <div style={{ fontSize: '12px', color: '#6a5c44', marginBottom: '12px' }}>
              {cupom.hora} · {cupom.pagamento}{cupom.cliente ? ` · ${cupom.cliente}` : ''}
              {cupom.atendente ? ` · atend.: ${cupom.atendente}` : ''}
            </div>
            <div style={{ textAlign: 'left', borderTop: '1px dashed #cbb78f', borderBottom: '1px dashed #cbb78f', padding: '10px 0', margin: '4px 0 10px' }}>
              {cupom.items.map((i, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '3px 0' }}>
                  <span>{i.qty}× {i.nome}</span>
                  <span style={{ fontWeight: 700 }}>{brl(i.preco * i.qty)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px' }}>
              <span>Total</span>
              <span>{brl(cupom.items.reduce((s, i) => s + i.preco * i.qty, 0))}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#8a7a5f', marginTop: '10px' }}>
              {cupom.pago ? 'Pago ✓' : 'A receber na retirada'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '9px', marginTop: '14px' }} className="sd-noprint">
            <button onClick={() => window.print()} style={{ flex: 1, padding: '13px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}>
              Imprimir
            </button>
            <button onClick={() => setCupom(null)} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '14px' }}>
              Nova venda
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const qtyBtn = {
  width: '30px', height: '30px', borderRadius: '9px', border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--fg)', fontSize: '16px', fontWeight: 800,
};
const bigQtyBtn = {
  width: '42px', height: '42px', borderRadius: '12px', border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--fg)', fontSize: '20px', fontWeight: 800,
};

function Overlay({ children, onClose }) {
  return (
    <div
      className="sd-noprint-bg"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
    >
      <div style={{ width: '100%', maxWidth: '400px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
        {children}
      </div>
    </div>
  );
}
