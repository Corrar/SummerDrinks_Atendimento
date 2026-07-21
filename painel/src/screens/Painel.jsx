import { useRef, useState } from 'react';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad3 = (n) => String(n).padStart(3, '0');
const totalDe = (o) => o.items.reduce((s, i) => s + i.preco * i.qty, 0);
const descDe = (o) => `${o.items.reduce((s, i) => s + i.qty, 0)} un · ${o.items[0]?.nome || ''}`;

/**
 * Painel de senhas — operação do balcão, igual ao protótipo: chamada atual /
 * anterior em destaque, colunas Em preparo / Prontas com drag-drop e ações
 * (Pronto, Entregar com trava de não pago, toggle pago), detalhe do pedido, e o
 * registro de comandas atendidas com filtros + "a receber". Ligado ao backend
 * (marcar / togglePago / entregar / reordenar via PATCH).
 */
export function Painel({ orders, painel, reordenar, marcar, togglePago, entregar }) {
  const dragSenha = useRef(null);
  const [detalhe, setDetalhe] = useState(null);   // senha aberta no modal de detalhe
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* chamada atual / anterior */}
      <div style={{ display: 'grid', gridTemplateColumns: anteriorSenha != null ? '2fr 1fr' : '1fr', gap: '14px' }}>
        <div style={{ textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '22px', padding: '26px 20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '3px', color: 'var(--muted)' }}>CHAMANDO AGORA</div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '92px', lineHeight: 1.05, color: 'var(--accent2)', animation: atualSenha != null ? 'sdPulse 2.4s ease infinite' : 'none' }}>
            {atualSenha != null ? pad3(atualSenha) : '–––'}
          </div>
        </div>
        {anteriorSenha != null && (
          <div style={{ textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '22px', padding: '26px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', color: 'var(--muted)' }}>ANTERIOR</div>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '54px', lineHeight: 1.05, color: 'var(--muted)' }}>{pad3(anteriorSenha)}</div>
          </div>
        )}
      </div>

      {/* colunas de fila */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>
        <Coluna
          titulo="Em preparo" cor="var(--accent)" lista={emPreparo} vazio="Nada em preparo."
          dragSenha={dragSenha} onDrop={onDrop} onCard={(o) => setDetalhe(o.senha)}
          acao={(o) => ({ label: 'Pronto', cor: 'var(--accent2)', fg: '#1a1206', onClick: () => marcar(o.senha, 'pronto') })}
          togglePago={togglePago}
        />
        <Coluna
          titulo="Prontas p/ retirada" cor="var(--accent2)" lista={prontos} vazio="Nenhuma comanda pronta." destaque
          dragSenha={dragSenha} onDrop={onDrop} onCard={(o) => setDetalhe(o.senha)}
          acao={(o) => ({ label: 'Entregar', cor: 'var(--accent)', fg: 'var(--onAccent)', onClick: () => pedirEntrega(o) })}
          togglePago={togglePago}
        />
      </div>

      {/* a receber */}
      {aReceber > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'color-mix(in srgb,#e23b3b 12%,transparent)', border: '1px solid color-mix(in srgb,#e23b3b 40%,transparent)', borderRadius: '14px', padding: '13px 16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>A receber (comandas não pagas)</span>
          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '18px', color: '#ff927d' }}>{brl(aReceber)}</span>
        </div>
      )}

      {/* registro de atendidas */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)' }}>Atendidas hoje</span>
          <div style={{ display: 'flex', gap: '7px' }}>
            {[['todas', 'Todas', nTodas], ['pendentes', 'A receber', nPend], ['pagas', 'Pagas', nPagas]].map(([k, label, n]) => (
              <button
                key={k} onClick={() => setFiltroAt(k)}
                style={{
                  fontSize: '11.5px', fontWeight: 600, padding: '6px 11px', borderRadius: '8px', whiteSpace: 'nowrap',
                  border: filtroAt === k ? 'none' : '1px solid var(--border)',
                  background: filtroAt === k ? 'var(--accent)' : 'var(--bg)',
                  color: filtroAt === k ? 'var(--onAccent)' : 'var(--muted)',
                }}
              >
                {label} · {n}
              </button>
            ))}
          </div>
        </div>
        {atendidas.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '8px 0' }}>Nenhuma comanda atendida.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {atendidas.map((o) => (
              <div key={o.senha} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '20px', color: 'var(--fg)', minWidth: '46px' }}>{pad3(o.senha)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{descDe(o)}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{o.hora} · {o.pagamento} · {brl(totalDe(o))}</div>
                </div>
                <button onClick={() => togglePago(o.senha)} style={pagoPill(o.pago)}>{o.pago ? '✓ Pago' : '○ A receber'}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* detalhe do pedido */}
      {detO && (
        <Overlay onClose={() => setDetalhe(null)}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2.5px', color: 'var(--muted)' }}>COMANDA</div>
            <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '52px', lineHeight: 1.05, color: detO.status === 'pronto' ? 'var(--accent2)' : 'var(--accent)' }}>{pad3(detO.senha)}</div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: detO.status === 'pronto' ? 'var(--accent2)' : 'var(--accent)' }}>
              {detO.status === 'pronto' ? 'Pronto — pode retirar' : 'Em preparo'}
            </div>
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '12px 14px', margin: '12px 0' }}>
            {detO.items.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--fg)', padding: '3px 0' }}>
                <span>{i.qty}× {i.nome}</span>
                <span style={{ fontWeight: 700 }}>{brl(i.preco * i.qty)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '15px', color: 'var(--fg)', borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px' }}>
              <span>Total</span><span>{brl(totalDe(detO))}</span>
            </div>
          </div>
          <button onClick={() => togglePago(detO.senha)} style={{ ...pagoPill(detO.pago), width: '100%', fontSize: '13.5px', padding: '10px', marginBottom: '10px' }}>
            {detO.pago ? '✓ Pago' : '○ A receber — marcar pago'}
          </button>
          <div style={{ display: 'flex', gap: '9px' }}>
            {detO.status === 'preparo' ? (
              <button onClick={() => { marcar(detO.senha, 'pronto'); setDetalhe(null); }} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '14px' }}>Marcar pronto</button>
            ) : (
              <button onClick={() => { setDetalhe(null); pedirEntrega(detO); }} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '14px' }}>Entregar</button>
            )}
          </div>
        </Overlay>
      )}

      {/* confirmação de entrega não paga */}
      {entregaConfirm && (
        <Overlay onClose={() => setEntregaConfirm(null)}>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '19px', color: 'var(--fg)', marginBottom: '8px' }}>
            Comanda {pad3(entregaConfirm.senha)} não está paga
          </div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginBottom: '18px', lineHeight: 1.5 }}>
            {brl(totalDe(entregaConfirm))} · {entregaConfirm.pagamento}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <button onClick={async () => { const s = entregaConfirm.senha; setEntregaConfirm(null); await entregar(s, true); }} style={{ padding: '13px', border: 'none', borderRadius: '12px', background: 'var(--accent2)', color: '#1a1206', fontWeight: 800, fontSize: '14px' }}>
              Receber agora e entregar
            </button>
            <button onClick={async () => { const s = entregaConfirm.senha; setEntregaConfirm(null); await entregar(s, false); }} style={{ padding: '13px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '14px' }}>
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

const pagoPill = (pago) => ({
  cursor: 'pointer', fontSize: '10.5px', fontWeight: 700, padding: '5px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
  border: '1px solid ' + (pago ? 'color-mix(in srgb,#7cc142 48%,transparent)' : 'color-mix(in srgb,#e23b3b 46%,transparent)'),
  background: pago ? 'color-mix(in srgb,#7cc142 20%,transparent)' : 'color-mix(in srgb,#e23b3b 18%,transparent)',
  color: pago ? '#a7e76b' : '#ff927d',
});

function Coluna({ titulo, cor, lista, vazio, dragSenha, onDrop, onCard, acao, togglePago, destaque = false }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)' }}>{titulo}</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: cor }}>{lista.length}</span>
      </div>
      {lista.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '10px 0' }}>{vazio}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {lista.map((o) => {
            const a = acao(o);
            return (
              <div
                key={o.senha}
                draggable
                onDragStart={() => { dragSenha.current = o.senha; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(o.senha)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 12px', borderRadius: '13px', cursor: 'grab',
                  background: destaque ? 'color-mix(in srgb, var(--accent2) 12%, transparent)' : 'var(--surface2)',
                  border: `1px solid ${destaque ? 'color-mix(in srgb, var(--accent2) 40%, transparent)' : 'var(--border)'}`,
                }}
              >
                <button onClick={() => onCard(o)} title="Detalhes" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, border: 'none', background: 'transparent', textAlign: 'left', padding: 0 }}>
                  <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '24px', color: destaque ? 'var(--accent2)' : 'var(--fg)', minWidth: '46px' }}>{pad3(o.senha)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{descDe(o)}</span>
                    <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--fg)', marginTop: '2px' }}>{brl(totalDe(o))} · {o.pagamento}{o.cliente ? ` · ${o.cliente}` : ''}</span>
                  </span>
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
                  <button onClick={a.onClick} style={{ border: 'none', borderRadius: '9px', padding: '8px 12px', background: a.cor, color: a.fg, fontWeight: 800, fontSize: '12px' }}>{a.label}</button>
                  <button onClick={() => togglePago(o.senha)} style={pagoPill(o.pago)}>{o.pago ? '✓ Pago' : '○ A receber'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
