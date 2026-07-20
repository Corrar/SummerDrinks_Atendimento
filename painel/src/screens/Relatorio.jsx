import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoHoje = () => new Date().toISOString().slice(0, 10);
const isoDiasAtras = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const PERIODOS = [
  { key: 'hoje', rotulo: 'Hoje',       de: () => isoHoje(),        ate: () => isoHoje() },
  { key: '7d',   rotulo: '7 dias',     de: () => isoDiasAtras(6),  ate: () => isoHoje() },
  { key: '30d',  rotulo: '30 dias',    de: () => isoDiasAtras(29), ate: () => isoHoje() },
];

const PAG_COR = { Pix: '#7cc142', 'Cartão': '#4aa8d8', Dinheiro: '#f5a623' };

/** Relatório — KPIs, breakdown por pagamento, mais vendidos, barras por dia e avaliações. */
export function Relatorio({ ativo }) {
  const [periodo, setPeriodo] = useState('7d');
  const [custom, setCustom] = useState(null);       // {de, ate} quando período custom
  const [dados, setDados] = useState(null);
  const [aval, setAval] = useState(null);           // feedback dos clientes no período
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const faixa = custom ?? (() => {
    const p = PERIODOS.find((x) => x.key === periodo) || PERIODOS[1];
    return { de: p.de(), ate: p.ate() };
  })();

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    setCarregando(true);
    api.relatorio(faixa.de, faixa.ate)
      .then((d) => { if (vivo) { setDados(d); setErro(null); } })
      .catch((e) => { if (vivo) setErro(e); })
      .finally(() => { if (vivo) setCarregando(false); });
    // Avaliações são complemento: falha aqui não derruba o relatório.
    api.avaliacoes(faixa.de, faixa.ate)
      .then((a) => { if (vivo) setAval(a); })
      .catch(() => { if (vivo) setAval(null); });
    return () => { vivo = false; };
  }, [ativo, faixa.de, faixa.ate]);

  const chip = (on) => ({
    padding: '8px 15px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700,
    border: '1px solid var(--border)',
    background: on ? 'var(--accent)' : 'var(--surface2)',
    color: on ? 'var(--onAccent)' : 'var(--muted)',
  });
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '18px' };
  const inputStyle = {
    padding: '8px 11px', borderRadius: '10px', background: 'var(--surface2)',
    border: '1px solid var(--border)', color: 'var(--fg)', fontSize: '13px', fontWeight: 600,
  };

  const maxDia = dados?.porDia?.length ? Math.max(...dados.porDia.map((d) => d.total)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {PERIODOS.map((p) => (
          <button key={p.key} onClick={() => { setPeriodo(p.key); setCustom(null); }} style={chip(!custom && periodo === p.key)}>
            {p.rotulo}
          </button>
        ))}
        <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>ou</span>
        <input type="date" value={faixa.de} onChange={(e) => setCustom({ de: e.target.value, ate: faixa.ate })} style={inputStyle} />
        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>até</span>
        <input type="date" value={faixa.ate} onChange={(e) => setCustom({ de: faixa.de, ate: e.target.value })} style={inputStyle} />
        {carregando && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>carregando…</span>}
      </div>

      {erro && (
        <div style={{ ...card, borderColor: '#e23b3b', fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
          {erro.codigo === 'PERIODO_INVALIDO' ? 'Período inválido.' : (erro.message || 'Falha ao carregar o relatório.')}
        </div>
      )}

      {dados && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <Kpi rotulo="Faturamento" valor={brl(dados.faturamento)} cor="var(--accent)" />
            <Kpi rotulo="Pedidos" valor={String(dados.pedidos)} cor="var(--fg)" />
            <Kpi rotulo="Ticket médio" valor={brl(dados.ticketMedio)} cor="var(--fg)" />
            <Kpi rotulo="A receber (não pago)" valor={brl(dados.aReceber)} cor={dados.aReceber > 0 ? '#e23b3b' : 'var(--accent2)'} />
            <Kpi rotulo="Eventos aceitos" valor={`${dados.eventos.qtd} · ${brl(dados.eventos.receita)}`} cor="#4aa8d8" />
            {aval && aval.qtd > 0 && (
              <Kpi rotulo="Avaliação média" valor={`★ ${aval.media?.toFixed(1)} · ${aval.qtd}`} cor="#f5a623" />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
            {/* por dia */}
            <div style={card}>
              <div style={tituloCard}>Faturamento por dia</div>
              {dados.porDia.length === 0 ? (
                <Vazio texto="Sem pedidos no período." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {dados.porDia.map((d) => (
                    <div key={d.dia} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', width: '78px', flex: '0 0 auto' }}>
                        {new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </span>
                      <span style={{ flex: 1, height: '18px', borderRadius: '6px', background: 'var(--surface2)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${maxDia ? Math.max(3, (d.total / maxDia) * 100) : 0}%`, background: 'var(--accent)', borderRadius: '6px' }} />
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--fg)', width: '96px', textAlign: 'right', flex: '0 0 auto' }}>
                        {brl(d.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* por pagamento */}
            <div style={card}>
              <div style={tituloCard}>Por pagamento</div>
              {dados.porPagamento.length === 0 ? (
                <Vazio texto="Sem pedidos no período." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {dados.porPagamento.map((p) => (
                    <div key={p.pagamento} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: PAG_COR[p.pagamento] || 'var(--muted)', flex: '0 0 auto' }} />
                      <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 700, color: 'var(--fg)' }}>{p.pagamento}</span>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{p.qtd} pedidos</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)', width: '96px', textAlign: 'right' }}>{brl(p.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* avaliações dos clientes (feedback do app) */}
          <div style={card}>
            <div style={tituloCard}>Avaliações dos clientes</div>
            {!aval || aval.qtd === 0 ? (
              <Vazio texto="Nenhuma avaliação no período." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {aval.avaliacoes.map((a, i) => (
                  <div key={`${a.dia}-${a.senha}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: '15px', letterSpacing: '2px', color: '#f5a623', flex: '0 0 auto' }} title={`${a.nota}/5`}>
                      {'★'.repeat(a.nota)}
                      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - a.nota)}</span>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {a.comentario ? (
                        <div style={{ fontSize: '13px', lineHeight: 1.45, color: 'var(--fg)' }}>{a.comentario}</div>
                      ) : (
                        <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>Sem comentário.</div>
                      )}
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '3px' }}>
                        Senha {a.senha} · {new Date(a.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        {a.cliente ? ` · ${a.cliente}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* mais vendidos */}
          <div style={card}>
            <div style={tituloCard}>Mais vendidos</div>
            {dados.maisVendidos.length === 0 ? (
              <Vazio texto="Sem vendas no período." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dados.maisVendidos.map((m, i) => (
                  <div key={m.nome} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '15px', color: i < 3 ? 'var(--accent)' : 'var(--muted)', width: '26px' }}>
                      {i + 1}º
                    </span>
                    <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.nome}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', flex: '0 0 auto' }}>{m.qtd} un</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--fg)', width: '96px', textAlign: 'right', flex: '0 0 auto' }}>{brl(m.total)}</span>
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

const tituloCard = { fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '16px', color: 'var(--fg)', marginBottom: '12px' };

function Kpi({ rotulo, valor, cor }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '15px' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.8px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '7px' }}>
        {rotulo}
      </div>
      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: '21px', color: cor, letterSpacing: '-.02em' }}>
        {valor}
      </div>
    </div>
  );
}

function Vazio({ texto }) {
  return <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '10px 0' }}>{texto}</div>;
}
