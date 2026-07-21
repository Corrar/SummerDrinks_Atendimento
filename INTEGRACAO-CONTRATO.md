# Contrato de comunicação — Atendimento ↔ Web do Cliente

Fonte única da verdade do protocolo entre os dois sistemas. Vale para os dois
repositórios (`SummerDrinks_Atendimento` = servidor; `SummerDrinks_Cliente` =
app). Mudou um lado? Atualize este arquivo e rode `tests/contrato-cliente.test.ts`
(guarda automático contra drift de contrato).

```
┌───────────────────────────┐        HTTPS (borda pública /public/:tenant/*)        ┌──────────────────────────┐
│   Web do Cliente (PWA)     │  ─────────────  REST  ───────────────────────────▶   │  Atendimento (backend)   │
│   React/Vite               │  ◀───────  Socket.IO (salas públicas)  ───────────   │  Express + PG + Socket   │
│   src/lib/api.js           │                                                      │  src/http/routes/public  │
│   src/lib/realtime.js      │        painel da gestão fala pela API autenticada    │  src/realtime/io.ts      │
└───────────────────────────┘                                                      └──────────────────────────┘
```

Modelo de confiança (zero-trust): preço, senha, status, valor, total e tenant são
**sempre** do servidor. O app manda referência (nunca valor). O `token` de pedido
(uuid opaco) é a prova de posse: acompanha status e autoriza a avaliação.

## 1. REST — borda pública (sem JWT)

Base do app: `${VITE_API_URL}/public/${VITE_TENANT}` (ex.: `https://…onrender.com/public/summer`).

| Ação (app) | Método | Path | Envia | Recebe |
|---|---|---|---|---|
| `getMenu()` | GET | `/menu` | — | `[{ id, n, p, v, d, cat, color, img }]` (id = `catalogoId__idx`) |
| `getDisponibilidade(mes)` | GET | `/disponibilidade?mes=YYYY-MM` | — | `{ mes, dias: { 'YYYY-MM-DD': {tarde,noite,madrugada} } }` |
| `getConfig()` | GET | `/config` | — | `{ horarios, locais, contato:{telefone,whatsapp,email,instagram} }` |
| `criarPedido(p, idem)` | POST | `/pedidos` | `{ cliente, pagamento:'pix'\|'cartao'\|'especie', pago, itens:[{id,qty,p?}] }` + `X-Idempotency-Key` | `201 { token, senha, hora, status, pago, total }` (200 em replay) |
| `statusPedido(token)` | GET | `/pedido/:token` | token uuid | `{ senha, status, hora, pago }` |
| `avaliarPedido(token, a)` | POST | `/pedido/:token/avaliacao` | `{ nota:1..5, comentario? }` | `201 { ok:true }` (só pedido entregue; 1 por pedido) |
| `criarEvento(p, idem)` | POST | `/eventos` | `{ nome, telefone, email?, tipo, pessoas, local?, obs?, data, slot:'Tarde'\|'Noite'\|'Madrugada' }` | `202 { protocolo:'SD-XXXXXX' }` |
| `statusAgenda(protocolo)` | GET | `/agenda/:protocolo` | `SD-XXXXXX` | `{ status, data, hora, valor, motivo_recusa }` |

Erros de domínio: `TOKEN_INVALIDO`/`PROTOCOLO_INVALIDO` (400), `TENANT_NAO_ENCONTRADO`/
`PEDIDO_NAO_ENCONTRADO`/`AGENDA_NAO_ENCONTRADA` (404 genérico), `ITEM_INVALIDO` (422),
`PEDIDO_NAO_ENTREGUE`/`AVALIACAO_EXISTENTE` (409), `RATE_LIMIT` (429).

Idempotência: `X-Idempotency-Key` (uuid) reutilizada em todo retry/drenagem de outbox
→ o servidor deduplica (`op_key` UNIQUE no pedido; PK por token na avaliação).

## 2. Socket.IO — tempo real (salas públicas, read-only)

O app conecta em `VITE_API_URL` com `query`:

| Sala | Como entrar | Evento recebido | Payload |
|---|---|---|---|
| Disponibilidade | `query.tenantPublico = <slug>` | `dispo:updated` | (aviso — o app refaz o GET fresco) |
| Status do pedido | `query.pedidoToken = <token>` | `pedido:status` | `{ senha, status, hora, pago }` |

Push do status de pedido: quando a gestão muda status/entrega (`PATCH /orders/:senha/status`
e `/entrega`), `orders.ts → notificarCliente → emitirStatusPedido(token, …)`. O
**polling** (`GET /pedido/:token`, 6s) continua como rede de segurança se o socket cair.

Evento privado (só sala autenticada da gestão, não vai ao cliente): `order:*`,
`agenda:updated`, `catalogo:updated`, `config:updated`, `avaliacao:created`.

## 3. Notificação de saída (Atendimento → cliente, WhatsApp)

Mudança de estado de agenda com `origem='app_cliente'` grava na `outbox`; o
`OutboxWorker` renderiza e envia via `GreenApiTransport` (WhatsApp) quando
`NOTIF_DRIVER=green`. Só eventos/agenda usam este canal (pedido não coleta telefone).

## 4. Wiring de ambiente (quem aponta para quem)

| Onde | Variável | Valor |
|---|---|---|
| App (Vercel) | `VITE_API_URL` | URL pública do backend (Render) |
| App (Vercel) | `VITE_TENANT` | slug do tenant (`summer`) |
| Backend (Render) | `CORS_ORIGINS` | domínio(s) do app (CSV; inclui o domínio Vercel do PWA) |
| Backend (Render) | `GREEN_API_ID_INSTANCE` / `GREEN_API_TOKEN` | credenciais Green API (só se `NOTIF_DRIVER=green`) |

O CORS do HTTP e do Socket.IO usa a MESMA allowlist (`env.corsOrigins`). Sem o
domínio do app no `CORS_ORIGINS`, o navegador bloqueia as chamadas — é o passo de
fiação mais fácil de esquecer no deploy.

## 5. Guarda automático

`tests/contrato-cliente.test.ts` (backend) valida os payloads EXATOS que o app
envia contra os schemas zod da borda e as traduções da ACL. Rode-o quando mexer
em `src/types/schemas-publicos.ts`, `src/types/acl.ts`, `src/lib/api.js` (app) ou
nos hooks de rede do app.
