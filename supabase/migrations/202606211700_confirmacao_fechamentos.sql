alter table public.fechamentos_rotas
  add column if not exists gerente_visualizado_em timestamptz,
  add column if not exists gerente_visualizado_por uuid references auth.users(id),
  add column if not exists gerente_confirmado_em timestamptz,
  add column if not exists gerente_confirmado_por uuid references auth.users(id);

create or replace function public.registrar_visualizacao_fechamento(
  p_gerente text,
  p_rota text,
  p_competencia text,
  p_dia text default ''
)
returns setof public.fechamentos_rotas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'gerente'
      and (
        lower(coalesce(p.gerente_nome, '')) = lower(coalesce(p_gerente, ''))
        or lower(coalesce(p.nome, '')) = lower(coalesce(p_gerente, ''))
        or lower(coalesce(p.login_nome, '')) = lower(coalesce(p_gerente, ''))
      )
  ) then
    raise exception 'Acesso negado para registrar a visualização.' using errcode = '42501';
  end if;

  return query
  update public.fechamentos_rotas f
  set
    gerente_visualizado_em = coalesce(f.gerente_visualizado_em, now()),
    gerente_visualizado_por = coalesce(f.gerente_visualizado_por, auth.uid())
  where lower(f.gerente) = lower(p_gerente)
    and f.rota = p_rota
    and f.competencia = p_competencia
    and f.dia = coalesce(p_dia, '')
    and f.enviado_em is not null
  returning f.*;

  if not found then
    raise exception 'Fechamento enviado não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.confirmar_fechamento_gerente(
  p_gerente text,
  p_rota text,
  p_competencia text,
  p_dia text default ''
)
returns setof public.fechamentos_rotas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'gerente'
      and (
        lower(coalesce(p.gerente_nome, '')) = lower(coalesce(p_gerente, ''))
        or lower(coalesce(p.nome, '')) = lower(coalesce(p_gerente, ''))
        or lower(coalesce(p.login_nome, '')) = lower(coalesce(p_gerente, ''))
      )
  ) then
    raise exception 'Acesso negado para confirmar o fechamento.' using errcode = '42501';
  end if;

  return query
  update public.fechamentos_rotas f
  set
    gerente_confirmado_em = coalesce(f.gerente_confirmado_em, now()),
    gerente_confirmado_por = coalesce(f.gerente_confirmado_por, auth.uid())
  where lower(f.gerente) = lower(p_gerente)
    and f.rota = p_rota
    and f.competencia = p_competencia
    and f.dia = coalesce(p_dia, '')
    and f.enviado_em is not null
    and f.gerente_visualizado_em is not null
  returning f.*;

  if not found then
    raise exception 'Visualize o PDF antes de confirmar o fechamento.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.registrar_visualizacao_fechamento(text, text, text, text) from public;
revoke all on function public.confirmar_fechamento_gerente(text, text, text, text) from public;
grant execute on function public.registrar_visualizacao_fechamento(text, text, text, text) to authenticated;
grant execute on function public.confirmar_fechamento_gerente(text, text, text, text) to authenticated;

