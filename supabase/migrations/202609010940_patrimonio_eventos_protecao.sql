begin;

create table public.patrimonio_eventos (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  evento text not null,
  lote_id uuid references public.patrimonio_lotes(id) on delete restrict,
  patrimonio_id bigint references public.equipamentos_patrimonio(id) on delete restrict,
  equipamento_id bigint references public.equipamentos(id) on delete restrict,
  estado_anterior text,
  estado_posterior text,
  motivo text,
  detalhes jsonb not null default '{}'::jsonb,
  idempotencia uuid not null,
  idempotencia_payload jsonb not null,
  autor_user_id uuid not null,
  autor_nome_snapshot text not null,
  autor_perfil_snapshot text not null,
  criado_em timestamptz not null default now(),
  constraint patrimonio_eventos_evento_check check (
    evento in (
      'lote_preparado', 'lote_gerado', 'patrimonio_gerado', 'legado_importado',
      'etiquetas_emitidas', 'lote_iniciado', 'etiqueta_aplicada',
      'conferido', 'reimpressao', 'baixado', 'anulado',
      'lote_concluido', 'lote_cancelado'
    )
  ),
  constraint patrimonio_eventos_alvo_check check (
    (evento in (
      'lote_preparado', 'lote_gerado', 'etiquetas_emitidas', 'lote_iniciado',
      'lote_concluido', 'lote_cancelado'
    ) and lote_id is not null and patrimonio_id is null and equipamento_id is null)
    or
    (evento = 'legado_importado' and lote_id is null
      and patrimonio_id is not null and equipamento_id is not null)
    or
    (evento in (
      'patrimonio_gerado', 'etiqueta_aplicada', 'conferido', 'reimpressao',
      'baixado', 'anulado'
    ) and patrimonio_id is not null and equipamento_id is not null)
  ),
  constraint patrimonio_eventos_motivo_check check (
    motivo is null or char_length(btrim(motivo)) between 1 and 1000
  ),
  constraint patrimonio_eventos_detalhes_check check (jsonb_typeof(detalhes) = 'object'),
  constraint patrimonio_eventos_idempotencia_payload_check check (
    jsonb_typeof(idempotencia_payload) = 'object'
  ),
  constraint patrimonio_eventos_autoria_check check (
    autor_nome_snapshot = btrim(autor_nome_snapshot)
    and char_length(autor_nome_snapshot) between 1 and 200
    and autor_perfil_snapshot in ('administrador', 'operador', 'gerente', 'consulta')
  ),
  unique (autor_user_id, idempotencia)
);

create index patrimonio_eventos_lote_idx
  on public.patrimonio_eventos (lote_id, criado_em desc)
  where lote_id is not null;

create index patrimonio_eventos_patrimonio_idx
  on public.patrimonio_eventos (patrimonio_id, criado_em desc)
  where patrimonio_id is not null;

create index patrimonio_eventos_equipamento_idx
  on public.patrimonio_eventos (equipamento_id, criado_em desc)
  where equipamento_id is not null;

create or replace function private.patrimonio_exigir_contexto_rpc()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_proprietario name;
begin
  select r.rolname into v_proprietario
  from pg_catalog.pg_class c
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where c.oid = tg_relid;

  if current_user is distinct from v_proprietario
     or current_setting('stockon.patrimonio_rpc', true) is distinct from 'permitido' then
    raise exception 'Mutacao patrimonial permitida somente pelas RPCs canonicas.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.patrimonio_impedir_exclusao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  raise exception 'Registros patrimoniais sao permanentes e nao podem ser excluidos.'
    using errcode = '42501';
end;
$$;

create or replace function private.patrimonio_eventos_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  raise exception 'Eventos patrimoniais sao append-only.' using errcode = '42501';
end;
$$;

create or replace function private.patrimonio_validar_evento_alvo()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_equipamento_id bigint;
  v_lote_id uuid;
  v_origem text;
begin
  if new.patrimonio_id is null then
    if new.equipamento_id is not null then
      raise exception 'Evento de lote nao pode apontar para equipamento.' using errcode = '23514';
    end if;
    return new;
  end if;

  select ep.equipamento_id, ep.lote_id, ep.origem
  into v_equipamento_id, v_lote_id, v_origem
  from public.equipamentos_patrimonio ep
  where ep.id = new.patrimonio_id;

  if not found
     or new.equipamento_id is distinct from v_equipamento_id
     or new.lote_id is distinct from v_lote_id
     or (new.evento = 'patrimonio_gerado' and (v_origem <> 'gerado' or v_lote_id is null))
     or (new.evento = 'legado_importado' and (v_origem <> 'legado' or v_lote_id is not null)) then
    raise exception 'Alvos do evento nao correspondem ao patrimonio canonico.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.proteger_espelho_equipamento_patrimonio()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_proprietario name;
  v_alterou boolean;
begin
  v_alterou := case
    when tg_op = 'INSERT' then nullif(btrim(coalesce(new.patrimonio, '')), '') is not null
    else new.patrimonio is distinct from old.patrimonio
  end;

  if not v_alterou then
    return new;
  end if;

  select r.rolname into v_proprietario
  from pg_catalog.pg_class c
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where c.oid = tg_relid;

  if current_user is distinct from v_proprietario
     or current_setting('stockon.patrimonio_rpc', true) is distinct from 'permitido' then
    raise exception 'equipamentos.patrimonio e um espelho mantido somente pelas RPCs patrimoniais.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger patrimonio_lotes_somente_rpc
before insert or update on public.patrimonio_lotes
for each row execute function private.patrimonio_exigir_contexto_rpc();

create trigger patrimonio_lotes_sem_exclusao
before delete on public.patrimonio_lotes
for each row execute function private.patrimonio_impedir_exclusao();

create trigger patrimonio_lote_equipamentos_somente_rpc
before insert on public.patrimonio_lote_equipamentos
for each row execute function private.patrimonio_exigir_contexto_rpc();

create trigger patrimonio_lote_equipamentos_sem_exclusao
before delete on public.patrimonio_lote_equipamentos
for each row execute function private.patrimonio_impedir_exclusao();

create trigger equipamentos_patrimonio_somente_rpc
before insert or update on public.equipamentos_patrimonio
for each row execute function private.patrimonio_exigir_contexto_rpc();

create trigger equipamentos_patrimonio_sem_exclusao
before delete on public.equipamentos_patrimonio
for each row execute function private.patrimonio_impedir_exclusao();

create trigger patrimonio_eventos_somente_rpc
before insert on public.patrimonio_eventos
for each row execute function private.patrimonio_exigir_contexto_rpc();

create trigger patrimonio_eventos_alvo_coerente
before insert on public.patrimonio_eventos
for each row execute function private.patrimonio_validar_evento_alvo();

create trigger patrimonio_eventos_append_only
before update or delete on public.patrimonio_eventos
for each row execute function private.patrimonio_eventos_append_only();

drop trigger if exists proteger_espelho_equipamento_patrimonio on public.equipamentos;
create trigger proteger_espelho_equipamento_patrimonio
before insert or update of patrimonio on public.equipamentos
for each row execute function private.proteger_espelho_equipamento_patrimonio();

revoke all on function private.patrimonio_exigir_contexto_rpc() from public, anon, authenticated;
revoke all on function private.patrimonio_impedir_exclusao() from public, anon, authenticated;
revoke all on function private.patrimonio_eventos_append_only() from public, anon, authenticated;
revoke all on function private.patrimonio_validar_evento_alvo() from public, anon, authenticated;
revoke all on function private.proteger_espelho_equipamento_patrimonio() from public, anon, authenticated;

comment on function private.patrimonio_exigir_contexto_rpc() is
  'Invariante: RPC SECURITY DEFINER e tabelas protegidas devem compartilhar owner; o teste SQL valida esse acoplamento.';

comment on table public.patrimonio_eventos is
  'Trilha append-only. Autoria e idempotencia sao derivadas e persistidas pelo backend.';

commit;
