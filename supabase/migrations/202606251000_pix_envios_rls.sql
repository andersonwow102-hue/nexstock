begin;

create table if not exists public.pix_chaves (
  id bigserial primary key,
  nome text not null,
  tipo text not null default 'Chave PIX',
  chave text not null,
  banco text not null default '',
  observacao text not null default '',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pix_chaves_nome_check check (char_length(btrim(nome)) > 0),
  constraint pix_chaves_chave_check check (char_length(btrim(chave)) > 0)
);

create table if not exists public.pix_envios (
  id bigserial primary key,
  pix_chave_id bigint references public.pix_chaves(id) on delete set null,
  pix_nome text not null,
  pix_tipo text not null default 'Chave PIX',
  pix_chave text not null,
  pix_banco text not null default '',
  gerente text not null,
  rota text not null default '',
  mensagem text not null default '',
  enviado_em timestamptz not null default now(),
  enviado_por uuid references auth.users(id),
  constraint pix_envios_pix_nome_check check (char_length(btrim(pix_nome)) > 0),
  constraint pix_envios_pix_chave_check check (char_length(btrim(pix_chave)) > 0),
  constraint pix_envios_gerente_check check (char_length(btrim(gerente)) > 0)
);

alter table public.pix_chaves
  add column if not exists tipo text not null default 'Chave PIX',
  add column if not exists banco text not null default '',
  add column if not exists observacao text not null default '',
  add column if not exists ativa boolean not null default true,
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists atualizado_em timestamptz not null default now();

alter table public.pix_envios
  add column if not exists pix_chave_id bigint references public.pix_chaves(id) on delete set null,
  add column if not exists pix_nome text not null default '',
  add column if not exists pix_tipo text not null default 'Chave PIX',
  add column if not exists pix_chave text not null default '',
  add column if not exists pix_banco text not null default '',
  add column if not exists gerente text not null default '',
  add column if not exists rota text not null default '',
  add column if not exists mensagem text not null default '',
  add column if not exists enviado_em timestamptz not null default now(),
  add column if not exists enviado_por uuid references auth.users(id);

create index if not exists pix_envios_gerente_rota_enviado_idx
  on public.pix_envios (lower(gerente), rota, enviado_em desc);

alter table public.pix_chaves enable row level security;
alter table public.pix_envios enable row level security;

drop policy if exists pix_chaves_admin_all on public.pix_chaves;
create policy pix_chaves_admin_all
on public.pix_chaves for all to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
)
with check (
  exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
);

drop policy if exists pix_envios_admin_all on public.pix_envios;
create policy pix_envios_admin_all
on public.pix_envios for all to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
)
with check (
  exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
);

drop policy if exists pix_envios_gerente_select on public.pix_envios;
create policy pix_envios_gerente_select
on public.pix_envios for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'gerente'
      and (
        lower(coalesce(p.gerente_nome, '')) = lower(public.pix_envios.gerente)
        or lower(coalesce(p.nome, '')) = lower(public.pix_envios.gerente)
        or lower(coalesce(p.login_nome, '')) = lower(public.pix_envios.gerente)
      )
      and (
        coalesce(public.pix_envios.rota, '') = ''
        or public.pix_envios.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
  )
);

grant select, insert, update, delete on public.pix_chaves to authenticated;
grant select, insert, update, delete on public.pix_envios to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
