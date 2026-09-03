begin;

create table public.despesas_mensais_edicoes (
  id bigint generated always as identity primary key,
  despesa_id bigint not null,
  competencia date not null,
  antes jsonb not null,
  depois jsonb not null,
  autor_user_id uuid not null references auth.users(id) on delete restrict,
  autor_nome_snapshot text not null,
  autor_perfil_snapshot text not null check (autor_perfil_snapshot = 'administrador'),
  criado_em timestamptz not null default now(),
  constraint despesas_mensais_edicoes_competencia_check
    check (competencia = date_trunc('month', competencia)::date),
  constraint despesas_mensais_edicoes_snapshot_check
    check (jsonb_typeof(antes) = 'object' and jsonb_typeof(depois) = 'object')
);

create index despesas_mensais_edicoes_despesa_idx
  on public.despesas_mensais_edicoes (despesa_id, criado_em desc);

alter table public.despesas_mensais_edicoes enable row level security;

create policy despesas_mensais_edicoes_admin_ler
on public.despesas_mensais_edicoes
for select
to authenticated
using (private.perfil_atual() = 'administrador');

revoke all on table public.despesas_mensais_edicoes from public, anon, authenticated;
grant select on table public.despesas_mensais_edicoes to authenticated;
grant all on table public.despesas_mensais_edicoes to service_role;
revoke all on sequence public.despesas_mensais_edicoes_id_seq from public, anon, authenticated;
grant all on sequence public.despesas_mensais_edicoes_id_seq to service_role;

create function private.auditar_edicao_despesa_mensal_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_autor_nome text;
  v_autor_perfil text;
begin
  if auth.uid() is null or private.perfil_atual() <> 'administrador' then
    return new;
  end if;

  select coalesce(nullif(btrim(nome), ''), 'Administrador'), perfil
    into v_autor_nome, v_autor_perfil
  from public.perfis
  where user_id = auth.uid();

  if v_autor_perfil is distinct from 'administrador' then
    raise exception 'Perfil administrativo não encontrado.' using errcode = '42501';
  end if;

  insert into public.despesas_mensais_edicoes (
    despesa_id, competencia, antes, depois,
    autor_user_id, autor_nome_snapshot, autor_perfil_snapshot
  ) values (
    old.id,
    old.competencia,
    jsonb_build_object(
      'ponto_id', old.ponto_id, 'gerente', old.gerente, 'rota', old.rota,
      'competencia', old.competencia, 'tipo', old.tipo,
      'descricao', old.descricao, 'valor_previsto', old.valor_previsto,
      'valor_real', old.valor_real, 'observacao', old.observacao
    ),
    jsonb_build_object(
      'ponto_id', new.ponto_id, 'gerente', new.gerente, 'rota', new.rota,
      'competencia', new.competencia, 'tipo', new.tipo,
      'descricao', new.descricao, 'valor_previsto', new.valor_previsto,
      'valor_real', new.valor_real, 'observacao', new.observacao
    ),
    auth.uid(), v_autor_nome, v_autor_perfil
  );

  return new;
end;
$function$;

revoke all on function private.auditar_edicao_despesa_mensal_admin() from public, anon, authenticated;

create trigger despesas_mensais_auditar_edicao_admin
after update on public.despesas_mensais
for each row execute function private.auditar_edicao_despesa_mensal_admin();

create or replace function public.editar_despesa_mensal_admin(
  p_despesa_id bigint,
  p_descricao text,
  p_valor_previsto numeric,
  p_valor_real numeric,
  p_observacao text
)
returns public.despesas_mensais
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_antes public.despesas_mensais%rowtype;
  v_depois public.despesas_mensais%rowtype;
begin
  if auth.uid() is null or private.perfil_atual() <> 'administrador' then
    raise exception 'Apenas administradores podem editar despesas consolidadas.' using errcode = '42501';
  end if;

  if nullif(btrim(p_descricao), '') is null then
    raise exception 'A descrição da despesa é obrigatória.' using errcode = '22023';
  end if;

  if p_valor_previsto is null or p_valor_previsto < 0
     or p_valor_real is null or p_valor_real < 0 then
    raise exception 'Os valores da despesa não podem ser negativos.' using errcode = '22023';
  end if;

  select * into v_antes
  from public.despesas_mensais
  where id = p_despesa_id
  for update;

  if not found then
    raise exception 'Despesa mensal não encontrada.' using errcode = 'P0002';
  end if;

  update public.despesas_mensais
  set descricao = btrim(p_descricao),
      valor_previsto = p_valor_previsto,
      valor_real = p_valor_real,
      observacao = coalesce(btrim(p_observacao), '')
  where id = v_antes.id
  returning * into v_depois;

  return v_depois;
end;
$function$;

revoke all on function public.editar_despesa_mensal_admin(bigint, text, numeric, numeric, text)
  from public, anon;
grant execute on function public.editar_despesa_mensal_admin(bigint, text, numeric, numeric, text)
  to authenticated, service_role;

commit;
