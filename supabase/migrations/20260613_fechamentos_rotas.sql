create table if not exists public.fechamentos_rotas (
  id bigserial primary key,
  gerente text not null,
  rota text not null,
  competencia text not null,
  dia text not null default '',
  modalidade text not null,
  entrada numeric(12,2) not null default 0,
  comissao numeric(12,2) not null default 0,
  saida numeric(12,2) not null default 0,
  saldo_bruto numeric(12,2) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (gerente, rota, competencia, dia, modalidade)
);

alter table public.fechamentos_rotas enable row level security;

drop policy if exists fechamentos_rotas_admin_all on public.fechamentos_rotas;
create policy fechamentos_rotas_admin_all
on public.fechamentos_rotas for all
to authenticated
using (public.perfil_atual() = 'administrador')
with check (public.perfil_atual() = 'administrador');
