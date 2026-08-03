alter table public.fechamentos_rotas
  add column if not exists subtrair_despesas_play_bet numeric(12, 2) not null default 0;
