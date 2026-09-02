begin;

create table public.patrimonio_operacoes_idempotentes (
  autor_user_id uuid not null,
  chave uuid not null,
  operacao text not null,
  payload jsonb not null,
  resultado jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (autor_user_id, chave),
  constraint patrimonio_operacoes_operacao_check check (
    operacao ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint patrimonio_operacoes_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint patrimonio_operacoes_resultado_check check (jsonb_typeof(resultado) = 'object')
);

create table public.patrimonio_eventos (
  id bigint generated always as identity primary key,
  evento_public_id uuid not null default gen_random_uuid() unique,
  evento text not null,
  campanha_id uuid references public.patrimonio_campanhas(id) on delete restrict,
  campanha_item_id uuid references public.patrimonio_campanha_equipamentos(id) on delete restrict,
  lote_id uuid references public.patrimonio_lotes(id) on delete restrict,
  patrimonio_id bigint references public.equipamentos_patrimonio(id) on delete restrict,
  legado_id bigint references public.equipamentos_patrimonio_legados(id) on delete restrict,
  equipamento_id bigint references public.equipamentos(id) on delete set null,
  equipamento_id_snapshot bigint,
  estado_anterior text,
  estado_posterior text,
  motivo text,
  detalhes jsonb not null default '{}'::jsonb,
  idempotencia uuid not null,
  autor_user_id uuid not null,
  autor_nome_snapshot text not null,
  autor_perfil_snapshot text not null,
  criado_em timestamptz not null default now(),
  constraint patrimonio_eventos_evento_check check (
    evento in (
      'campanha_criada', 'campanha_item_excecao', 'campanha_concluida', 'campanha_cancelada',
      'lote_preparado', 'lote_gerado', 'lote_impresso', 'lote_iniciado',
      'lote_concluido', 'lote_cancelado', 'patrimonio_gerado',
      'patrimonio_vinculado', 'vinculo_corrigido', 'etiqueta_aplicada',
      'patrimonio_conferido', 'etiqueta_reimpressa', 'patrimonio_anulado',
      'patrimonio_baixado', 'legado_importado',
      'equipamento_cadastrado_com_patrimonio', 'equipamento_cadastrado_sem_patrimonio'
    )
  ),
  constraint patrimonio_eventos_alvo_check check (
    num_nonnulls(campanha_id, campanha_item_id, lote_id, patrimonio_id, legado_id, equipamento_id_snapshot) >= 1
  ),
  constraint patrimonio_eventos_equipamento_check check (
    (equipamento_id is null and equipamento_id_snapshot is null)
    or
    (equipamento_id is not null and equipamento_id_snapshot = equipamento_id)
    or
    (equipamento_id is null and equipamento_id_snapshot is not null)
  ),
  constraint patrimonio_eventos_motivo_check check (
    motivo is null or char_length(btrim(motivo)) between 1 and 1000
  ),
  constraint patrimonio_eventos_detalhes_check check (jsonb_typeof(detalhes) = 'object'),
  constraint patrimonio_eventos_autoria_check check (
    autor_nome_snapshot = btrim(autor_nome_snapshot)
    and char_length(autor_nome_snapshot) between 1 and 200
    and autor_perfil_snapshot in ('administrador', 'operador', 'gerente')
  ),
  constraint patrimonio_eventos_idempotencia_fk
    foreign key (autor_user_id, idempotencia)
    references public.patrimonio_operacoes_idempotentes(autor_user_id, chave)
    on delete restrict deferrable initially deferred
);

create index patrimonio_eventos_campanha_idx
  on public.patrimonio_eventos (campanha_id, criado_em desc)
  where campanha_id is not null;

create index patrimonio_eventos_lote_idx
  on public.patrimonio_eventos (lote_id, criado_em desc)
  where lote_id is not null;

create index patrimonio_eventos_patrimonio_idx
  on public.patrimonio_eventos (patrimonio_id, criado_em desc)
  where patrimonio_id is not null;

create index patrimonio_eventos_equipamento_idx
  on public.patrimonio_eventos (equipamento_id_snapshot, criado_em desc)
  where equipamento_id_snapshot is not null;

create or replace function private.patrimonio_exigir_contexto_rpc()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_proprietario name;
  v_alteracao_fk_permitida boolean := false;
begin
  if tg_op = 'UPDATE' and tg_table_name in (
    'patrimonio_campanha_equipamentos',
    'equipamentos_patrimonio_legados'
  ) then
    v_alteracao_fk_permitida := old.equipamento_id is not null
      and new.equipamento_id is null
      and (to_jsonb(new) - 'equipamento_id') = (to_jsonb(old) - 'equipamento_id');
  end if;

  if v_alteracao_fk_permitida then
    return new;
  end if;

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
  if tg_op = 'UPDATE'
     and old.equipamento_id is not null
     and new.equipamento_id is null
     and (to_jsonb(new) - 'equipamento_id') = (to_jsonb(old) - 'equipamento_id') then
    return new;
  end if;
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
begin
  if new.patrimonio_id is not null then
    select ep.equipamento_id into v_equipamento_id
    from public.equipamentos_patrimonio ep
    where ep.id = new.patrimonio_id;
    if not found then
      raise exception 'Patrimonio do evento nao encontrado.' using errcode = '23514';
    end if;
    if new.equipamento_id_snapshot is not null
       and new.equipamento_id_snapshot is distinct from v_equipamento_id then
      raise exception 'Equipamento do evento nao corresponde ao patrimonio.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.patrimonio_validar_transicao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.public_id is distinct from old.public_id
     or new.numero is distinct from old.numero
     or new.codigo is distinct from old.codigo
     or new.origem is distinct from old.origem
     or new.lote_origem_id is distinct from old.lote_origem_id
     or new.criado_por_user_id is distinct from old.criado_por_user_id
     or new.criado_por_nome_snapshot is distinct from old.criado_por_nome_snapshot
     or new.criado_por_perfil_snapshot is distinct from old.criado_por_perfil_snapshot
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Identidade, origem e autoria inicial do patrimonio sao imutaveis.'
      using errcode = '23514';
  end if;

  if old.situacao = 'baixado'
     and new.situacao = 'baixado'
     and new.reimpressoes = old.reimpressoes + 1
     and new.ultima_reimpressao_em is not null
     and new.versao = old.versao + 1
     and (to_jsonb(new) - array['reimpressoes', 'ultima_reimpressao_em', 'versao'])
       = (to_jsonb(old) - array['reimpressoes', 'ultima_reimpressao_em', 'versao']) then
    return new;
  end if;
  if old.situacao in ('anulado', 'baixado') then
    raise exception 'Patrimonio terminal nao pode ser alterado fora da reimpressao excepcional de baixado.' using errcode = '55000';
  end if;

  if not (
    new.situacao = old.situacao
    or (old.situacao = 'disponivel' and new.situacao in ('vinculado', 'anulado'))
    or (old.situacao = 'vinculado' and new.situacao in ('aplicado', 'anulado'))
    or (old.situacao = 'aplicado' and new.situacao in ('vinculado', 'conferido', 'anulado'))
    or (old.situacao = 'conferido' and new.situacao = 'baixado')
  ) then
    raise exception 'Transicao patrimonial invalida: % -> %.', old.situacao, new.situacao
      using errcode = '55000';
  end if;

  if new.equipamento_id is distinct from old.equipamento_id
     or new.campanha_item_id is distinct from old.campanha_item_id then
    if not (
      (old.situacao = 'disponivel' and new.situacao = 'vinculado')
      or (old.situacao in ('vinculado', 'aplicado') and new.situacao = old.situacao)
      or (old.situacao = 'aplicado' and new.situacao = 'vinculado')
    ) then
      raise exception 'Vinculo patrimonial nao pode mudar nesta transicao.' using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.patrimonio_validar_lote_transicao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.numero is distinct from old.numero
     or new.codigo is distinct from old.codigo
     or new.campanha_id is distinct from old.campanha_id
     or new.quantidade is distinct from old.quantidade
     or new.contexto is distinct from old.contexto
     or new.saldo_pendente_no_preparo is distinct from old.saldo_pendente_no_preparo
     or new.quantidade_excedente is distinct from old.quantidade_excedente
     or new.excesso_confirmado is distinct from old.excesso_confirmado
     or new.criado_por_user_id is distinct from old.criado_por_user_id
     or new.criado_por_nome_snapshot is distinct from old.criado_por_nome_snapshot
     or new.criado_por_perfil_snapshot is distinct from old.criado_por_perfil_snapshot
     or new.preparado_em is distinct from old.preparado_em then
    raise exception 'Identidade e planejamento do lote sao imutaveis.' using errcode = '23514';
  end if;
  if old.situacao in ('concluido', 'cancelado') then
    raise exception 'Lote terminal nao pode ser alterado.' using errcode = '55000';
  end if;
  if not (
    new.situacao = old.situacao
    or (old.situacao = 'preparado' and new.situacao in ('gerado', 'cancelado'))
    or (old.situacao = 'gerado' and new.situacao in ('em_uso', 'concluido'))
    or (old.situacao = 'em_uso' and new.situacao = 'concluido')
  ) then
    raise exception 'Transicao de lote invalida: % -> %.', old.situacao, new.situacao
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.patrimonio_validar_campanha_transicao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.codigo is distinct from old.codigo
     or new.nome is distinct from old.nome
     or new.data_corte is distinct from old.data_corte
     or new.quantidade_snapshot is distinct from old.quantidade_snapshot
     or new.criado_por_user_id is distinct from old.criado_por_user_id
     or new.criado_por_nome_snapshot is distinct from old.criado_por_nome_snapshot
     or new.criado_por_perfil_snapshot is distinct from old.criado_por_perfil_snapshot
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Identidade e snapshot da campanha sao imutaveis.' using errcode = '23514';
  end if;
  if old.situacao in ('concluida', 'cancelada') then
    raise exception 'Campanha terminal nao pode ser alterada.' using errcode = '55000';
  end if;
  if not (new.situacao = old.situacao or (old.situacao = 'ativa' and new.situacao in ('concluida', 'cancelada'))) then
    raise exception 'Transicao de campanha invalida: % -> %.', old.situacao, new.situacao
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.patrimonio_validar_item_campanha_transicao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if old.equipamento_id is not null
     and new.equipamento_id is null
     and (to_jsonb(new) - 'equipamento_id') = (to_jsonb(old) - 'equipamento_id') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.campanha_id is distinct from old.campanha_id
     or new.equipamento_id is distinct from old.equipamento_id
     or new.equipamento_id_snapshot is distinct from old.equipamento_id_snapshot
     or new.categoria_codigo_snapshot is distinct from old.categoria_codigo_snapshot
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Identidade e pertencimento do snapshot de campanha sao imutaveis.'
      using errcode = '23514';
  end if;
  if old.resolucao in ('conferido', 'excecao') then
    raise exception 'Item de campanha resolvido nao pode ser alterado.' using errcode = '55000';
  end if;
  if not (
    new.resolucao = old.resolucao
    or (old.resolucao = 'pendente' and new.resolucao in ('conferido', 'excecao'))
  ) then
    raise exception 'Transicao de item de campanha invalida: % -> %.', old.resolucao, new.resolucao
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.patrimonio_proteger_cadastro_equipamento()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_novo_patrimoniavel boolean;
  v_antigo_patrimoniavel boolean;
begin
  select c.patrimoniavel into v_novo_patrimoniavel
  from public.equipamento_categorias c
  where c.ativo and lower(btrim(c.nome)) = lower(btrim(coalesce(new.categoria, '')));
  if not found then
    raise exception 'Categoria desconhecida; cadastro patrimonial falhou fechado.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.categoria is distinct from old.categoria then
    select c.patrimoniavel into v_antigo_patrimoniavel
    from public.equipamento_categorias c
    where c.ativo and lower(btrim(c.nome)) = lower(btrim(coalesce(old.categoria, '')));
    if not found or v_antigo_patrimoniavel is distinct from v_novo_patrimoniavel then
      raise exception 'Mudanca entre categoria patrimoniavel e nao patrimoniavel exige fluxo administrativo futuro.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.patrimonio_proteger_campo_legado()
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
  if not v_alterou then return new; end if;

  select r.rolname into v_proprietario
  from pg_catalog.pg_class c
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where c.oid = tg_relid;
  if current_user is distinct from v_proprietario
     or current_setting('stockon.patrimonio_legado_manutencao', true) is distinct from 'permitido' then
    raise exception 'equipamentos.patrimonio e referencia legada somente leitura.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger patrimonio_campanhas_somente_rpc
before insert or update on public.patrimonio_campanhas
for each row execute function private.patrimonio_exigir_contexto_rpc();
create trigger patrimonio_campanhas_transicao
before update on public.patrimonio_campanhas
for each row execute function private.patrimonio_validar_campanha_transicao();
create trigger patrimonio_campanhas_sem_exclusao
before delete on public.patrimonio_campanhas
for each row execute function private.patrimonio_impedir_exclusao();

create trigger patrimonio_campanha_equipamentos_somente_rpc
before insert or update on public.patrimonio_campanha_equipamentos
for each row execute function private.patrimonio_exigir_contexto_rpc();
create trigger patrimonio_campanha_equipamentos_transicao
before update on public.patrimonio_campanha_equipamentos
for each row execute function private.patrimonio_validar_item_campanha_transicao();
create trigger patrimonio_campanha_equipamentos_sem_exclusao
before delete on public.patrimonio_campanha_equipamentos
for each row execute function private.patrimonio_impedir_exclusao();

create trigger patrimonio_lotes_somente_rpc
before insert or update on public.patrimonio_lotes
for each row execute function private.patrimonio_exigir_contexto_rpc();
create trigger patrimonio_lotes_transicao
before update on public.patrimonio_lotes
for each row execute function private.patrimonio_validar_lote_transicao();
create trigger patrimonio_lotes_sem_exclusao
before delete on public.patrimonio_lotes
for each row execute function private.patrimonio_impedir_exclusao();

create trigger equipamentos_patrimonio_somente_rpc
before insert or update on public.equipamentos_patrimonio
for each row execute function private.patrimonio_exigir_contexto_rpc();
create trigger equipamentos_patrimonio_transicao
before update on public.equipamentos_patrimonio
for each row execute function private.patrimonio_validar_transicao();
create trigger equipamentos_patrimonio_sem_exclusao
before delete on public.equipamentos_patrimonio
for each row execute function private.patrimonio_impedir_exclusao();

create trigger equipamentos_patrimonio_legados_somente_rpc
before insert or update on public.equipamentos_patrimonio_legados
for each row execute function private.patrimonio_exigir_contexto_rpc();
create trigger equipamentos_patrimonio_legados_sem_exclusao
before delete on public.equipamentos_patrimonio_legados
for each row execute function private.patrimonio_impedir_exclusao();

create trigger patrimonio_operacoes_somente_rpc
before insert or update on public.patrimonio_operacoes_idempotentes
for each row execute function private.patrimonio_exigir_contexto_rpc();
create trigger patrimonio_operacoes_sem_exclusao
before delete on public.patrimonio_operacoes_idempotentes
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

create trigger patrimonio_cadastro_equipamento_atomico
before insert or update of categoria on public.equipamentos
for each row execute function private.patrimonio_proteger_cadastro_equipamento();

create trigger patrimonio_campo_legado_somente_leitura
before insert or update of patrimonio on public.equipamentos
for each row execute function private.patrimonio_proteger_campo_legado();

revoke all on function private.patrimonio_exigir_contexto_rpc() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_impedir_exclusao() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_eventos_append_only() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_validar_evento_alvo() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_validar_transicao() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_validar_lote_transicao() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_validar_campanha_transicao() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_validar_item_campanha_transicao() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_proteger_cadastro_equipamento() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_proteger_campo_legado() from public, anon, authenticated, service_role;

comment on table public.patrimonio_eventos is
  'Trilha append-only com autoria derivada de auth e alvos estruturados; o ID atual do equipamento pode virar NULL sem perder o snapshot.';
comment on column public.patrimonio_eventos.evento_public_id is
  'Identificador tecnico do evento; nao pertence ao namespace de deep links patrimoniais.';
comment on table public.patrimonio_operacoes_idempotentes is
  'Registro interno de request/result por usuario e chave. Nao e exposto ao frontend.';

commit;
