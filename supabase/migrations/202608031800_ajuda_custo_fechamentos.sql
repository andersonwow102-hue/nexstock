alter table public.fechamentos_rotas
  add column if not exists ajuda_custo numeric(12, 2) not null default 0;
