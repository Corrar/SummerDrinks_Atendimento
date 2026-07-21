import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * Tour guiado ("manual de uso") — escurece a tela, ilumina UM elemento por vez
 * (spotlight) e mostra um cartão explicando. Cada passo pode trocar de aba
 * (props.setAba) antes de medir o alvo. Botões: Pular, Voltar, Próximo/Concluir.
 *
 * steps: [{ titulo, texto, tab?, alvo? (seletor CSS) }]
 */
export function Tour({ steps, setAba, onFechar }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];
  const ultimo = i >= steps.length - 1;

  // Troca de aba assim que o passo muda (antes de medir o alvo).
  useEffect(() => { if (step?.tab) setAba(step.tab); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    let vivo = true;
    const medir = () => {
      if (!vivo) return;
      const el = step?.alvo ? document.querySelector(step.alvo) : null;
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };
    // Espera o render da aba nova antes de medir.
    const t = setTimeout(medir, step?.tab ? 200 : 40);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { vivo = false; clearTimeout(t); window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const cardW = Math.min(340, vw - 24);
  const PAD = 8;

  // Posição do cartão: centralizado (sem alvo) ou perto do alvo (abaixo/acima).
  let cardStyle;
  if (!rect) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  } else {
    const abaixo = rect.top + rect.height + 200 < vh;
    const top = abaixo ? rect.top + rect.height + 16 : Math.max(12, rect.top - 16 - 210);
    let left = rect.left + rect.width / 2 - cardW / 2;
    left = Math.max(12, Math.min(left, vw - cardW - 12));
    cardStyle = { top: `${top}px`, left: `${left}px` };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }}>
      {/* bloqueador de cliques; escurece a tela quando não há spotlight */}
      <div style={{ position: 'absolute', inset: 0, background: rect ? 'transparent' : 'rgba(0,0,0,.66)', transition: 'background .2s' }} />

      {/* spotlight: buraco iluminado ao redor do alvo (o escuro vem do box-shadow) */}
      {rect && (
        <div
          style={{
            position: 'absolute', top: rect.top - PAD, left: rect.left - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            borderRadius: '14px', border: '2px solid var(--accent)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,.66)', pointerEvents: 'none',
            transition: 'all .28s cubic-bezier(.22,1,.36,1)',
          }}
        />
      )}

      {/* cartão do passo */}
      <div
        style={{
          position: 'absolute', width: `${cardW}px`, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 18px 14px',
          boxShadow: '0 20px 60px rgba(0,0,0,.5)', color: 'var(--fg)', zIndex: 10000,
          animation: 'sdFade .2s ease-out both', ...cardStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            Passo {i + 1} de {steps.length}
          </span>
          <button onClick={onFechar} title="Fechar" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '19px', letterSpacing: '-.01em', marginBottom: '7px' }}>{step.titulo}</div>
        <div style={{ fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.5 }}>{step.texto}</div>

        {/* progresso (bolinhas) */}
        <div style={{ display: 'flex', gap: '5px', margin: '14px 0 12px', flexWrap: 'wrap' }}>
          {steps.map((_, idx) => (
            <span key={idx} style={{ width: idx === i ? '18px' : '6px', height: '6px', borderRadius: '999px', background: idx === i ? 'var(--accent)' : 'var(--border)', transition: 'all .2s' }} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: '8px 2px', marginRight: 'auto' }}>Pular tutorial</button>
          {i > 0 && (
            <button onClick={() => setI((v) => v - 1)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: '10px', padding: '9px 15px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Voltar</button>
          )}
          <button onClick={() => (ultimo ? onFechar() : setI((v) => v + 1))} style={{ background: 'var(--accent)', border: 'none', color: 'var(--onAccent)', borderRadius: '10px', padding: '9px 17px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
            {ultimo ? 'Concluir' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}
