<div align="center">

# 🍹 Summer Drinks · Atendimento

Backend e painel de atendimento do **Summer Drinks**, um trailer de drinks:
pedidos com senha no balcão, cardápio, agenda de eventos open bar e impressão
automática na cozinha.

![Node](https://img.shields.io/badge/Node-22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-tempo%20real-010101?style=flat-square&logo=socketdotio)
![Docker](https://img.shields.io/badge/Docker-Render-2496ED?style=flat-square&logo=docker&logoColor=white)

</div>

## 🧩 Como as peças se encaixam

```
 App do cliente (PWA)  ──►  borda pública /public/:tenant/*  ─┐
 SummerDrinks_Cliente                                         │
                                                              ▼
 Painel da equipe  ──── JWT ────►  API Express + Socket.IO  ──►  PostgreSQL
 painel/ (React)                   src/                          db/migrations
                                     │
 Agente de impressão  ◄── polling ───┘  ──►  impressora térmica (ESC/POS)
 agente-impressao/
```

O app do cliente fica em [Corrar/SummerDrinks_Cliente](https://github.com/Corrar/SummerDrinks_Cliente).
Este repositório tem a API, o painel da equipe e o agente de impressão.

## ✨ Funcionalidades

| Área | O que faz |
|---|---|
| **Pedidos** | Senha de balcão, status, pagamento e entrega, painel de senhas reordenável e relatório por período |
| **Cardápio** | Cadastro de itens com dose dupla ("dobrada") e QR code do cardápio |
| **Agenda de eventos** | Pedidos de open bar com o fluxo solicitado → agendado → confirmado/recusado, com valor e cardápio do evento |
| **Disponibilidade** | Calendário de datas livres para eventos |
| **Avaliações** | O cliente avalia o pedido de 1 a 5 |
| **Usuários e papéis** | `gestao` (acesso total), `pdv` e `painel` |
| **Borda pública** | API para o app do cliente: cardápio, disponibilidade, criar pedido (idempotente, preço recalculado no servidor), acompanhar pedido e agenda. Tem rate limit por IP |
| **Tempo real** | Socket.IO com salas por estabelecimento |
| **WhatsApp** | Avisa o cliente quando a agenda muda de estado (Green API, via fila de saída) |
| **Impressão** | O agente local imprime cada pedido novo na impressora térmica (ESC/POS pela rede) |

## 🛠️ Tecnologias

- **API**: Node 22, TypeScript (strict, ESM), Express 5, `pg`, Zod, JWT + bcrypt, Helmet, CORS e rate limit
- **Tempo real**: Socket.IO 4
- **Banco**: PostgreSQL (Neon), com migrações SQL aplicadas no boot
- **Painel**: React 18 + Vite
- **Testes**: Vitest + Supertest, mais scripts de *smoke test* contra banco real
- **Deploy**: Docker no Render (API) e Vercel (painel)

## 🚀 Como rodar

Pré-requisitos: Node 22+ e um PostgreSQL (o Neon tem plano gratuito).

```bash
npm install
cp .env.example .env              # preencha DATABASE_URL e JWT_SECRET (32+ caracteres)
npm run migrate                   # cria as tabelas
npm run usuario:criar -- admin 'SuaSenhaForte' gestao summer
npm run dev                       # API em modo watch
```

Painel da equipe (em outro terminal):

```bash
cd painel
npm install
cp .env.example .env              # VITE_API_URL e VITE_TENANT
npm run dev
```

O passo a passo do primeiro acesso está em [`ACESSO.md`](ACESSO.md).

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | API em modo desenvolvimento (tsx watch) |
| `npm run build` / `npm start` | compila e roda a versão de produção |
| `npm test` | testes (Vitest) |
| `npm run typecheck` | checagem de tipos |
| `npm run migrate` | aplica as migrações de `db/migrations` |
| `npm run seed` / `seed:menu` | dados iniciais / cardápio real |
| `npm run usuario:criar` | cria ou redefine um login |
| `npm run preflight` | testa a conexão com o banco |
| `npm run smoke*` | testes de ponta a ponta contra um banco real |

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | conexão com o PostgreSQL |
| `JWT_SECRET` | assinatura dos tokens (32+ caracteres) |
| `CORS_ORIGINS` | origens permitidas nas rotas privadas |
| `PUBLIC_RATE_*` / `AUTH_RATE_*` | limites de requisição da borda pública e do login |
| `NOTIF_DRIVER` / `GREEN_API_*` | envio de WhatsApp (`fake` para desenvolvimento) |
| `AUTO_MIGRATE` | `false` desliga as migrações automáticas no boot |

A lista completa, com valores de exemplo, está no [`.env.example`](.env.example).

## 📁 Estrutura

```
src/               # API: rotas, serviços, tempo real, notificações e banco
painel/            # painel da equipe (React + Vite)
agente-impressao/  # agente local da impressora térmica
db/migrations/     # SQL versionado (001 a 012)
scripts/           # migrações, seed, criação de usuário e smoke tests
tests/             # testes Vitest
```

## 📚 Documentação

- [`ACESSO.md`](ACESSO.md): primeiro login e criação de usuários
- [`INTEGRACAO-CONTRATO.md`](INTEGRACAO-CONTRATO.md): contrato REST e Socket.IO com o app do cliente
- [`SECURITY-BORDA.md`](SECURITY-BORDA.md): segurança da API pública (controles OWASP e checklist)
- [`agente-impressao/README.md`](agente-impressao/README.md): instalação do agente de impressão
