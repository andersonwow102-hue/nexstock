alter table public.fechamentos_rotas
  add column if not exists comissao_extra numeric(12, 2) not null default 0;
