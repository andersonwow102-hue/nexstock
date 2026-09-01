begin;

create or replace function public.patrimonio_emitir_lote(
  p_lote_id uuid,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_lote public.patrimonio_lotes%rowtype;
  v_afetados integer;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode emitir lote.' using errcode = '42501';
  end if;
  if p_lote_id is null or p_idempotencia is null then
    raise exception 'Lote e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('etiquetas_emitidas', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado_lote_id; end if;

  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao is distinct from 'gerado' then
    raise exception 'Somente lote gerado pode ser emitido.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio ep
  set situacao = 'emitido', versao = versao + 1
  where ep.lote_id = p_lote_id and ep.situacao = 'gerado';
  get diagnostics v_afetados = row_count;
  if v_afetados <> v_lote.quantidade then
    raise exception 'Itens do lote nao estao integralmente gerados.' using errcode = '23514';
  end if;

  update public.patrimonio_lotes
  set situacao = 'emitido', emitido_em = now(),
      emitido_por_user_id = auth.uid(),
      emitido_por_nome_snapshot = v_identidade.usuario_nome,
      emitido_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = p_lote_id;

  perform private.patrimonio_registrar_evento(
    'etiquetas_emitidas', p_lote_id, null, 'gerado', 'emitido', null,
    jsonb_build_object('quantidade', v_lote.quantidade), p_idempotencia, v_payload
  );
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_iniciar_lote(
  p_lote_id uuid,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_lote public.patrimonio_lotes%rowtype;
  v_afetados integer;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode iniciar lote.' using errcode = '42501';
  end if;
  if p_lote_id is null or p_idempotencia is null then
    raise exception 'Lote e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_iniciado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado_lote_id; end if;

  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao is distinct from 'emitido' then
    raise exception 'Somente lote emitido pode ser iniciado.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio ep
  set situacao = 'em_aplicacao', versao = versao + 1
  where ep.lote_id = p_lote_id and ep.situacao = 'emitido';
  get diagnostics v_afetados = row_count;
  if v_afetados <> v_lote.quantidade then
    raise exception 'Itens do lote nao estao integralmente emitidos.' using errcode = '23514';
  end if;

  update public.patrimonio_lotes
  set situacao = 'em_aplicacao', iniciado_em = now(),
      iniciado_por_user_id = auth.uid(),
      iniciado_por_nome_snapshot = v_identidade.usuario_nome,
      iniciado_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = p_lote_id;

  perform private.patrimonio_registrar_evento(
    'lote_iniciado', p_lote_id, null, 'emitido', 'em_aplicacao', null,
    jsonb_build_object('quantidade', v_lote.quantidade), p_idempotencia, v_payload
  );
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_aplicar_etiqueta(
  p_patrimonio_public_id uuid,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_situacao_lote text;
  v_resultado uuid;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then
    raise exception 'Somente administrador ou operador pode aplicar etiqueta.' using errcode = '42501';
  end if;
  if p_patrimonio_public_id is null or p_idempotencia is null then
    raise exception 'Patrimonio e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('patrimonio_public_id', p_patrimonio_public_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('etiqueta_aplicada', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    select ep.public_id into v_resultado from public.equipamentos_patrimonio ep
    where ep.id = v_idempotencia.resultado_patrimonio_id;
    return v_resultado;
  end if;

  select * into v_patrimonio
  from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id
  for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao is distinct from 'em_aplicacao' then
    raise exception 'Etiqueta nao esta disponivel para aplicacao.' using errcode = '55000';
  end if;
  select l.situacao into v_situacao_lote from public.patrimonio_lotes l where l.id = v_patrimonio.lote_id;
  if v_situacao_lote is distinct from 'em_aplicacao' then
    raise exception 'Lote nao esta em aplicacao.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'aplicado', aplicado_em = now(),
      aplicado_por_user_id = auth.uid(),
      aplicado_por_nome_snapshot = v_identidade.usuario_nome,
      aplicado_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = v_patrimonio.id;

  perform private.patrimonio_registrar_evento(
    'etiqueta_aplicada', v_patrimonio.lote_id, v_patrimonio.id,
    'em_aplicacao', 'aplicado', null, '{}'::jsonb, p_idempotencia, v_payload
  );
  return v_patrimonio.public_id;
end;
$$;

create or replace function public.patrimonio_conferir_etiqueta(
  p_patrimonio_public_id uuid,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_situacao_lote text;
  v_resultado uuid;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then
    raise exception 'Somente administrador ou operador pode conferir etiqueta.' using errcode = '42501';
  end if;
  if p_patrimonio_public_id is null or p_idempotencia is null then
    raise exception 'Patrimonio e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('patrimonio_public_id', p_patrimonio_public_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('conferido', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    select ep.public_id into v_resultado from public.equipamentos_patrimonio ep
    where ep.id = v_idempotencia.resultado_patrimonio_id;
    return v_resultado;
  end if;

  select * into v_patrimonio
  from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id
  for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao is distinct from 'aplicado' then
    raise exception 'Somente etiqueta aplicada pode ser conferida.' using errcode = '55000';
  end if;
  select l.situacao into v_situacao_lote from public.patrimonio_lotes l where l.id = v_patrimonio.lote_id;
  if v_situacao_lote is distinct from 'em_aplicacao' then
    raise exception 'Lote nao esta em aplicacao.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'conferido', conferido_em = now(),
      conferido_por_user_id = auth.uid(),
      conferido_por_nome_snapshot = v_identidade.usuario_nome,
      conferido_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = v_patrimonio.id;

  perform private.patrimonio_registrar_evento(
    'conferido', v_patrimonio.lote_id, v_patrimonio.id,
    'aplicado', 'conferido', null, '{}'::jsonb, p_idempotencia, v_payload
  );
  return v_patrimonio.public_id;
end;
$$;

create or replace function public.patrimonio_reimprimir_etiqueta(
  p_patrimonio_public_id uuid,
  p_motivo text,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_resultado uuid;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode reimprimir etiqueta.' using errcode = '42501';
  end if;
  if p_patrimonio_public_id is null or p_idempotencia is null then
    raise exception 'Patrimonio e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Motivo da reimpressao deve ter ao menos 5 caracteres.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'patrimonio_public_id', p_patrimonio_public_id,
    'motivo', btrim(p_motivo)
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('reimpressao', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    select ep.public_id into v_resultado from public.equipamentos_patrimonio ep
    where ep.id = v_idempotencia.resultado_patrimonio_id;
    return v_resultado;
  end if;

  select * into v_patrimonio
  from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id
  for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao not in ('emitido', 'em_aplicacao', 'aplicado', 'conferido', 'legado') then
    raise exception 'Etiqueta nao pode ser reimpressa nesta situacao.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set reimpressoes = reimpressoes + 1, ultima_reimpressao_em = now(), versao = versao + 1
  where id = v_patrimonio.id;

  perform private.patrimonio_registrar_evento(
    'reimpressao', v_patrimonio.lote_id, v_patrimonio.id,
    v_patrimonio.situacao, v_patrimonio.situacao, btrim(p_motivo),
    jsonb_build_object('reimpressoes', v_patrimonio.reimpressoes + 1),
    p_idempotencia, v_payload
  );
  return v_patrimonio.public_id;
end;
$$;

create or replace function public.patrimonio_baixar(
  p_patrimonio_public_id uuid,
  p_motivo text,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_equipamento_id bigint;
  v_espelho text;
  v_resultado uuid;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode baixar patrimonio.' using errcode = '42501';
  end if;
  if p_patrimonio_public_id is null or p_idempotencia is null then
    raise exception 'Patrimonio e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Motivo da baixa deve ter ao menos 5 caracteres.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('patrimonio_public_id', p_patrimonio_public_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('baixado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    select ep.public_id into v_resultado from public.equipamentos_patrimonio ep
    where ep.id = v_idempotencia.resultado_patrimonio_id;
    return v_resultado;
  end if;

  select ep.equipamento_id into v_equipamento_id
  from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  select e.patrimonio into v_espelho from public.equipamentos e where e.id = v_equipamento_id for update;
  select * into v_patrimonio from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id for update;
  if v_patrimonio.situacao in ('baixado', 'anulado') then
    raise exception 'Patrimonio ja esta encerrado.' using errcode = '55000';
  end if;
  if btrim(coalesce(v_espelho, '')) is distinct from v_patrimonio.codigo then
    raise exception 'Espelho do equipamento diverge do registro canonico.' using errcode = '40001';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'baixado', baixado_em = now(),
      baixado_por_user_id = auth.uid(),
      baixado_por_nome_snapshot = v_identidade.usuario_nome,
      baixado_por_perfil_snapshot = v_identidade.perfil,
      motivo_baixa = btrim(p_motivo), versao = versao + 1
  where id = v_patrimonio.id;
  update public.equipamentos set patrimonio = '' where id = v_patrimonio.equipamento_id;

  perform private.patrimonio_registrar_evento(
    'baixado', v_patrimonio.lote_id, v_patrimonio.id,
    v_patrimonio.situacao, 'baixado', btrim(p_motivo), '{}', p_idempotencia, v_payload
  );
  return v_patrimonio.public_id;
end;
$$;

create or replace function public.patrimonio_anular(
  p_patrimonio_public_id uuid,
  p_motivo text,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_equipamento_id bigint;
  v_espelho text;
  v_resultado uuid;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode anular patrimonio.' using errcode = '42501';
  end if;
  if p_patrimonio_public_id is null or p_idempotencia is null then
    raise exception 'Patrimonio e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Motivo da anulacao deve ter ao menos 5 caracteres.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('patrimonio_public_id', p_patrimonio_public_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('anulado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    select ep.public_id into v_resultado from public.equipamentos_patrimonio ep
    where ep.id = v_idempotencia.resultado_patrimonio_id;
    return v_resultado;
  end if;

  select ep.equipamento_id into v_equipamento_id
  from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  select e.patrimonio into v_espelho from public.equipamentos e where e.id = v_equipamento_id for update;
  select * into v_patrimonio from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id for update;
  if v_patrimonio.situacao in ('baixado', 'anulado') then
    raise exception 'Patrimonio ja esta encerrado.' using errcode = '55000';
  end if;
  if btrim(coalesce(v_espelho, '')) is distinct from v_patrimonio.codigo then
    raise exception 'Espelho do equipamento diverge do registro canonico.' using errcode = '40001';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'anulado', anulado_em = now(),
      anulado_por_user_id = auth.uid(),
      anulado_por_nome_snapshot = v_identidade.usuario_nome,
      anulado_por_perfil_snapshot = v_identidade.perfil,
      motivo_anulacao = btrim(p_motivo), versao = versao + 1
  where id = v_patrimonio.id;
  update public.equipamentos set patrimonio = '' where id = v_patrimonio.equipamento_id;

  perform private.patrimonio_registrar_evento(
    'anulado', v_patrimonio.lote_id, v_patrimonio.id,
    v_patrimonio.situacao, 'anulado', btrim(p_motivo), '{}', p_idempotencia, v_payload
  );
  return v_patrimonio.public_id;
end;
$$;

create or replace function public.patrimonio_concluir_lote(
  p_lote_id uuid,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_lote public.patrimonio_lotes%rowtype;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode concluir lote.' using errcode = '42501';
  end if;
  if p_lote_id is null or p_idempotencia is null then
    raise exception 'Lote e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_concluido', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado_lote_id; end if;

  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao is distinct from 'em_aplicacao' then
    raise exception 'Somente lote em aplicacao pode ser concluido.' using errcode = '55000';
  end if;
  if (select count(*) from public.equipamentos_patrimonio ep where ep.lote_id = p_lote_id)
     is distinct from v_lote.quantidade::bigint
     or exists (
       select 1 from public.equipamentos_patrimonio ep
       where ep.lote_id = p_lote_id
         and ep.situacao not in ('conferido', 'baixado', 'anulado')
     ) then
    raise exception 'Todos os itens devem estar conferidos ou encerrados antes da conclusao.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_lotes
  set situacao = 'concluido', concluido_em = now(),
      concluido_por_user_id = auth.uid(),
      concluido_por_nome_snapshot = v_identidade.usuario_nome,
      concluido_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = p_lote_id;

  perform private.patrimonio_registrar_evento(
    'lote_concluido', p_lote_id, null, 'em_aplicacao', 'concluido', null,
    jsonb_build_object('quantidade', v_lote.quantidade), p_idempotencia, v_payload
  );
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_cancelar_lote(
  p_lote_id uuid,
  p_motivo text,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_lote public.patrimonio_lotes%rowtype;
  v_item record;
  v_ativos integer;
  v_espelho text;
  v_ativos_ids bigint[] := array[]::bigint[];
  v_ativos_estados text[] := array[]::text[];
  v_indice integer;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode cancelar lote.' using errcode = '42501';
  end if;
  if p_lote_id is null or p_idempotencia is null then
    raise exception 'Lote e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Motivo do cancelamento deve ter ao menos 5 caracteres.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('lote_id', p_lote_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(auth.uid()::text), pg_catalog.hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_cancelado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado_lote_id; end if;

  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao in ('concluido', 'cancelado') then
    raise exception 'Lote concluido ou cancelado nao pode ser cancelado novamente.' using errcode = '55000';
  end if;

  -- Mantem a mesma ordem de lock usada por baixa/anulacao: primeiro o
  -- equipamento, depois o registro canonico. Isso evita deadlock e garante que
  -- o estado anterior capturado para cada evento seja o estado ja confirmado
  -- por qualquer aplicacao/conferencia/baixa concorrente.
  perform 1
  from public.equipamentos e
  join public.equipamentos_patrimonio ep on ep.equipamento_id = e.id
  where ep.lote_id = p_lote_id
  order by e.id
  for update of e;

  for v_item in
    select ep.id, ep.equipamento_id, ep.codigo, ep.situacao
    from public.equipamentos_patrimonio ep
    where ep.lote_id = p_lote_id
      and ep.situacao not in ('baixado', 'anulado')
    order by ep.equipamento_id
    for update of ep
  loop
    select e.patrimonio into v_espelho
    from public.equipamentos e
    where e.id = v_item.equipamento_id;
    if btrim(coalesce(v_espelho, '')) is distinct from v_item.codigo then
      raise exception 'Espelho do equipamento % diverge do registro canonico.', v_item.equipamento_id
        using errcode = '40001';
    end if;
    v_ativos_ids := array_append(v_ativos_ids, v_item.id);
    v_ativos_estados := array_append(v_ativos_estados, v_item.situacao);
  end loop;

  select count(*) into v_ativos
  from public.equipamentos_patrimonio ep
  where ep.lote_id = p_lote_id
    and ep.situacao not in ('baixado', 'anulado');

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos e
  set patrimonio = ''
  from public.equipamentos_patrimonio ep
  where ep.lote_id = p_lote_id
    and ep.situacao not in ('baixado', 'anulado')
    and e.id = ep.equipamento_id;

  update public.equipamentos_patrimonio ep
  set situacao = 'anulado', anulado_em = now(),
      anulado_por_user_id = auth.uid(),
      anulado_por_nome_snapshot = v_identidade.usuario_nome,
      anulado_por_perfil_snapshot = v_identidade.perfil,
      motivo_anulacao = btrim(p_motivo), versao = versao + 1
  where ep.lote_id = p_lote_id
    and ep.situacao not in ('baixado', 'anulado');

  update public.patrimonio_lotes
  set situacao = 'cancelado', cancelado_em = now(), motivo_cancelamento = btrim(p_motivo),
      cancelado_por_user_id = auth.uid(),
      cancelado_por_nome_snapshot = v_identidade.usuario_nome,
      cancelado_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = p_lote_id;

  if v_ativos > 0 then
    for v_indice in 1..v_ativos loop
      perform private.patrimonio_registrar_evento(
        'anulado', p_lote_id, v_ativos_ids[v_indice], v_ativos_estados[v_indice],
        'anulado', btrim(p_motivo),
        jsonb_build_object('origem', 'cancelamento_lote'),
        gen_random_uuid(), jsonb_build_object('lote_id', p_lote_id, 'cancelamento', true)
      );
    end loop;
  end if;

  perform private.patrimonio_registrar_evento(
    'lote_cancelado', p_lote_id, null, v_lote.situacao, 'cancelado', btrim(p_motivo),
    jsonb_build_object('patrimonios_anulados', v_ativos), p_idempotencia, v_payload
  );
  return p_lote_id;
end;
$$;

revoke all on function public.patrimonio_emitir_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_iniciar_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_aplicar_etiqueta(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_conferir_etiqueta(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_reimprimir_etiqueta(uuid, text, uuid) from public, anon;
revoke all on function public.patrimonio_baixar(uuid, text, uuid) from public, anon;
revoke all on function public.patrimonio_anular(uuid, text, uuid) from public, anon;
revoke all on function public.patrimonio_concluir_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_cancelar_lote(uuid, text, uuid) from public, anon;

commit;
