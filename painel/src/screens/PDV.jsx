import { useMemo, useState } from 'react';
import { useCatalogo } from '../hooks/useCatalogo.js';
import { useViewport } from '../hooks/useViewport.js';
import { SkelDrinkCard } from '../components/Skeleton.jsx';

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
  const { itens: catalogo, carregando: catLoading } = useCatalogo();
  const { isTablet, isMobile } = useViewport();
  const carregandoCatalogo = catLoading && catalogo.length === 0;

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
  const [sheetAberto, setSheetAberto] = useState(false); // carrinho colapsável (celular/tablet)

  const produtos = useMemo(() => {
    const termo = norm(busca);
    return termo
      ? catalogo.filter((p) => norm(p.nome).includes(termo) || norm(p.cat).includes(termo))
      : catalogo.filter((p) => cat === 'Todos' || p.cat === cat);
  }, [catalogo, cat, busca]);

  const cartItens = Object.entries(cart);
  const total = cartItens.reduce((s, [, c]) => s + c.preco * c.qty, 0);
  const qtdItens = cartItens.reduce((s, [, c]) => s + c.qty, 0);

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
      setSheetAberto(false);
    } catch (e) {
      alert(e?.message || 'Não foi possível gerar a comanda.');
    } finally {
      setGerando(false);
    }
  }

  const cartHasItems = cartItens.length > 0;
  const chipBase = { border: '1px solid var(--border)', borderRadius: '11px', padding: '9px 15px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap' };
  const pagBase = { flex: 1, borderRadius: '10px', padding: '10px 4px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', transition: 'all .12s' };

  // Conteúdo do carrinho (cabeçalho + cliente + itens + rodapé de checkout).
  // Reaproveitado no <aside> fixo (desktop) e no sheet colapsável (celular/tablet).
  // `emSheet` acrescenta o botão de recolher no cabeçalho.
  const corpoCarrinho = (emSheet) => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '17px' }}>Pedido atual</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => { setCart({}); setCliente(''); setPagoNovo(false); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline', padding: '4px' }}>limpar</button>
          {emSheet && (
            <button onClick={() => setSheetAberto(false)} title="Recolher" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', width: '30px', height: '30px', borderRadius: '9px', cursor: 'pointer', fontSize: '15px', lineHeight: 1 }}>⌄</button>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <input
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          placeholder="Nome do cliente (opcional)"
          style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 12px', color: 'var(--fg)', fontSize: '13.5px', outline: 'none' }}
        />
      </div>

      <div className="sd-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '9px', minHeight: '120px' }}>
        {!cartHasItems ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--fg)' }}>Carrinho vazio</div>
            <div style={{ fontSize: '12.5px', maxWidth: '200px' }}>Toque nas bebidas ao lado para montar o pedido</div>
          </div>
        ) : (
          cartItens.map(([key, c]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '13.5px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{c.rotulo} · {brl(c.preco)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '9px' }}>
                <button onClick={() => setCart((cc) => { const v = cc[key].qty - 1; const n = { ...cc }; if (v <= 0) delete n[key]; else n[key] = { ...cc[key], qty: v }; return n; })} style={{ width: '28px', height: '30px', background: 'none', border: 'none', color: 'var(--fg)', fontSize: '17px', cursor: 'pointer', lineHeight: 1 }}>–</button>
                <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 700, fontSize: '13.5px', fontFamily: "'Bricolage Grotesque',sans-serif" }}>{c.qty}</span>
                <button onClick={() => setCart((cc) => ({ ...cc, [key]: { ...cc[key], qty: cc[key].qty + 1 } }))} style={{ width: '28px', height: '30px', background: 'none', border: 'none', color: 'var(--fg)', fontSize: '17px', cursor: 'pointer', lineHeight: 1 }}>+</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '13px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Total</span>
          <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em' }}>{brl(total)}</span>
        </div>
        <div style={{ display: 'flex', gap: '7px' }}>
          {PAGS.map((p) => {
            const sel = pagamento === p;
            return (
              <button
                key={p}
                onClick={() => setPagamento(p)}
                style={{ ...pagBase, ...(sel ? { background: 'var(--fg)', color: 'var(--bg)', borderColor: 'var(--fg)' } : { background: 'var(--bg)', color: 'var(--muted)' }) }}
              >
                {p}
              </button>
            );
          })}
        </div>
        <div
          onClick={() => setPagoNovo((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer',
            borderRadius: '10px', padding: '10px 13px', fontSize: '12.5px', fontWeight: 600, transition: 'all .12s',
            border: '1px solid ' + (pagoNovo ? 'color-mix(in srgb,#7cc142 50%,transparent)' : 'var(--border)'),
            background: pagoNovo ? 'color-mix(in srgb,#7cc142 15%,transparent)' : 'var(--bg)',
            color: pagoNovo ? '#a7e76b' : 'var(--muted)',
          }}
        >
          <span>Pagamento já recebido</span>
          <span style={{ fontWeight: 700 }}>{pagoNovo ? '✓ Sim' : 'Não'}</span>
        </div>
        <button
          onClick={gerar}
          disabled={!cartHasItems || gerando}
          style={{
            width: '100%', border: 'none', borderRadius: '12px', padding: '15px',
            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15.5px', transition: 'all .12s',
            cursor: cartHasItems ? 'pointer' : 'not-allowed',
            background: cartHasItems ? 'var(--accent)' : 'var(--surface2)',
            color: cartHasItems ? 'var(--onAccent)' : 'var(--muted)',
          }}
        >
          {gerando ? 'Gerando…' : cartHasItems ? `Gerar senha · ${brl(total)}` : 'Adicione itens'}
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : 'minmax(0,1fr) 392px', gap: isMobile ? '16px' : '22px', padding: isMobile ? '16px' : '24px 28px', alignItems: 'start' }}>
      {/* ============ CATÁLOGO ============ */}
      <section>
        {/* busca */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '17px', pointerEvents: 'none' }}>⌕</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="BUSCAR BEBIDA..."
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '13px', padding: '13px 44px', color: 'var(--fg)', fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', outline: 'none' }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* chips de categoria */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
          {CATS.map((c) => {
            const ativo = cat === c && !busca;
            return (
              <button
                key={c}
                onClick={() => { setCat(c); setBusca(''); }}
                style={{ ...chipBase, ...(ativo ? { background: 'var(--accent)', color: 'var(--onAccent)', borderColor: 'var(--accent)' } : { background: 'var(--surface)', color: 'var(--muted)' }) }}
              >
                {c}
              </button>
            );
          })}
        </div>

        {!carregandoCatalogo && !produtos.length && (
          <div style={{ padding: '50px 10px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--fg)' }}>Nenhuma bebida encontrada</div>
            <div style={{ fontSize: '13px', marginTop: '5px' }}>Tente outro termo de busca</div>
          </div>
        )}

        {/* grade de produtos (cards um pouco maiores; borda destaca no hover) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px' }}>
          {carregandoCatalogo && Array.from({ length: 8 }).map((_, i) => <SkelDrinkCard key={`sk${i}`} />)}
          {produtos.map((p) => (
            <button
              key={p.id}
              className="sd-drink-card"
              onClick={() => { setModal(p); setModalTam(0); setModalQty(1); }}
              style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px', cursor: 'pointer', color: 'inherit' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ width: '13px', height: '13px', borderRadius: '50%', flex: 'none', marginTop: '3px', background: CAT_COR[p.cat] || 'var(--accent)' }} />
                <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right' }}>{volLabel(p)}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '18.5px', lineHeight: 1.22, letterSpacing: '.01em', textTransform: 'uppercase', minHeight: '66px' }}>{p.nome}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', height: '14px' }}>{p.tamanhos && p.tamanhos.length > 1 ? 'a partir de' : ''}</span>
                  <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '24px', letterSpacing: '-.02em' }}>{brl(precoMin(p))}</span>
                </div>
                {p.img && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', minWidth: 0 }}>
                    <img src={p.img} alt="" style={{ maxWidth: '100%', maxHeight: '64px', objectFit: 'contain', display: 'block' }} />
                  </div>
                )}
                <span style={{ width: '40px', height: '40px', flex: 'none', borderRadius: '11px', background: 'var(--accent)', color: 'var(--onAccent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 700, lineHeight: 1 }}>+</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ============ PEDIDO ATUAL (carrinho/checkout) ============ */}
      {/* Desktop: painel fixo à direita. */}
      {!isTablet && (
        <aside style={{ position: 'sticky', top: '90px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 112px)' }}>
          {corpoCarrinho(false)}
        </aside>
      )}

      {/* Celular/tablet: barra colapsável no rodapé + sheet que sobe. */}
      {isTablet && cartHasItems && !sheetAberto && (
        <button
          onClick={() => setSheetAberto(true)}
          style={{
            position: 'fixed', left: '10px', right: '10px', bottom: isMobile ? '96px' : '14px', zIndex: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            background: 'var(--accent)', color: 'var(--onAccent)', border: 'none', borderRadius: '18px',
            padding: '13px 18px', boxShadow: '0 10px 30px rgba(0,0,0,.32)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .85 }}>{qtdItens} {qtdItens === 1 ? 'item' : 'itens'} · Total</span>
            <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '22px', letterSpacing: '-.02em' }}>{brl(total)}</span>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 800, fontSize: '14.5px', fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            Ver carrinho
            <span style={{ fontSize: '13px' }}>▲</span>
          </span>
        </button>
      )}

      {isTablet && sheetAberto && (
        <>
          <div onClick={() => setSheetAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 38, animation: 'sd-cover .2s ease-out both' }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 39, maxHeight: '88vh', background: 'var(--surface)', borderTopLeftRadius: '22px', borderTopRightRadius: '22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '0 -20px 50px rgba(0,0,0,.4)', animation: 'sd-sheetup .3s cubic-bezier(.22,1,.36,1) both', paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }}>
            <div onClick={() => setSheetAberto(false)} style={{ padding: '8px 0 2px', cursor: 'pointer' }}>
              <div style={{ width: '44px', height: '5px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto' }} />
            </div>
            {corpoCarrinho(true)}
          </div>
        </>
      )}

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
          <div id="cupom-ticket" style={{ background: '#fff', color: '#1a1206', borderRadius: '18px', padding: '28px 26px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '22px', letterSpacing: '-.3px' }}>Summer Drinks</div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '2.5px', color: '#9a8a70', textTransform: 'uppercase' }}>Comprovante de pedido</div>

            <div style={{ borderTop: '1px dashed #cbb78f', margin: '16px 0' }} />

            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '3px', color: '#9a8a70' }}>SUA SENHA</div>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '66px', lineHeight: 1.05, color: '#1a1206', letterSpacing: '-.02em' }}>{String(cupom.senha).padStart(3, '0')}</div>

            <div style={{ borderTop: '1px dashed #cbb78f', margin: '16px 0' }} />

            <div style={{ textAlign: 'left' }}>
              {cupom.items.map((i, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px', padding: '3px 0', color: '#4a4032' }}>
                  <span>{i.qty}× {i.nome}</span>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(i.preco * i.qty)}</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px dashed #cbb78f', margin: '16px 0' }} />

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '1px', color: '#9a8a70' }}>TOTAL</span>
              <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '26px', letterSpacing: '-.02em' }}>{brl(cupom.items.reduce((s, i) => s + i.preco * i.qty, 0))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#6a5c44', marginTop: '5px' }}>
              <span>{cupom.pagamento}{cupom.pago ? ' · Pago' : ''}</span>
              <span>{cupom.hora}</span>
            </div>
            {(cupom.cliente || cupom.atendente) && (
              <div style={{ fontSize: '12px', color: '#9a8a70', marginTop: '8px', textAlign: 'left' }}>
                {cupom.cliente ? `Cliente: ${cupom.cliente}` : `Atendido por ${cupom.atendente}`}
              </div>
            )}

            <div style={{ borderTop: '1px dashed #cbb78f', margin: '16px 0' }} />

            <div style={{ fontSize: '12.5px', color: '#9a8a70', lineHeight: 1.55 }}>
              Aguarde sua senha no painel.<br />Obrigado pela preferência! 🥂
            </div>
          </div>
          <div style={{ display: 'flex', gap: '9px', marginTop: '14px' }} className="sd-noprint">
            <button onClick={() => window.print()} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '14px' }}>
              Imprimir cupom
            </button>
            <button onClick={() => setCupom(null)} style={{ flex: 1, padding: '13px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}>
              Novo pedido
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

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
