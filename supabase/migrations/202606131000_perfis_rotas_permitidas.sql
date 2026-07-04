alter table if exists public.perfis
  add column if not exists rotas_permitidas text[] not null default '{}';

comment on column public.perfis.rotas_permitidas is
  'Rotas liberadas para perfil gerente. Vazio significa usar todas as rotas do gerente vinculado.';
