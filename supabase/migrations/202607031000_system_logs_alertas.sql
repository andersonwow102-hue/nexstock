-- Logs internos para erros e acoes criticas do Stock-ON.

create table if not exists public.system_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  nivel text not null default 'info',
  categoria text not null default 'frontend',
  acao text not null default '',
  mensagem text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  perfil text,
  gerente text,
  rota text,
  url text,
  user_agent text,
  contexto jsonb not null default '{}'::jsonb,
  erro_nome text,
  erro_mensagem text,
  erro_stack text,
  resolvido boolean not null default false,
  resolvido_em timestamptz,
  resolvido_por uuid references auth.users(id) on delete set null,
  constraint system_logs_nivel_check check (nivel in ('info', 'aviso', 'erro', 'critico'))
);

create index if not exists system_logs_created_at_idx on public.system_logs (created_at desc);
create index if not exists system_logs_nivel_idx on public.system_logs (nivel);
create index if not exists system_logs_categoria_idx on public.system_logs (categoria);
create index if not exists system_logs_user_id_idx on public.system_logs (user_id);
create index if not exists system_logs_contexto_gin_idx on public.system_logs using gin (contexto);

alter table public.system_logs enable row level security;

drop policy if exists system_logs_admin_operador_select on public.system_logs;
create policy system_logs_admin_operador_select
on public.system_logs
for select to authenticated
using (private.perfil_atual() in ('administrador', 'operador'));

drop policy if exists system_logs_admin_operador_update on public.system_logs;
create policy system_logs_admin_operador_update
on public.system_logs
for update to authenticated
using (private.perfil_atual() in ('administrador', 'operador'))
with check (private.perfil_atual() in ('administrador', 'operador'));

create or replace function public.registrar_system_log(
  p_nivel text default 'info',
  p_categoria text default 'frontend',
  p_acao text default '',
  p_mensagem text default '',
  p_contexto jsonb default '{}'::jsonb,
  p_erro_nome text default '',
  p_erro_mensagem text default '',
  p_erro_stack text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_log_id bigint;
  v_perfil text;
  v_gerente text;
  v_rota text;
  v_url text;
  v_user_agent text;
begin
  if auth.uid() is null then
    raise exception 'Acesso nao autenticado para registrar log.' using errcode = '42501';
  end if;

  v_perfil := private.perfil_atual();
  v_gerente := private.gerente_atual();
  v_rota := coalesce(p_contexto->>'rota', '');
  v_url := coalesce(p_contexto->>'url', '');
  v_user_agent := coalesce(p_contexto->>'userAgent', '');

  insert into public.system_logs (
    nivel,
    categoria,
    acao,
    mensagem,
    user_id,
    perfil,
    gerente,
    rota,
    url,
    user_agent,
    contexto,
    erro_nome,
    erro_mensagem,
    erro_stack
  )
  values (
    case when p_nivel in ('info', 'aviso', 'erro', 'critico') then p_nivel else 'info' end,
    left(coalesce(p_categoria, 'frontend'), 80),
    left(coalesce(p_acao, ''), 120),
    left(coalesce(p_mensagem, ''), 1000),
    auth.uid(),
    v_perfil,
    v_gerente,
    left(v_rota, 120),
    left(v_url, 300),
    left(v_user_agent, 500),
    coalesce(p_contexto, '{}'::jsonb),
    left(coalesce(p_erro_nome, ''), 120),
    left(coalesce(p_erro_mensagem, ''), 1000),
    left(coalesce(p_erro_stack, ''), 5000)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.registrar_system_log(text, text, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.registrar_system_log(text, text, text, text, jsonb, text, text, text) to authenticated, service_role;
