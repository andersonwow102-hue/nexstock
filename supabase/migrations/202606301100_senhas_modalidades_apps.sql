begin;

create table if not exists public.gerente_modalidade_acessos (
  id bigserial primary key,
  gerente text not null,
  modalidade text not null,
  login text not null default '',
  senha text not null default '',
  link text not null default '',
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  constraint gerente_modalidade_acessos_unico unique (gerente, modalidade),
  constraint gerente_modalidade_acessos_gerente_check check (char_length(btrim(gerente)) > 0),
  constraint gerente_modalidade_acessos_modalidade_check check (char_length(btrim(modalidade)) > 0)
);

create table if not exists public.modalidade_apps (
  id bigserial primary key,
  modalidade text not null unique,
  app_nome text not null,
  storage_path text not null,
  tamanho bigint not null default 0,
  tipo text not null default 'application/vnd.android.package-archive',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  constraint modalidade_apps_modalidade_check check (char_length(btrim(modalidade)) > 0),
  constraint modalidade_apps_nome_check check (char_length(btrim(app_nome)) > 0),
  constraint modalidade_apps_path_check check (char_length(btrim(storage_path)) > 0)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'modalidade-apps',
  'modalidade-apps',
  false,
  157286400,
  array['application/vnd.android.package-archive', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.gerente_modalidade_acessos enable row level security;
alter table public.modalidade_apps enable row level security;

drop policy if exists gerente_modalidade_acessos_admin_all on public.gerente_modalidade_acessos;
create policy gerente_modalidade_acessos_admin_all
on public.gerente_modalidade_acessos for all to authenticated
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

drop policy if exists gerente_modalidade_acessos_gerente_select on public.gerente_modalidade_acessos;
create policy gerente_modalidade_acessos_gerente_select
on public.gerente_modalidade_acessos for select to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'gerente'
      and (
        lower(coalesce(p.gerente_nome, '')) = lower(public.gerente_modalidade_acessos.gerente)
        or lower(coalesce(p.nome, '')) = lower(public.gerente_modalidade_acessos.gerente)
        or lower(coalesce(p.login_nome, '')) = lower(public.gerente_modalidade_acessos.gerente)
      )
  )
);

drop policy if exists modalidade_apps_authenticated_select on public.modalidade_apps;
create policy modalidade_apps_authenticated_select
on public.modalidade_apps for select to authenticated
using (true);

drop policy if exists modalidade_apps_admin_all on public.modalidade_apps;
create policy modalidade_apps_admin_all
on public.modalidade_apps for all to authenticated
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

drop policy if exists modalidade_apps_storage_authenticated_select on storage.objects;
create policy modalidade_apps_storage_authenticated_select
on storage.objects for select to authenticated
using (bucket_id = 'modalidade-apps');

drop policy if exists modalidade_apps_storage_admin_insert on storage.objects;
create policy modalidade_apps_storage_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'modalidade-apps'
  and exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
);

drop policy if exists modalidade_apps_storage_admin_update on storage.objects;
create policy modalidade_apps_storage_admin_update
on storage.objects for update to authenticated
using (
  bucket_id = 'modalidade-apps'
  and exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
)
with check (
  bucket_id = 'modalidade-apps'
  and exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
);

drop policy if exists modalidade_apps_storage_admin_delete on storage.objects;
create policy modalidade_apps_storage_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'modalidade-apps'
  and exists (
    select 1 from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'administrador'
  )
);

grant select, insert, update, delete on public.gerente_modalidade_acessos to authenticated;
grant select, insert, update, delete on public.modalidade_apps to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
