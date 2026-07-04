begin;

create table if not exists public.ponto_modalidade_acessos (
  id bigserial primary key,
  ponto_id bigint not null references public.pontos(id) on delete cascade,
  modalidade text not null,
  login text not null default '',
  senha text not null default '',
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  constraint ponto_modalidade_acessos_unico unique (ponto_id, modalidade),
  constraint ponto_modalidade_acessos_modalidade_check check (char_length(btrim(modalidade)) > 0)
);

create index if not exists ponto_modalidade_acessos_ponto_idx
  on public.ponto_modalidade_acessos (ponto_id);

alter table public.ponto_modalidade_acessos enable row level security;

drop policy if exists ponto_modalidade_acessos_admin_all on public.ponto_modalidade_acessos;
create policy ponto_modalidade_acessos_admin_all
on public.ponto_modalidade_acessos for all to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
)
with check (
  exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
);

drop policy if exists ponto_modalidade_acessos_gerente_select on public.ponto_modalidade_acessos;
create policy ponto_modalidade_acessos_gerente_select
on public.ponto_modalidade_acessos for select to authenticated
using (
  exists (
    select 1
    from public.pontos pt
    join public.perfis p on p.user_id = auth.uid()
    where pt.id = public.ponto_modalidade_acessos.ponto_id
      and p.perfil = 'gerente'
      and (
        pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
        or lower(coalesce(p.gerente_nome, '')) = lower(pt.gerente)
        or lower(coalesce(p.nome, '')) = lower(pt.gerente)
        or lower(coalesce(p.login_nome, '')) = lower(pt.gerente)
      )
  )
);

grant select, insert, update, delete on public.ponto_modalidade_acessos to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
