import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoHoje = () => new Date().toISOString().slice(0, 10);
const isoDiasAtras = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const PERIODOS = [
  { key: 'hoje', rotulo: 'Hoje',    de: () => isoHoje(),        ate: () => isoHoje() },
  { key: '7d',   rotulo: '7 dias',  de: () => isoDiasAtras(6),  ate: () => isoHoje() },
  { key: '30d',  rotulo: '30 dias', de: () => isoDiasAtras(29), ate: () => isoHoje() },
];

const PAG_COR = { Pix: '#7cc142', 'Cartão': '#4aa8d8', Dinheiro: '#f5a623' };

/**
 * Relatório — fechamento em tempo real, no visual do protótipo: hero com KPIs,
 * faturamento por dia, formas de pagamento (donut), receita de eventos e a
 * tabela de mais vendidos. Ligado ao /orders/relatorio real + /avaliacoes.
 */
export function Relatorio({ ativo }) {
  const [periodo, setPeriodo] = useState('7d');
  const [dados, setDados] = useState(null);
  const [aval, setAval] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const p = PERIODOS.find((x) => x.key === periodo) || PERIODOS[1];
  const faixa = { de: p.de(), ate: p.ate() };

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    setCarregando(true);
    api.relatorio(faixa.de, faixa.ate)
      .then((d) => { if (vivo) { setDados(d); setErro(null); } })
      .catch((e) => { if (vivo) setErro(e); })
      .finally(() => { if (vivo) setCarregando(false); });
    api.avaliacoes(faixa.de, faixa.ate)
      .then((a) => { if (vivo) setAval(a); })
      .catch(() => { if (vivo) setAval(null); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, faixa.de, faixa.ate]);

  const subLabel = { hoje: 'de hoje', '7d': 'dos últimos 7 dias', '30d': 'dos últimos 30 dias' }[periodo];

  const timeChip = (on) => ({
    cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, padding: '7px 13px', borderRadius: '8px', transition: 'all .12s', whiteSpace: 'nowrap',
    ...(on ? { background: 'var(--accent)', color: 'var(--onAccent)' } : { background: 'transparent', color: 'var(--muted)' }),
  });

  const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px 20px' };
  const painelTit = { fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '15px', marginBottom: '14px' };

  // ---- derivados (a partir dos dados reais) ----
  const porDia = dados?.porDia ?? [];
  const maxDia = porDia.length ? Math.max(...porDia.map((d) => Number(d.total) || 0)) : 0;
  const pagamentos = (dados?.porPagamento ?? []).map((x) => ({ ...x, cor: PAG_COR[x.pagamento] || '#a99a83' }));
  const totalPag = pagamentos.reduce((s, x) => s + (Number(x.total) || 0), 0) || 1;
  let acc = 0;
  const segs = pagamentos.map((x) => {
    const ini = (acc / totalPag) * 100;
    acc += Number(x.total) || 0;
    const fim = (acc / totalPag) * 100;
    return { ...x, ini, fim, pct: Math.round(((Number(x.total) || 0) / totalPag) * 100) };
  });
  const donutGradient = segs.length
    ? `conic-gradient(${segs.map((s) => `${s.cor} ${s.ini}% ${s.fim}%`).join(', ')})`
    : 'conic-gradient(var(--surface2) 0% 100%)';
  const donutTop = segs.slice().sort((a, b) => b.pct - a.pct)[0];

  const maisVendidos = dados?.maisVendidos ?? [];
  const maxQty = maisVendidos.length ? Math.max(...maisVendidos.map((m) => Number(m.qtd) || 0)) : 0;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* cabeçalho + período */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '30px', letterSpacing: '-.02em', lineHeight: 1 }}>Relatório</div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '6px' }}>Fechamento {subLabel}{carregando ? ' · carregando…' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '5px', background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px', borderRadius: '12px' }}>
          {PERIODOS.map((x) => (
            <span key={x.key} onClick={() => setPeriodo(x.key)} style={timeChip(periodo === x.key)}>{x.rotulo}</span>
          ))}
        </div>
      </div>

      {erro && (
        <div style={{ ...panel, borderColor: '#e23b3b', fontSize: '13px', fontWeight: 700, marginBottom: '18px' }}>
          {erro.codigo === 'PERIODO_INVALIDO' ? 'Período inválido.' : (erro.message || 'Falha ao carregar o relatório.')}
        </div>
      )}

      {dados && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '18px', marginBottom: '18px', alignItems: 'start' }}>
            {/* HERO + KPIs */}
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '22px', border: '1px solid var(--border)', background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 26%, var(--surface)) 0%, var(--surface) 58%)', padding: '26px 26px 22px' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.22em', fontWeight: 700 }}>Fechamento</div>
              <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '38px', letterSpacing: '-.025em', lineHeight: 1.04, marginTop: '10px', maxWidth: '330px' }}>Fechamento<br />em tempo real</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '999px', padding: '9px 15px', fontSize: '12.5px', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent2)', boxShadow: '0 0 8px var(--accent2)' }} /> Período {subLabel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginTop: '24px' }}>
                <HeroKpi label="Faturamento" valor={brl(dados.faturamento)} sub={`${dados.pedidos} pedidos`} />
                <HeroKpi label="Ticket médio" valor={brl(dados.ticketMedio)} sub="por pedido" />
                <HeroKpi label="A receber" valor={brl(dados.aReceber)} sub="não pago" cor={Number(dados.aReceber) > 0 ? '#ff927d' : 'var(--accent2)'} />
              </div>
            </div>

            {/* COLUNA DIREITA: por dia + donut */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={panel}>
                <div style={painelTit}>Faturamento por dia</div>
                {porDia.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '10px 0' }}>Sem pedidos no período.</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
                    {porDia.slice(-10).map((d) => {
                      const pct = maxDia ? Math.max(5, (Number(d.total) / maxDia) * 100) : 5;
                      return (
                        <div key={d.dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', height: '100%', justifyContent: 'flex-end' }} title={brl(d.total)}>
                          <div style={{ width: '100%', maxWidth: '30px', background: 'color-mix(in srgb, var(--accent) 78%, transparent)', borderRadius: '7px', height: `${pct}%`, minHeight: '5px' }} />
                          <span style={{ fontSize: '10.5px', color: 'var(--muted)' }}>{new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'numeric' })}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={panel}>
                <div style={painelTit}>Formas de pagamento</div>
                {segs.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '10px 0' }}>Sem pedidos no período.</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    <div style={{ position: 'relative', width: '104px', height: '104px', flex: 'none' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: donutGradient }} />
                      <div style={{ position: 'absolute', inset: '16px', borderRadius: '50%', background: 'var(--surface)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '34px', letterSpacing: '-.03em', lineHeight: 1 }}>{donutTop?.pct ?? 0}%</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>{donutTop?.pagamento ?? '—'}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {segs.map((s) => (
                          <div key={s.pagamento} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                            <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: s.cor, flex: 'none' }} />
                            <span style={{ flex: 1, color: 'var(--muted)' }}>{s.pagamento}</span>
                            <span style={{ fontWeight: 700, fontFamily: "'Bricolage Grotesque',sans-serif" }}>{s.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RECEITA DE EVENTOS */}
          <div style={{ ...panel, padding: '20px 22px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '16px' }}>Receita de eventos</div>
              <span style={{ fontSize: '11.5px', color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '999px', padding: '4px 12px', fontWeight: 600 }}>Contabilizada à parte do balcão</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
              <RecCard label="Eventos confirmados" valor={brl(dados.eventos?.receita)} sub={`${dados.eventos?.qtd || 0} eventos · receita garantida`} cor="#7cc142" borda="color-mix(in srgb,#7cc142 32%,var(--border))" />
              <RecCard label="A receber · balcão" valor={brl(dados.aReceber)} sub="comandas não pagas" cor="#4aa8d8" borda="color-mix(in srgb,#4aa8d8 28%,var(--border))" />
              <RecCard label="Total balcão + eventos" valor={brl((Number(dados.faturamento) || 0) + (Number(dados.eventos?.receita) || 0))} sub={`Balcão ${brl(dados.faturamento)} + eventos ${brl(dados.eventos?.receita)}`} />
            </div>
          </div>

          {/* MAIS VENDIDOS */}
          <div style={{ ...panel, padding: '20px 22px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '16px' }}>Bebidas mais vendidas</div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Top {maisVendidos.length}</span>
            </div>
            {maisVendidos.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '10px 0' }}>Sem vendas no período.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '24px 2fr 1fr 1.4fr 0.8fr', gap: '14px', alignItems: 'center', padding: '0 4px 12px', borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <span>#</span><span>Bebida</span><span>Qtd</span><span>Participação</span><span style={{ textAlign: 'right' }}>Receita</span>
                </div>
                {maisVendidos.map((m, i) => {
                  const pct = maxQty ? Math.round((Number(m.qtd) / maxQty) * 100) : 0;
                  return (
                    <div key={m.nome} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 1fr 1.4fr 0.8fr', gap: '14px', alignItems: 'center', padding: '13px 4px', borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}>
                      <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '14px', color: 'var(--muted)' }}>{i + 1}</span>
                      <span style={{ fontWeight: 600, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</span>
                      <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{m.qtd} un</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <div style={{ flex: 1, height: '8px', background: 'var(--bg)', borderRadius: '5px', overflow: 'hidden' }}><div style={{ height: '100%', background: 'var(--accent)', borderRadius: '5px', width: `${pct}%` }} /></div>
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)', width: '34px', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <span style={{ textAlign: 'right', fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '14px' }}>{brl(m.total)}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* AVALIAÇÕES DOS CLIENTES */}
          <div style={{ ...panel, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: '16px' }}>Avaliações dos clientes</div>
              {aval && aval.qtd > 0 && <span style={{ fontSize: '13px', fontWeight: 700, color: '#f5a623' }}>★ {aval.media?.toFixed(1)} · {aval.qtd}</span>}
            </div>
            {!aval || aval.qtd === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '10px 0' }}>Nenhuma avaliação no período.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {aval.avaliacoes.map((a, i) => (
                  <div key={`${a.dia}-${a.senha}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '11px 0', borderTop: i ? '1px solid color-mix(in srgb,var(--border) 60%,transparent)' : 'none' }}>
                    <span style={{ fontSize: '15px', letterSpacing: '2px', color: '#f5a623', flex: 'none' }} title={`${a.nota}/5`}>
                      {'★'.repeat(a.nota)}<span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - a.nota)}</span>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {a.comentario ? <div style={{ fontSize: '13px', lineHeight: 1.45 }}>{a.comentario}</div> : <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Sem comentário.</div>}
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '3px' }}>Senha {a.senha} · {new Date(a.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}{a.cliente ? ` · ${a.cliente}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HeroKpi({ label, valor, sub, cor }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '24px', letterSpacing: '-.02em', marginTop: '7px', lineHeight: 1, color: cor || 'var(--fg)' }}>{valor}</div>
      <div style={{ fontSize: '11.5px', marginTop: '6px', color: 'var(--muted)' }}>{sub}</div>
    </div>
  );
}

function RecCard({ label, valor, sub, cor, borda }) {
  return (
    <div style={{ background: 'var(--bg)', border: `1px solid ${borda || 'var(--border)'}`, borderRadius: '14px', padding: '15px 16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: '25px', letterSpacing: '-.02em', marginTop: '7px', lineHeight: 1, color: cor || 'var(--fg)' }}>{valor}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '6px' }}>{sub}</div>
    </div>
  );
}
