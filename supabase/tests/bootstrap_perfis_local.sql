-- BOOTSTRAP EXCLUSIVO PARA TESTE LOCAL DESCARTAVEL.
-- NAO E MIGRATION DE PRODUCAO. NAO EXECUTAR EM PROJETOS REMOTOS.
-- Reproduz somente o contrato estrutural confirmado necessario a Fase 1.

create schema if not exists private;

create table public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  perfil text not null default 'consulta',
  criado_em timestamptz not null default now(),
  gerente_nome text default '',
  email_temporario boolean not null default false,
  email_temporario_expira_em timestamptz,
  login_nome text,
  rotas_permitidas text[] not null default '{}'::text[],
  constraint perfis_perfil_check check (perfil in ('administrador', 'operador', 'gerente', 'consulta'))
);

create unique index perfis_login_nome_lower_uidx
  on public.perfis (lower(login_nome))
  where nullif(btrim(login_nome), '') is not null;

alter table public.perfis enable row level security;

create or replace function private.gerente_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select gerente_nome from public.perfis where user_id = auth.uid()), '');
$$;

create or replace function private.perfil_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select perfil from public.perfis where user_id = auth.uid()), 'consulta');
$$;

grant usage on schema public, private to authenticated;
grant select on public.perfis to authenticated;
grant execute on function private.gerente_atual() to authenticated;
grant execute on function private.perfil_atual() to authenticated;

create policy perfis_ler_proprio
on public.perfis for select to authenticated
using (user_id = auth.uid());

create policy perfis_administrador_ler
on public.perfis for select to authenticated
using (private.perfil_atual() = 'administrador');

create policy perfis_administrador_inserir
on public.perfis for insert to authenticated
with check (private.perfil_atual() = 'administrador');

create policy perfis_administrador_atualizar
on public.perfis for update to authenticated
using (private.perfil_atual() = 'administrador')
with check (private.perfil_atual() = 'administrador');

create policy perfis_administrador_excluir
on public.perfis for delete to authenticated
using (private.perfil_atual() = 'administrador');

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.perfis (user_id, nome, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'consulta'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

create trigger criar_perfil_ao_cadastrar_usuario
after insert on auth.users
for each row
execute function public.criar_perfil_novo_usuario();

-- Cadastro publico e anonimo sao configuracoes externas do Supabase Auth.
-- Este bootstrap nao tenta reproduzir ou comprovar essas configuracoes.
