-- 012_agenda_cardapio.sql — cardápio escolhido/montado pelo cliente na solicitação
-- de evento. Aditiva e idempotente. Texto livre (nome de um preset "Cardápios de
-- evento" OU a lista montada pelo cliente). Aparece no card da solicitação no painel.
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS cardapio text NOT NULL DEFAULT '';
