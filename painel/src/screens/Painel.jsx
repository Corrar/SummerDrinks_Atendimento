import { useRef } from 'react';

/**
 * Painel de Senhas — visão de chamada para o balcão/TV. Mostra a última senha
 * chamada em destaque + grid de prontas e em preparo. Drag-and-drop reordena
 * (PATCH /panel/order com If-Match; conflito de versão resolve pelo snapshot).
 */
export function Painel({ orders, painel, reordenar }) {
  const dragSenha = useRef(null);

  const prontas = ordenadas(orders.filter((o) => o.status === 'pronto'), painel.sort);
  const preparo = ordenadas(orders.filter((o) => o.status === 'preparo'), painel.sort);
  const ultima = painel.ultimaChamada;

  function onDrop(target) {
    const from = dragSenha.current;
    dragSenha.current = null;
    if (from == null || from === target) return;
    const arr = painel.sort.filter((x) => x !== from);
    const idx = arr.indexOf(target);
    arr.splice(idx < 0 ? arr.length : idx, 0, from);
    reordenar(arr);
  }

  return (
    <div>
      {/* última chamada em destaque */}
      <div
        style={{
          textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: '22px', padding: '28px 20px', marginBottom: '18px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '3px', color: 'var(--muted)' }}>ÚLTIMA CHAMADA</div>
        <div
          style={{
            fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '96px', lineHeight: 1.05,
            color: 'var(--accent)', animation: ultima ? 'sdPulse 2.4s ease infinite' : 'none',
          }}
        >
          {ultima ?? '—'}
        </div>
        {painel.chamadaHist.length > 1 && (
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
            Anteriores: {painel.chamadaHist.slice(0, -1).slice(-6).join(' · ')}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Coluna titulo="Prontas p/ retirada" cor="var(--accent2)" lista={prontas} dragSenha={dragSenha} onDrop={onDrop} destaque />
        <Coluna titulo="Em preparo" cor="var(--accent)" lista={preparo} dragSenha={dragSenha} onDrop={onDrop} />
      </div>
    </div>
  );
}

function ordenadas(lista, sort) {
  const pos = new Map(sort.map((s, i) => [s, i]));
  return lista.slice().sort((a, b) => (pos.get(a.senha) ?? 1e9) - (pos.get(b.senha) ?? 1e9));
}

function Coluna({ titulo, cor, lista, dragSenha, onDrop, destaque = false }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)' }}>{titulo}</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: cor }}>{lista.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: '9px' }}>
        {lista.map((o) => (
          <div
            key={o.senha}
            draggable
            onDragStart={() => { dragSenha.current = o.senha; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(o.senha)}
            title={o.cliente || undefined}
            style={{
              textAlign: 'center', padding: '14px 6px', borderRadius: '13px', cursor: 'grab',
              background: destaque ? 'color-mix(in srgb, var(--accent2) 16%, transparent)' : 'var(--surface2)',
              border: `1px solid ${destaque ? 'color-mix(in srgb, var(--accent2) 45%, transparent)' : 'var(--border)'}`,
              fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '26px',
              color: destaque ? 'var(--accent2)' : 'var(--fg)',
            }}
          >
            {o.senha}
          </div>
        ))}
        {!lista.length && (
          <div style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '14px 0' }}>
            Vazio.
          </div>
        )}
      </div>
    </div>
  );
}
