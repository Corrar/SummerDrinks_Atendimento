import { useRef, useState } from 'react';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad3 = (n) => String(n).padStart(3, '0');
const totalDe = (o) => o.items.reduce((s, i) => s + i.preco * i.qty, 0);
const nUn = (o) => o.items.reduce((s, i) => s + i.qty, 0);
const descDe = (o) => `${nUn(o)} un · ${o.items[0]?.nome || ''}`;
const nItensFmt = (o) => { const n = nUn(o); return n + (n === 1 ? ' item' : ' itens'); };

// Pílula de pago — idêntica ao protótipo (pagoPill/pagoTxt).
const pagoPill = (pago) => ({
  cursor: 'pointer', fontSize: '10.5px', fontWeight: 700, padding: '4px 9px', borderRadius: '999px',
  whiteSpace: 'nowrap', textAlign: 'center', transition: 'all .12s',
  background: pago ? 'color-mix(in srgb,#7cc142 20%,transparent)' : 'color-mix(in srgb,#e23b3b 18%,transparent)',
  color: pago ? '#a7e76b' : '#ff927d',
  border: '1px solid ' + (pago ? 'color-mix(in srgb,#7cc142 48%,transparent)' : 'color-mix(in srgb,#e23b3b 46%,transparent)'),
});
const pagoTxt = (pago) => (pago ? '✓ Pago' : '○ A receber');

/**
 * Painel de senhas — igual ao protótipo: título + legenda, badge "Chamando /
 * Anterior", colunas Em preparo / Pronto (tiles com senha gigante e drag-drop),
 * gaveta lateral de detalhe do pedido e o registro "Comandas atendidas" com
 * filtros e total a receber. Ligado ao backend (marcar / togglePago / entregar /
 * reordenar via PATCH). Entrega de comanda não paga passa por confirmação.
 */
export function Painel({ orders, painel, reordenar, marcar, togglePago, entregar }) {
  const dragSenha = useRef(null);
  const [detalhe, setDetalhe] = useState(null);
  const [entregaConfirm, setEntregaConfirm] = useState(null);
  const [filtroAt, setFiltroAt] = useState('todas');

  const ativos = orders.filter((o) => o.status !== 'entregue');
  const emPreparo = ordenadas(ativos.filter((o) => o.status === 'preparo'), painel.sort);
  const prontos = ordenadas(ativos.filter((o) => o.status === 'pronto'), painel.sort);

  const hist = painel.chamadaHist || [];
  const atualSenha = hist.length ? hist[hist.length - 1] : painel.ultimaChamada ?? null;
  const anteriorSenha = hist.length > 1 ? hist[hist.length - 2] : null;

  const atendidasFull = orders.filter((o) => o.status === 'entregue').sort((a, b) => b.senha - a.senha);
  const nTodas = atendidasFull.length;
  const nPend = atendidasFull.filter((o) => !o.pago).length;
  const nPagas = atendidasFull.filter((o) => o.pago).length;
  const atendidas = atendidasFull.filter((o) => (filtroAt === 'pagas' ? o.pago : filtroAt === 'pendentes' ? !o.pago : true));
  const aReceber = orders.filter((o) => !o.pago).reduce((s, o) => s + totalDe(o), 0);

  const detO = detalhe != null ? ativos.find((o) => o.senha === detalhe) : null;

  function onDrop(target) {
    const from = dragSenha.current;
    dragSenha.current = null;
    if (from == null || from === target) return;
    const arr = (painel.sort || []).filter((x) => x !== from);
    const idx = arr.indexOf(target);
    arr.splice(idx < 0 ? arr.length : idx, 0, from);
    reordenar(arr);
  }

  async function pedirEntrega(o) {
    if (!o.pago) { setEntregaConfirm(o); return; }
    await entregar(o.senha, false);
  }

  const atChip = (key, label, n) => {
    const on = filtroAt === key;
    return (
      <span
        key={key}
        onClick={() => setFiltroAt(key)}
        style={{
          cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, padding: '6px 11px', borderRadius: '8px', transition: 'all .12s', whiteSpace: 'nowrap',
          ...(on ? { background: 'var(--accent)', color: 'var(--onAccent)' } : { background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }),
        }}
      >
        {label} · {n}
      </span>
    );
  };

  return (
    <div style={{ padding: '28px', maxWidth: '1320px', margin: '0 auto' }}>
      {/* cabeçalho: título + legenda + badge de chamada */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em', lineHeight: 1 }}>Painel de senhas</div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '6px' }}>Acompanhe o preparo e a retirada dos pedidos</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '11px', height: '11px', borderRadius: '50%', background: 'var(--accent)' }} /><span style={{ fontSize: '13px', color: 'var(--muted)' }}>Em preparo</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '11px', height: '11px', borderRadius: '50%', background: 'var(--accent2)' }} /><span style={{ fontSize: '13px', color: 'var(--muted)' }}>Pronto p/ retirar</span></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface)', border: '1.5px solid var(--accent2)', borderRadius: '15px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 18px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--accent2)', boxShadow: '0 0 8px var(--accent2)', animation: 'pulseGlow 1.6s ease-in-out infinite', flex: 'none' }} />
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: '.16em', fontWeight: 700 }}>Chamando</div>
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '40px', lineHeight: .95, letterSpacing: '-.03em', color: 'var(--accent2)' }}>{atualSenha != null ? pad3(atualSenha) : '–––'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderLeft: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div>
                <div style={{ fontSize: '10.5px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.16em', fontWeight: 700 }}>Anterior</div>
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '28px', lineHeight: .95, letterSpacing: '-.03em', color: 'var(--muted)' }}>{anteriorSenha != null ? pad3(anteriorSenha) : '–––'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* colunas: em preparo / pronto */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Em preparo */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px', minHeight: '340px' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--accent)', marginBottom: '16px' }}>Em preparo</div>
          {emPreparo.length === 0 && <div style={{ padding: '50px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: '13.5px' }}>Nenhum pedido em preparo</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
            {emPreparo.map((o) => (
              <div
                key={o.senha} draggable
                onDragStart={() => { dragSenha.current = o.senha; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(o.senha)}
                style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '15px', cursor: 'grab' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Senha</span><span style={{ color: 'var(--muted)', fontSize: '15px', lineHeight: 1, letterSpacing: '1px' }}>⠿</span></div>
                <div onClick={() => setDetalhe(o.senha)} title="Ver itens do pedido" style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '46px', lineHeight: 1, letterSpacing: '-.03em', color: 'var(--accent)', cursor: 'pointer' }}>{pad3(o.senha)}</div>
                <div onClick={() => setDetalhe(o.senha)} style={{ margin: '8px 0 11px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>{nItensFmt(o)} · toque para ver</div>
                <button onClick={() => marcar(o.senha, 'pronto')} style={{ width: '100%', background: 'var(--accent2)', color: '#0d1402', border: 'none', borderRadius: '9px', padding: '9px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>Marcar pronto →</button>
              </div>
            ))}
          </div>
        </div>

        {/* Pronto */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--accent2)', borderRadius: '18px', padding: '20px', minHeight: '340px' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--accent2)', marginBottom: '16px' }}>Pronto — pode retirar</div>
          {prontos.length === 0 && <div style={{ padding: '50px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: '13.5px' }}>Nenhuma senha pronta</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
            {prontos.map((o) => (
              <div
                key={o.senha} draggable
                onDragStart={() => { dragSenha.current = o.senha; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(o.senha)}
                style={{ background: 'var(--card)', border: '1.5px solid var(--accent2)', borderRadius: '14px', padding: '15px', animation: 'pulseGlow 1.8s ease-in-out infinite', cursor: 'grab' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '11px', color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Senha</span><span style={{ color: 'var(--accent2)', fontSize: '15px', lineHeight: 1, letterSpacing: '1px', opacity: .6 }}>⠿</span></div>
                <div onClick={() => setDetalhe(o.senha)} title="Ver itens do pedido" style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '54px', lineHeight: 1, letterSpacing: '-.03em', color: 'var(--accent2)', cursor: 'pointer' }}>{pad3(o.senha)}</div>
                <div onClick={() => setDetalhe(o.senha)} style={{ margin: '8px 0 11px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>{nItensFmt(o)} · toque para ver</div>
                <button onClick={() => pedirEntrega(o)} style={{ width: '100%', background: 'none', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: '9px', padding: '9px', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}>Entregue ✓</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* comandas atendidas */}
      <div style={{ marginTop: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>Comandas atendidas</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{nTodas} comandas</span>
            {aReceber > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '999px', background: 'color-mix(in srgb,#e23b3b 16%,transparent)', color: '#ff927d', border: '1px solid color-mix(in srgb,#e23b3b 42%,transparent)' }}>A receber · {brl(aReceber)}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {atChip('todas', 'Todas', nTodas)}
          {atChip('pendentes', 'A receber', nPend)}
          {atChip('pagas', 'Pagas', nPagas)}
        </div>
        {atendidas.length === 0 ? (
          <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: '13.5px' }}>Nenhuma comanda neste filtro</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {atendidas.map((o) => (
              <div key={o.senha} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto auto', gap: '14px', alignItems: 'center', padding: '11px 4px', borderBottom: '1px solid color-mix(in srgb,var(--border) 55%,transparent)' }}>
                <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '18px', color: 'var(--muted)' }}>{pad3(o.senha)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{descDe(o)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{o.hora} · {o.pagamento}{o.atendente ? ` · pedido: ${o.atendente}` : ''}</div>
                </div>
                <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>{brl(totalDe(o))}</span>
                <span onClick={() => togglePago(o.senha)} style={pagoPill(o.pago)}>{pagoTxt(o.pago)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* gaveta lateral de detalhe */}
      {detO && (
        <>
          <div onClick={() => setDetalhe(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 44, animation: 'sd-cover .25s ease-out both' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px,92vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 45, display: 'flex', flexDirection: 'column', boxShadow: '-24px 0 60px rgba(0,0,0,.4)', animation: 'sd-slidein .32s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '22px 24px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.14em' }}>Senha</div>
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '56px', lineHeight: 1, letterSpacing: '-.03em', color: detO.status === 'pronto' ? 'var(--accent2)' : 'var(--accent)' }}>{pad3(detO.senha)}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: detO.status === 'pronto' ? 'var(--accent2)' : 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: '6px' }}>{detO.status === 'pronto' ? 'Pronto — pode retirar' : 'Em preparo'}</div>
              </div>
              <button onClick={() => setDetalhe(null)} style={{ flex: 'none', width: '38px', height: '38px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div className="sd-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.12em' }}>Itens do pedido</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {detO.items.map((i, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: '11px', paddingBottom: '12px', borderBottom: '1px solid color-mix(in srgb,var(--border) 60%,transparent)' }}>
                    <span style={{ flex: 'none', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', color: detO.status === 'pronto' ? 'var(--accent2)' : 'var(--accent)' }}>{i.qty}×</span>
                    <span style={{ fontSize: '16.5px', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.35 }}>{i.nome}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 17px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)' }}>{detO.pagamento} · {brl(totalDe(detO))}</span>
                <span onClick={() => togglePago(detO.senha)} style={{ ...pagoPill(detO.pago), fontSize: '13.5px', padding: '8px 15px' }}>{pagoTxt(detO.pago)}</span>
              </div>
              {detO.atendente && (
                <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Pedido registrado por <strong style={{ color: 'var(--fg)' }}>{detO.atendente}</strong></div>
              )}
            </div>
            <div style={{ padding: '18px 24px', borderTop: '1px solid var(--border)' }}>
              {detO.status === 'preparo' ? (
                <button onClick={() => { marcar(detO.senha, 'pronto'); setDetalhe(null); }} style={{ width: '100%', background: 'var(--accent2)', color: '#0d1402', border: 'none', borderRadius: '11px', padding: '14px', fontWeight: 700, fontSize: '14.5px', cursor: 'pointer' }}>Marcar pronto →</button>
              ) : (
                <button onClick={() => { setDetalhe(null); pedirEntrega(detO); }} style={{ width: '100%', background: 'none', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: '11px', padding: '14px', fontWeight: 600, fontSize: '14.5px', cursor: 'pointer' }}>Entregue ✓</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* confirmação de entrega não paga */}
      {entregaConfirm && (
        <Overlay onClose={() => setEntregaConfirm(null)}>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '8px' }}>
            Comanda {pad3(entregaConfirm.senha)} não está paga
          </div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>
            {brl(totalDe(entregaConfirm))} · {entregaConfirm.pagamento}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <button onClick={async () => { const s = entregaConfirm.senha; setEntregaConfirm(null); await entregar(s, true); }} style={{ padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
              Receber agora e entregar
            </button>
            <button onClick={async () => { const s = entregaConfirm.senha; setEntregaConfirm(null); await entregar(s, false); }} style={{ padding: '13px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
              Entregar mesmo assim
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function ordenadas(lista, sort) {
  const pos = new Map((sort || []).map((s, i) => [s, i]));
  return lista.slice().sort((a, b) => (pos.get(a.senha) ?? 1e9) - (pos.get(b.senha) ?? 1e9));
}

function Overlay({ children, onClose }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 46, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
    >
      <div style={{ width: '100%', maxWidth: '400px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
        {children}
      </div>
    </div>
  );
}
