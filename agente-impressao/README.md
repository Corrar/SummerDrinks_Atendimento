# Agente de impressão — Tanca TP-620 (impressão automática)

Imprime **automaticamente** o comprovante de cada pedido novo (do PDV **e** do
app do cliente) na impressora térmica **Tanca TP-620+**, com **corte parcial** —
o papel sai quase 100% cortado, grudado só por uma pontinha no centro.

É um programa Node pequeno que roda num **PC/mini-PC na mesma rede da
impressora** (no caixa). Ele faz login no backend, acompanha os pedidos do dia e
manda os comandos ESC/POS pra Tanca.

```
  Backend (Render)  ──HTTP──►  Agente (PC no caixa)  ──TCP:9100──►  Tanca TP-620
        ▲                                                         (rede/Ethernet)
   PDV + app do cliente criam pedidos
```

## Por que um agente, e não o navegador?

O navegador da página de Atendimento **não** consegue mandar comandos de corte
pra impressora nem imprimir sem abrir a janela de impressão. Quem fala ESC/POS
com a Tanca é este agente, rodando na rede local. O backend está na nuvem
(Render) e não enxerga a impressora da sua rede — por isso o agente fica local.

## Requisitos

- Node.js 18+ no PC do caixa.
- Tanca TP-620 com **IP fixo na rede** (Ethernet) — anote o IP (ex.: `192.168.0.50`).
- Um usuário no sistema pro agente (Ajustes → Usuários), papel `pdv` ou `gestao`.

## Configurar

1. Copie `.env.example` para `.env` e preencha:
   - `IMPRESSORA_HOST` = IP da Tanca na rede; `IMPRESSORA_PORT` = `9100`.
   - `API_URL` / `TENANT` do seu backend.
   - `PRINTER_USER` / `PRINTER_PASS` do usuário do agente.
2. Teste **sem imprimir** (mostra a prévia do ticket):
   ```bash
   npm run teste:ticket      # gera saida-teste.bin + prévia em ASCII
   npm run teste             # testes do gerador ESC/POS (corte parcial etc.)
   ```
3. Rode pra valer:
   ```bash
   npm start
   ```
   No 1º ciclo ele marca os pedidos já existentes como "vistos" e passa a
   imprimir só os **novos**. Cada pedido é impresso uma vez (guardado em
   `impressos.json`).

### Achar o IP da impressora
Imprima o autoteste da Tanca (segure o FEED ao ligar) — sai o IP configurado.
Deixe-o **fixo** (no menu da impressora ou por reserva de DHCP no roteador).

## Corte parcial

Padrão `CORTE=parcial` → comando `GS V B` (feed + corte parcial): o ticket sai
grudado só no centro, fácil de destacar. Opções: `total` (corta inteiro) ou
`nenhum` (só avança o papel, sem cortar).

## Rodar sempre (serviço)

- **Windows:** use o Agendador de Tarefas ("Ao iniciar o computador" → `npm start`
  na pasta) ou [nssm](https://nssm.cc/) pra virar serviço.
- **Linux:** um serviço `systemd` apontando pra `node src/index.js` com `Restart=always`.
- Alternativa multiplataforma: `pm2 start src/index.js --name impressao`.

## Bobina 58mm

Se a bobina for 58mm em vez de 80mm, use `COLUNAS=32` no `.env`.

## Alternativa: USB (sem agente de rede)

Se preferir a Tanca por **USB** num PC:
- Instale o driver Tanca, marque **corte parcial** nas preferências da impressora.
- Abra a página de Atendimento no Chrome em modo quiosque com impressão
  silenciosa: `chrome --kiosk --kiosk-printing`, com a Tanca como impressora
  padrão. Aí o `window.print()` do comprovante sai direto, sem diálogo.
- Nesse caminho o corte é definido pelo **driver** (não pelo `GS V B`); o layout
  do ticket é o mesmo já mostrado na tela do PDV.

O caminho de rede (este agente) é o mais confiável pra impressão automática e
para garantir o corte parcial por comando.
