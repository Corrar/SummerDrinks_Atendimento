// Persistência de quais pedidos já foram impressos (evita reimprimir a cada
// polling e sobrevive a reinício do agente). Chave = "AAAA-MM-DD:senha".
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export function criarEstado(arquivo = 'impressos.json') {
  let set = new Set()
  if (existsSync(arquivo)) {
    try { set = new Set(JSON.parse(readFileSync(arquivo, 'utf8'))) } catch { /* começa limpo */ }
  }
  const dia = () => new Date().toISOString().slice(0, 10)
  const chave = (senha) => `${dia()}:${senha}`
  return {
    jaImpresso: (senha) => set.has(chave(senha)),
    marcar: (senha) => { set.add(chave(senha)); persistir() },
    // Marca tudo que já existe SEM imprimir (usado no 1º ciclo pra não cuspir o histórico).
    semImprimir: (senhas) => { for (const s of senhas) set.add(chave(s)); persistir() },
  }
  function persistir() {
    // Guarda só os últimos ~2000 pra não crescer sem fim.
    const arr = [...set].slice(-2000)
    try { writeFileSync(arquivo, JSON.stringify(arr)) } catch { /* best-effort */ }
  }
}
