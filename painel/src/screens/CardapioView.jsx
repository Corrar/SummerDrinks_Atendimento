import { useMemo, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { CLIENTE_URL, TENANT } from '../lib/config.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CATS = ['Especiais', 'Balada', 'Aperol', 'Campari', 'Batidinhas', 'Caipirinhas', 'Doses', 'Potes', 'Baldes'];
const CAT_COR = { Especiais: '#f5a623', Balada: '#ff5da2', Aperol: '#ff7a2f', Campari: '#e23b3b', Batidinhas: '#b07be0', Caipirinhas: '#7cc142', Doses: '#4aa8d8', Potes: '#3fcaa8', Baldes: '#e0b341' };

const volLabel = (p) => {
  const t = p.tamanhos || [];
  if (!t.length) return '';
  return t.length === 1 ? t[0].rotulo : `${t[0].rotulo}–${t[t.length - 1].rotulo}`;
};
const precoMin = (p) => Math.min(...(p.tamanhos || [{ preco: 0 }]).map((t) => Number(t.preco)));
const descDe = (p) => p.desc ?? p.descricao ?? '';

// Destino do QR: o app do cliente, opcionalmente com a mesa (?mesa=N).
function destinoMenu(mesa) {
  const base = CLIENTE_URL.replace(/\/+$/, '');
  const q = [];
  if (TENANT && TENANT !== 'summer') q.push('tenant=' + encodeURIComponent(TENANT));
  if (mesa) q.push('mesa=' + mesa);
  return base + (q.length ? '?' + q.join('&') : '');
}

/**
 * Cardápio — visão agrupada por categoria (somente leitura, para conferência e
 * exibição), com o botão "QR do cardápio": gera um QR do app do cliente (por
 * mesa, opcional) que pode ser impresso para as mesas. A edição fica na aba
 * Editar. Dados vêm do catálogo real (mesma fonte do /menu público).
 */
export function CardapioView({ itens }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [mesa, setMesa] = useState(0); // 0 = sem mesa (cardápio geral)
  const [qrUrl, setQrUrl] = useState('');

  const grupos = useMemo(
    () => CATS.map((c) => ({ cat: c, cor: CAT_COR[c], itens: itens.filter((p) => p.cat === c) })).filter((g) => g.itens.length),
    [itens],
  );
  const destino = destinoMenu(mesa);

  useEffect(() => {
    if (!qrOpen) return;
    let vivo = true;
    QRCode.toDataURL(destino, { margin: 2, width: 320, errorCorrectionLevel: 'M', color: { dark: '#1a1206', light: '#ffffff' } })
      .then((url) => { if (vivo) setQrUrl(url); })
      .catch(() => { if (vivo) setQrUrl(''); });
    return () => { vivo = false; };
  }, [qrOpen, destino]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '20px', color: 'var(--fg)', margin: 0 }}>Cardápio</h2>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>{itens.length} bebidas · o mesmo que o cliente vê no app</div>
        </div>
        <button
          onClick={() => setQrOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 18px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '13.5px' }}
        >
          <QrGlyph /> QR do cardápio
        </button>
      </div>

      {grupos.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>Cardápio vazio — cadastre bebidas na aba Editar.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {grupos.map((g) => (
          <section key={g.cat}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
              <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: g.cor, boxShadow: `0 0 10px ${g.cor}` }} />
              <h3 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '17px', color: 'var(--fg)', margin: 0 }}>{g.cat}</h3>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>{g.itens.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
              {g.itens.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '13px' }}>
                  {p.img && (
                    <div style={{ width: '56px', height: '56px', borderRadius: '11px', overflow: 'hidden', flex: '0 0 auto', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={p.img} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--fg)' }}>{p.nome}</div>
                    <div style={{ fontSize: '11.5px', color: g.cor, fontWeight: 600, marginTop: '2px' }}>{volLabel(p)}</div>
                    {descDe(p) && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '5px', lineHeight: 1.45 }}>{descDe(p)}</div>}
                  </div>
                  <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '15px', color: 'var(--fg)', whiteSpace: 'nowrap' }}>
                    {p.tamanhos && p.tamanhos.length > 1 && <span style={{ display: 'block', fontFamily: 'Hanken Grotesk', fontWeight: 600, fontSize: '10px', color: 'var(--muted)' }}>a partir de</span>}
                    {brl(precoMin(p))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* QR do cardápio */}
      {qrOpen && (
        <div
          className="sd-noprint-bg"
          onClick={(e) => { if (e.target === e.currentTarget) setQrOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '22px', animation: 'sdFade .18s ease' }}
        >
          <div style={{ width: '100%', maxWidth: '360px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '22px', animation: 'sdModalIn .28s cubic-bezier(.2,1,.3,1)' }}>
            <div id="qr-ticket" style={{ background: '#fff', color: '#1a1206', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '18px' }}>Summer Drinks</div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', color: '#b06a10', marginBottom: '4px' }}>CARDÁPIO DIGITAL</div>
              {mesa > 0 && <div style={{ fontSize: '13px', fontWeight: 800, color: '#1a1206', marginBottom: '8px' }}>Mesa {String(mesa).padStart(2, '0')}</div>}
              <div style={{ width: '220px', height: '220px', margin: '10px auto', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {qrUrl ? <img src={qrUrl} alt="QR do cardápio" style={{ width: '100%', height: '100%', display: 'block' }} /> : <span style={{ fontSize: '12px', color: '#8a7a5f' }}>gerando…</span>}
              </div>
              <div style={{ fontSize: '11px', color: '#6a5c44' }}>Aponte a câmera para ver o cardápio e pedir.</div>
            </div>

            <div className="sd-noprint" style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>Mesa</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setMesa((m) => Math.max(0, m - 1))} style={qtyBtn}>−</button>
                  <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '18px', color: 'var(--fg)', minWidth: '52px', textAlign: 'center' }}>{mesa === 0 ? 'Geral' : String(mesa).padStart(2, '0')}</span>
                  <button onClick={() => setMesa((m) => m + 1)} style={qtyBtn}>+</button>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', wordBreak: 'break-all', marginBottom: '12px' }}>{destino}</div>
              <div style={{ display: 'flex', gap: '9px' }}>
                <button onClick={() => window.print()} style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface2)', color: 'var(--fg)', fontWeight: 800, fontSize: '13.5px' }}>Imprimir</button>
                <button onClick={() => setQrOpen(false)} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', background: 'var(--accent)', color: 'var(--onAccent)', fontWeight: 800, fontSize: '13.5px' }}>Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const qtyBtn = { width: '34px', height: '34px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--fg)', fontSize: '18px', fontWeight: 800 };

function QrGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M18 18h3v3" />
    </svg>
  );
}
