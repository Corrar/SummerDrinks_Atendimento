# SECURITY — Borda pública (app do cliente)

A borda `/public/:tenant/*` é o único ponto exposto ao mundo. Trate cada byte que
chega como hostil. Este documento é o gate de segurança da integração.

## Superfície exposta
| Rota | Método | Aceita | Devolve |
|---|---|---|---|
| `/public/:tenant/menu` | GET | — | itens (sem custo interno) |
| `/public/:tenant/disponibilidade` | GET | `?mes` | dias livres |
| `/public/:tenant/config` | GET | — | `{horarios,locais,contato}` (contato COMERCIAL do bar — ver nota de PII) |
| `/public/:tenant/pedidos` | POST | `{cliente,pagamento,pago,itens}` | `{token,senha,hora,status,total}` |
| `/public/:tenant/pedido/:token` | GET | token opaco | `{senha,status,hora,pago}` |
| `/public/:tenant/eventos` | POST | formulário completo | `{protocolo}` |
| `/public/:tenant/agenda/:protocolo` | GET | protocolo `SD-XXXXXX` | `{status,data,hora,valor,motivo_recusa}` (sem PII) |
| `/public/:tenant/pedido/:token/avaliacao` | POST | `{nota:1..5, comentario?}` | `{ok:true}` (token = prova de posse; só pedido entregue; 1 por pedido) |

## Controles por ameaça (OWASP)

- **A01 Broken Access Control** — nenhuma rota pública lê recurso por id interno.
  Pedido só é acessível pelo **token uuid opaco**; sem token, sem acesso.
  Tenant inexistente → 404 genérico (não revela existência).
- **A03 Injection** — 100% das queries parametrizadas (`$1..$n`). `id=ANY($2::text[])`
  para lote. `zod` rejeita payload malformado **antes** do domínio.
- **XSS persistido** — todo texto livre do cliente (`cliente,nome,tipo,local,obs`)
  passa por `semHtml` (remove `<>` e control chars) no schema. O que é gravado já
  está limpo.
- **Mass assignment** — `status`, `valor`, `origem`, `senha`, `preço`, `tenant`
  são **fixados no servidor**; nunca lidos do corpo. Preço do cliente é ignorado.
- **A04 Insecure Design / fraude de preço** — re-precificação obrigatória pelo
  catálogo. Divergência cliente×servidor é logada, não aceita.
- **Vazamento de PII** — `telefone` e `email` DO CLIENTE entram e são gravados,
  mas **nenhuma rota GET pública os retorna** e **nenhum log os imprime**. O menu
  público monta DTO explícito (sem custo, sem PII). DISTINÇÃO deliberada: o
  `contato` de `/public/:tenant/config` é o canal COMERCIAL do bar
  (telefone/whatsapp/email/instagram cadastrados pela gestão no painel para o
  cliente chamar o trailer) — publicado de propósito; não confundir com PII de
  cliente (`agenda.telefone/email`), que continua proibida na borda.
- **A05 Rate / DoS** — `express-rate-limit` por `IP+tenant`: pedido 20/min,
  evento 5/min → 429 com Retry-After. Body global ≤ 32 kb. Timeout de conexão no pool.
- **Idempotência / replay** — `X-Idempotency-Key` → `op_key` UNIQUE. Reenvio
  (retry de rede, duplo-toque, drenagem de outbox) devolve o mesmo pedido, nunca dois.
- **Realtime** — salas públicas são **read-only** e não exigem auth:
  `pedido:{token}` só emite `{senha,status,hora,pago}` de UM pedido;
  `tenant:{slug}:public` só emite `dispo:updated` (aviso de refetch, sem dado
  sensível). Sem broadcast cruzado entre clientes.
- **Segredos** — nada hardcoded. `.env` (JWT_SECRET, DATABASE_URL) fora do git.
  App do cliente só conhece `API_URL` + `TENANT` (públicos por natureza).

## Gate — checklist antes de promover a integração

- [ ] `POST /pedidos` com `itens[].p` adulterado → total usa **preço do servidor**.
- [ ] `POST /pedidos` com `id` inexistente → **422 ITEM_INVALIDO** (não cria pedido).
- [ ] Mesma `X-Idempotency-Key` reenviada → **mesmo token/senha** (200 replay).
- [ ] N pedidos concorrentes → senhas **sequenciais e únicas** (0 colisão, 0 buraco).
- [ ] `GET /pedido/:token` com token de outro pedido → só o **daquele** token.
- [ ] Nenhuma rota pública retorna `telefone`/`email` DE CLIENTE (agenda). O
      `contato` comercial de `/config` é allowlist exata. `grep` nos logs: 0 PII.
- [ ] `GET /agenda/:protocolo` devolve `motivo_recusa` só em `recusado`; nunca nome/telefone/email.
- [ ] `POST /eventos` acima do limite → **429** com Retry-After.
- [ ] `slug` inexistente → **404** genérico.
- [ ] Origem fora da allowlist de CORS → bloqueada.
- [ ] Payload > 32 kb → **413**.
- [ ] Avaliação: nota fora de 1..5 → **400**; pedido não entregue → **409**;
      segunda avaliação do mesmo token → **409**; comentário passa por `semHtml`.

## Pendências de segurança herdadas do ecossistema
- Rotacionar qualquer credencial exposta em chat (padrão Royale).
- Em produção: TLS na borda (Caddy/reverse proxy), `JWT_SECRET` forte, `ssl.rejectUnauthorized=true` (já ligado quando `isProd`).
