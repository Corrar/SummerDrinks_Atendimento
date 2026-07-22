// Cliente HTTP mínimo do agente: login por usuário/senha e leitura do snapshot
// de pedidos do dia. Usa o fetch nativo do Node (18+). O token expira; o loop
// re-loga quando toma 401.
export function criarApi({ apiUrl, tenant }) {
  let token = null

  async function login(usuario, senha) {
    const r = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tenantSlug: tenant, usuario, senha }),
    })
    if (!r.ok) throw new Error(`login falhou (HTTP ${r.status})`)
    const j = await r.json()
    token = j.token
    return j
  }

  // Snapshot do dia: { orders:[{senha,hora,pagamento,cliente,pago,items:[...]}], painel, proximaSenha }
  async function getOrders() {
    const r = await fetch(`${apiUrl}/orders`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (r.status === 401) { const e = new Error('não autenticado'); e.status = 401; throw e }
    if (!r.ok) throw new Error(`GET /orders falhou (HTTP ${r.status})`)
    return r.json()
  }

  return { login, getOrders, get temToken() { return !!token } }
}
