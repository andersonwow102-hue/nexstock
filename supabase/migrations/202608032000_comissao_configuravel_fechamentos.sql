alter table public.fechamentos_rotas
  add column if not exists comissao_automatica boolean not null default true,
  add column if not exists percentual_comissao numeric(7, 4) not null default 0;
