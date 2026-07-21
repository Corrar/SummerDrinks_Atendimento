/**
 * Skeleton loading — blocos com shimmer (classe .sd-skel no index.css) exibidos
 * enquanto os dados de um componente ainda estão carregando.
 */
export function Skel({ w = '100%', h = 14, r = 8, style }) {
  return (
    <div
      className="sd-skel"
      style={{ width: w, height: typeof h === 'number' ? `${h}px` : h, borderRadius: typeof r === 'number' ? `${r}px` : r, ...style }}
    />
  );
}

/** Card de bebida em skeleton (mesma silhueta do card real do PDV). */
export function SkelDrinkCard() {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skel w="13px" h={13} r="50%" />
        <Skel w="70px" h={11} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '66px' }}>
        <Skel w="85%" h={16} />
        <Skel w="55%" h={16} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Skel w="80px" h={24} />
        <Skel w="40px" h={40} r={11} />
      </div>
    </div>
  );
}

/** Tile de senha em skeleton (coluna Em preparo / Pronto do Painel). */
export function SkelSenhaTile() {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '11px' }}>
      <Skel w="45px" h={11} />
      <Skel w="70%" h={40} />
      <Skel w="60%" h={11} />
      <Skel w="100%" h={34} r={9} />
    </div>
  );
}
