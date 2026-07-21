# Criar um login e acessar o sistema

O painel do atendimento usa **login + senha** guardados no banco (a senha vira
hash bcrypt — a senha em claro nunca é gravada). Para entrar pela primeira vez
você precisa criar **um usuário `gestao`** (acesso total). Depois, esse admin
pode criar os demais operadores dentro do próprio painel, em **Ajustes →
Usuários**.

## Pré-requisitos

- `DATABASE_URL` apontando para o seu Postgres/Neon (copie `.env.example` para
  `.env` e preencha), e `JWT_SECRET` com 32+ caracteres.
- Dependências instaladas: `npm install`.

## Passo 1 — aplicar as migrações (uma vez)

Cria as tabelas, incluindo `usuario`:

```bash
npm run migrate
```

## Passo 2 — criar o login

Há dois caminhos equivalentes. Use o que preferir.

### Opção A — script dedicado (recomendado para criar/redefinir qualquer login)

```bash
# npm run usuario:criar -- <login> <senha> [papel] [tenantSlug]
npm run usuario:criar -- admin 'SuaSenhaForte' gestao summer
```

Para **não deixar a senha no histórico do shell**, passe por variável de ambiente:

```bash
NOVO_LOGIN=admin NOVA_SENHA='SuaSenhaForte' npm run usuario:criar
```

- `papel`: `gestao` (acesso total) · `pdv` · `painel` — default `gestao`.
- `tenantSlug`: identificador do estabelecimento — default `summer`.
- Reexecutável: rodar de novo com o mesmo login **redefine a senha/papel**
  (útil se esquecer a senha). O tenant é criado automaticamente se não existir.

### Opção B — seed inicial (cria tenant + admin `admin`/`gestao` + catálogo demo)

```bash
SEED_ADMIN_SENHA='SuaSenhaForte' npm run seed
```

Cria o usuário fixo `admin` (papel `gestao`). Use isto só no primeiro boot de um
banco zerado; para bancos que já têm cardápio real, prefira a Opção A.

## Passo 3 — entrar

Abra o painel e informe o **login** e a **senha** que você acabou de definir. O
login não diferencia maiúsculas de minúsculas (`Admin` = `admin`).

## Criar mais operadores depois

Logado como `gestao`, vá em **Ajustes → Usuários** para adicionar/editar/remover
operadores sem precisar do terminal. Regra de segurança: sempre deve restar ao
menos **um** usuário `gestao` **ativo** — o sistema bloqueia rebaixar/desativar/
excluir o último admin.
