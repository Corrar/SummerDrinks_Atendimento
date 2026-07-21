/* ============================================================
   Cliente HTTP AUTENTICADO do painel → backend de atendimento.

   - Authorization: Bearer <jwt> em toda chamada (exceto /auth/*).
   - 401 → tenta 1x o refresh token e repete a chamada; falhou → sessão cai
     (callback onSessaoExpirada) e o app volta pro Login.
   - Timeout por requisição + retry só em rede/5xx/429 (mesma disciplina
     do app do cliente; a borda deduplica mutações por idempotência própria
     do domínio — senha atômica/versions — então repetir GETs é seguro e
     mutações usam os padrões do backend).
   ============================================================ */

import { API_URL, TENANT } from './config.js';

export class ApiError extends Error {
  constructor(status, codigo, mensagem, corpo) {
    super(mensagem || codigo || 'Erro de API');
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.corpo = corpo;
    this.rede = status === 0;
  }
}

const TIMEOUT_MS = 10000;
const AUTH_KEY = 'sdp_auth';

// ---------- sessão ----------
let sessao = carregarSessao();
let aoExpirar = null;

function carregarSessao() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}
function salvarSessao(s) {
  sessao = s;
  try {
    if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* quota */ }
}

export function sessaoAtual() { return sessao; }
export function onSessaoExpirada(cb) { aoExpirar = cb; }
export function logout() { salvarSessao(null); }

// ---------- transporte ----------
async function requisicaoBruta(path, { method = 'GET', body, headers = {}, timeoutMs = TIMEOUT_MS } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(API_URL + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    const txt = await resp.text();
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    return { resp, json };
  } catch (err) {
    throw new ApiError(0, 'REDE', err?.name === 'AbortError' ? 'Tempo esgotado.' : 'Falha de conexão.');
  } finally {
    clearTimeout(timer);
  }
}

async function tentarRefresh() {
  if (!sessao?.refresh) return false;
  try {
    const { resp, json } = await requisicaoBruta('/auth/refresh', {
      method: 'POST',
      body: { refresh: sessao.refresh },
    });
    if (!resp.ok || !json?.token) return false;
    salvarSessao({ ...sessao, ...json });
    return true;
  } catch {
    return false;
  }
}

/**
 * Chamada autenticada. Em 401, tenta refresh 1x e repete; se o refresh falhar,
 * derruba a sessão e notifica o app.
 */
async function chamar(path, opts = {}, jaTentouRefresh = false) {
  const headers = { ...(opts.headers || {}) };
  if (sessao?.token) headers.Authorization = `Bearer ${sessao.token}`;

  const { resp, json } = await requisicaoBruta(path, { ...opts, headers });

  if (resp.ok) return json;

  if (resp.status === 401 && !jaTentouRefresh) {
    const ok = await tentarRefresh();
    if (ok) return chamar(path, opts, true);
    salvarSessao(null);
    aoExpirar?.();
  }
  throw new ApiError(resp.status, json?.codigo, json?.erro || `HTTP ${resp.status}`, json);
}

// ---------- API ----------
export const api = {
  // --- auth (público) ---
  async login(usuario, senha) {
    const { resp, json } = await requisicaoBruta('/auth/login', {
      method: 'POST',
      body: { tenantSlug: TENANT, usuario, senha },
    });
    if (!resp.ok) {
      throw new ApiError(resp.status, json?.codigo, json?.erro || 'Login inválido.', json);
    }
    salvarSessao(json); // { token, refresh, papel, expiraEm }
    return json;
  },

  // --- pedidos (PDV/painel) ---
  /** Snapshot do dia: { orders, painel:{sort,ultimaChamada,chamadaHist,version}, proximaSenha } */
  snapshot: () => chamar('/orders'),
  /** Cria pedido; senha/hora vêm do servidor. { pagamento, cliente, pago, items } */
  criarPedido: (dados) => chamar('/orders', { method: 'POST', body: dados }),
  marcarStatus: (senha, status) => chamar(`/orders/${senha}/status`, { method: 'PATCH', body: { status } }),
  togglePago: (senha) => chamar(`/orders/${senha}/pago`, { method: 'PATCH' }),
  entregar: (senha, receberAntes) => chamar(`/orders/${senha}/entrega`, { method: 'PATCH', body: { receberAntes } }),
  reordenarPainel: (sort, version) =>
    chamar('/panel/order', { method: 'PATCH', body: { sort }, headers: { 'If-Match': String(version) } }),
  /** Relatório agregado (gestão): { pedidos, faturamento, ticketMedio, aReceber, porDia, porPagamento, maisVendidos, eventos } */
  relatorio: (de, ate) => chamar(`/orders/relatorio?de=${de}&ate=${ate}`),

  // --- agendas ---
  listarAgendas: (filtro = {}) => {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v != null && v !== ''));
    const qs = q.toString();
    return chamar(`/agendas${qs ? `?${qs}` : ''}`);
  },
  // Cria um evento pela própria operação (origem 'gestao'). Body:
  // { nome, telefone, email?, tipo, pessoas, local, obs, data (YYYY-MM-DD), slot }.
  criarAgenda: (dados) => chamar('/agendas', { method: 'POST', body: dados }),
  orcarAgenda: (id, valor) => chamar(`/agendas/${id}/valor`, { method: 'PATCH', body: { valor } }),
  statusAgenda: (id, status, motivo) =>
    chamar(`/agendas/${id}/status`, { method: 'PATCH', body: motivo ? { status, motivo } : { status } }),

  // --- catálogo ---
  listarCatalogo: () => chamar('/catalogo'),
  criarItemCatalogo: (item) => chamar('/catalogo', { method: 'POST', body: item }),
  salvarItemCatalogo: (item) => chamar(`/catalogo/${item.id}`, { method: 'PUT', body: item }),
  excluirItemCatalogo: (id) => chamar(`/catalogo/${id}`, { method: 'DELETE' }),

  // --- dispo / config (fase 2 do painel) ---
  listarDispo: (mes) => chamar(`/dispo?mes=${mes}`),
  salvarDispo: (iso, dados) => chamar(`/dispo/${iso}`, { method: 'PUT', body: dados }),
  lerConfig: () => chamar('/config'),
  salvarConfig: (dados) => chamar('/config', { method: 'PUT', body: dados }),
  avaliacoes: (de, ate) => chamar(`/avaliacoes?de=${de}&ate=${ate}`),

  // --- usuários (gestão) ---
  listarUsuarios: () => chamar('/usuarios'),
  criarUsuario: (u) => chamar('/usuarios', { method: 'POST', body: u }),
  atualizarUsuario: (id, patch) => chamar(`/usuarios/${id}`, { method: 'PATCH', body: patch }),
  excluirUsuario: (id) => chamar(`/usuarios/${id}`, { method: 'DELETE' }),
};
