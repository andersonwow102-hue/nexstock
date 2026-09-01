begin;

create or replace function private.patrimonio_identidade_atual()
returns table (
  user_id uuid,
  perfil text,
  usuario_nome text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    p.user_id,
    p.perfil,
    coalesce(
      nullif(btrim(p.nome), ''),
      nullif(btrim(p.login_nome), ''),
      nullif(btrim(p.gerente_nome), ''),
      p.perfil
    )
  from public.perfis p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function private.patrimonio_idempotencia_obter(
  p_evento text,
  p_idempotencia uuid,
  p_payload jsonb
)
returns table (
  encontrado boolean,
  resultado_lote_id uuid,
  resultado_patrimonio_id bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_evento public.patrimonio_eventos%rowtype;
begin
  select e.* into v_evento
  from public.patrimonio_eventos e
  where e.autor_user_id = auth.uid()
    and e.idempotencia = p_idempotencia;

  if not found then
    return query select false, null::uuid, null::bigint;
    return;
  end if;

  if v_evento.evento is distinct from p_evento
     or v_evento.idempotencia_payload is distinct from p_payload then
    raise exception 'Chave de idempotencia reutilizada com operacao ou dados diferentes.'
      using errcode = '22023';
  end if;

  return query select true, v_evento.lote_id, v_evento.patrimonio_id;
end;
$$;

create or replace function private.patrimonio_registrar_evento(
  p_evento text,
  p_lote_id uuid,
  p_patrimonio_id bigint,
  p_estado_anterior text,
  p_estado_posterior text,
  p_motivo text,
  p_detalhes jsonb,
  p_idempotencia uuid,
  p_idempotencia_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_evento_id bigint;
  v_equipamento_id bigint;
begin
  select * into v_identidade from private.patrimonio_identidade_atual();
  if auth.uid() is null or v_identidade.user_id is null then
    raise exception 'Acesso nao autenticado ou sem perfil.' using errcode = '42501';
  end if;

  if p_patrimonio_id is not null then
    select ep.equipamento_id into v_equipamento_id
    from public.equipamentos_patrimonio ep
    where ep.id = p_patrimonio_id;
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.patrimonio_eventos (
    evento, lote_id, patrimonio_id, equipamento_id,
    estado_anterior, estado_posterior, motivo, detalhes,
    idempotencia, idempotencia_payload,
    autor_user_id, autor_nome_snapshot, autor_perfil_snapshot
  ) values (
    p_evento, p_lote_id, p_patrimonio_id, v_equipamento_id,
    p_estado_anterior, p_estado_posterior, nullif(btrim(coalesce(p_motivo, '')), ''),
    coalesce(p_detalhes, '{}'::jsonb), p_idempotencia, p_idempotencia_payload,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  ) returning id into v_evento_id;

  return v_evento_id;
end;
$$;

create or replace function private.patrimonio_validar_equipamento_lote(
  p_equipamento_id bigint
)
returns table (
  equipamento_id bigint,
  equipamento_nome text,
  categoria_codigo text,
  categoria_nome text,
  localizacao text,
  ponto_id bigint,
  patrimonio_espelho text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_categoria_origem text;
  v_patrimoniavel boolean;
  v_pontos bigint;
  v_status text;
begin
  select
    e.id,
    coalesce(e.nome, ''),
    coalesce(btrim(e.localizacao), ''),
    coalesce(e.patrimonio, ''),
    e.categoria,
    e.status
  into
    equipamento_id,
    equipamento_nome,
    localizacao,
    patrimonio_espelho,
    v_categoria_origem,
    v_status
  from public.equipamentos e
  where e.id = p_equipamento_id;

  if not found then
    raise exception 'Equipamento % nao encontrado.', p_equipamento_id using errcode = 'P0002';
  end if;

  select c.codigo, c.nome, c.patrimoniavel
  into categoria_codigo, categoria_nome, v_patrimoniavel
  from public.equipamento_categorias c
  where c.ativo
    and lower(btrim(c.nome)) = lower(btrim(coalesce(v_categoria_origem, '')));

  if not found then
    raise exception 'Categoria desconhecida para o equipamento %.', p_equipamento_id
      using errcode = '23514';
  end if;
  if not v_patrimoniavel then
    raise exception 'A categoria Maquina de Brindes nao e patrimoniavel.'
      using errcode = '23514';
  end if;

  if v_status is distinct from 'Em rota' or localizacao = '' then
    ponto_id := null;
  else
    select count(*), min(p.id)
    into v_pontos, ponto_id
    from public.pontos p
    where lower(btrim(p.nome_fantasia)) = lower(localizacao);

    if v_pontos <> 1 then
      raise exception 'Localizacao do equipamento % nao corresponde exatamente a um ponto.', p_equipamento_id
        using errcode = '23514';
    end if;
  end if;

  return next;
end;
$$;

create or replace function private.patrimonio_proximo_numero_np()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_numero bigint;
  v_codigo text;
begin
  loop
    v_numero := nextval('public.patrimonio_np_seq'::regclass);
    v_codigo := 'NP-' || lpad(v_numero::text, 6, '0');
    exit when not exists (
      select 1
      from public.equipamentos_patrimonio ep
      where ep.numero = v_numero or ep.codigo = v_codigo
    );
  end loop;
  return v_numero;
end;
$$;

revoke all on function private.patrimonio_identidade_atual() from public, anon, authenticated;
revoke all on function private.patrimonio_idempotencia_obter(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.patrimonio_registrar_evento(text, uuid, bigint, text, text, text, jsonb, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.patrimonio_validar_equipamento_lote(bigint) from public, anon, authenticated;
revoke all on function private.patrimonio_proximo_numero_np() from public, anon, authenticated;

create or replace function public.patrimonio_preparar_lote(
  p_equipamento_ids bigint[],
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
  v_lote_id uuid;
  v_lote_numero bigint;
  v_lote_codigo text;
  v_equipamento_id bigint;
  v_item record;
  v_validado record;
  v_quantidade integer;
begin
  if auth.uid() is null then
    raise exception 'Acesso nao autenticado.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode preparar lote patrimonial.' using errcode = '42501';
  end if;
  if p_idempotencia is null then
    raise exception 'Chave de idempotencia obrigatoria.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('equipamento_ids', to_jsonb(p_equipamento_ids));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(auth.uid()::text),
    pg_catalog.hashtext(p_idempotencia::text)
  );
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_preparado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    return v_idempotencia.resultado_lote_id;
  end if;

  v_quantidade := cardinality(p_equipamento_ids);
  if v_quantidade is null or v_quantidade not between 1 and 500 then
    raise exception 'Informe entre 1 e 500 equipamentos.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_equipamento_ids) u(id) where u.id is null) then
    raise exception 'A lista de equipamentos nao aceita identificador nulo.' using errcode = '22023';
  end if;
  if v_quantidade <> (select count(distinct u.id) from unnest(p_equipamento_ids) u(id)) then
    raise exception 'A lista de equipamentos nao aceita repeticoes.' using errcode = '22023';
  end if;

  for v_equipamento_id in
    select distinct u.id from unnest(p_equipamento_ids) u(id) order by u.id
  loop
    perform e.id from public.equipamentos e
    where e.id = v_equipamento_id
    for update;
    if not found then
      raise exception 'Equipamento % nao encontrado.', v_equipamento_id using errcode = 'P0002';
    end if;
  end loop;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  v_lote_numero := nextval('public.patrimonio_lote_seq'::regclass);
  v_lote_codigo := 'PAT-' || to_char(current_date, 'YYYYMM') || '-'
    || lpad(v_lote_numero::text, 4, '0');
  insert into public.patrimonio_lotes (
    numero, codigo, origem, quantidade,
    criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
  ) values (
    v_lote_numero, v_lote_codigo, 'novo', v_quantidade,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  ) returning id into v_lote_id;

  for v_item in
    select u.id as equipamento_id, u.ordem::integer as ordem
    from unnest(p_equipamento_ids) with ordinality u(id, ordem)
    order by u.ordem
  loop
    select * into v_validado
    from private.patrimonio_validar_equipamento_lote(v_item.equipamento_id);

    if exists (
      select 1 from public.equipamentos_patrimonio ep
      where ep.equipamento_id = v_item.equipamento_id
        and ep.situacao not in ('baixado', 'anulado')
    ) then
      raise exception 'Equipamento % ja possui patrimonio ativo.', v_item.equipamento_id
        using errcode = '23505';
    end if;
    if nullif(btrim(coalesce(v_validado.patrimonio_espelho, '')), '') is not null then
      raise exception 'Equipamento % possui patrimonio legado ainda nao importado.', v_item.equipamento_id
        using errcode = '55000';
    end if;

    insert into public.patrimonio_lote_equipamentos (
      lote_id, equipamento_id, ordem, equipamento_nome_snapshot,
      categoria_codigo_snapshot, categoria_nome_snapshot,
      localizacao_snapshot, ponto_id_snapshot
    ) values (
      v_lote_id, v_item.equipamento_id, v_item.ordem, v_validado.equipamento_nome,
      v_validado.categoria_codigo, v_validado.categoria_nome,
      v_validado.localizacao, v_validado.ponto_id
    );
  end loop;

  perform private.patrimonio_registrar_evento(
    'lote_preparado', v_lote_id, null, null, 'preparado', null,
    jsonb_build_object('quantidade', v_quantidade),
    p_idempotencia, v_payload
  );
  return v_lote_id;
end;
$$;

create or replace function public.patrimonio_gerar_lote(
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
  v_item record;
  v_validado record;
  v_numero bigint;
  v_codigo text;
  v_patrimonio_id bigint;
  v_afetados integer;
begin
  if auth.uid() is null then
    raise exception 'Acesso nao autenticado.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode gerar lote patrimonial.' using errcode = '42501';
  end if;
  if p_lote_id is null or p_idempotencia is null then
    raise exception 'Lote e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(auth.uid()::text),
    pg_catalog.hashtext(p_idempotencia::text)
  );
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_gerado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    return v_idempotencia.resultado_lote_id;
  end if;

  select * into v_lote
  from public.patrimonio_lotes l
  where l.id = p_lote_id
  for update;
  if not found then
    raise exception 'Lote nao encontrado.' using errcode = 'P0002';
  end if;
  if v_lote.situacao is distinct from 'preparado' then
    raise exception 'Somente lote preparado pode ser gerado.' using errcode = '55000';
  end if;
  if (select count(*) from public.patrimonio_lote_equipamentos le where le.lote_id = p_lote_id)
     is distinct from v_lote.quantidade::bigint then
    raise exception 'Lote incompleto; nenhum numero foi reservado.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.patrimonio_lote_equipamentos le
    where le.lote_id = p_lote_id and le.equipamento_id is null
  ) then
    raise exception 'Equipamento removido depois da preparacao; nenhum numero NP foi reservado.'
      using errcode = 'P0002';
  end if;

  for v_item in
    select le.equipamento_id
    from public.patrimonio_lote_equipamentos le
    where le.lote_id = p_lote_id
    order by le.equipamento_id
  loop
    perform e.id from public.equipamentos e
    where e.id = v_item.equipamento_id
    for update;
  end loop;

  for v_item in
    select le.*
    from public.patrimonio_lote_equipamentos le
    where le.lote_id = p_lote_id
    order by le.ordem
  loop
    select * into v_validado
    from private.patrimonio_validar_equipamento_lote(v_item.equipamento_id);

    if v_validado.categoria_codigo is distinct from v_item.categoria_codigo_snapshot
       or lower(btrim(v_validado.localizacao)) is distinct from lower(btrim(v_item.localizacao_snapshot))
       or v_validado.ponto_id is distinct from v_item.ponto_id_snapshot then
      raise exception 'Equipamento % mudou apos a preparacao; nenhum numero foi reservado.', v_item.equipamento_id
        using errcode = '40001';
    end if;
    if exists (
      select 1 from public.equipamentos_patrimonio ep
      where ep.equipamento_id = v_item.equipamento_id
        and ep.situacao not in ('baixado', 'anulado')
    ) then
      raise exception 'Equipamento % ja possui patrimonio ativo.', v_item.equipamento_id
        using errcode = '23505';
    end if;
    if nullif(btrim(coalesce(v_validado.patrimonio_espelho, '')), '') is not null then
      raise exception 'Equipamento % possui patrimonio legado ainda nao importado.', v_item.equipamento_id
        using errcode = '55000';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('stockon'),
    pg_catalog.hashtext('patrimonio_codigo')
  );
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);

  for v_item in
    select le.*
    from public.patrimonio_lote_equipamentos le
    where le.lote_id = p_lote_id
    order by le.ordem
  loop
    v_numero := private.patrimonio_proximo_numero_np();
    v_codigo := 'NP-' || lpad(v_numero::text, 6, '0');

    insert into public.equipamentos_patrimonio (
      codigo, numero, equipamento_id, lote_id, origem, situacao,
      equipamento_nome_snapshot, categoria_codigo_snapshot, categoria_nome_snapshot,
      localizacao_snapshot, ponto_id_snapshot,
      criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
    ) values (
      v_codigo, v_numero, v_item.equipamento_id, p_lote_id, 'gerado', 'gerado',
      v_item.equipamento_nome_snapshot, v_item.categoria_codigo_snapshot, v_item.categoria_nome_snapshot,
      v_item.localizacao_snapshot, v_item.ponto_id_snapshot,
      auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
    ) returning id into v_patrimonio_id;

    update public.equipamentos e
    set patrimonio = v_codigo
    where e.id = v_item.equipamento_id
      and nullif(btrim(coalesce(e.patrimonio, '')), '') is null;
    get diagnostics v_afetados = row_count;
    if v_afetados <> 1 then
      raise exception 'Espelho do equipamento % mudou durante a geracao.', v_item.equipamento_id
        using errcode = '40001';
    end if;

    perform private.patrimonio_registrar_evento(
      'patrimonio_gerado', p_lote_id, v_patrimonio_id, null, 'gerado', null,
      jsonb_build_object('codigo', v_codigo, 'numero', v_numero),
      gen_random_uuid(), jsonb_build_object('lote_id', p_lote_id, 'codigo', v_codigo)
    );
  end loop;

  update public.patrimonio_lotes
  set situacao = 'gerado', gerado_em = now(),
      gerado_por_user_id = auth.uid(),
      gerado_por_nome_snapshot = v_identidade.usuario_nome,
      gerado_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = p_lote_id;

  perform private.patrimonio_registrar_evento(
    'lote_gerado', p_lote_id, null, 'preparado', 'gerado', null,
    jsonb_build_object('quantidade', v_lote.quantidade),
    p_idempotencia, v_payload
  );
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_importar_legado(
  p_equipamento_id bigint,
  p_codigo text,
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
  v_codigo text;
  v_patrimonio_id bigint;
  v_public_id uuid;
  v_equipamento_nome text;
  v_categoria_origem text;
  v_categoria_codigo text;
  v_categoria_nome text;
  v_localizacao text;
  v_patrimonio_espelho text;
  v_ponto_id bigint;
  v_pontos bigint;
begin
  if auth.uid() is null then
    raise exception 'Acesso nao autenticado.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode importar patrimonio legado.' using errcode = '42501';
  end if;
  if p_equipamento_id is null or p_idempotencia is null then
    raise exception 'Equipamento e chave de idempotencia sao obrigatorios.' using errcode = '22023';
  end if;
  v_codigo := btrim(coalesce(p_codigo, ''));
  if char_length(v_codigo) not between 1 and 80 then
    raise exception 'Codigo legado invalido.' using errcode = '22023';
  end if;
  if upper(v_codigo) ~ '^NP-[0-9]{6}$' then
    raise exception 'O padrao NP-000001 e reservado para geracao canonica.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('equipamento_id', p_equipamento_id, 'codigo', v_codigo);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(auth.uid()::text),
    pg_catalog.hashtext(p_idempotencia::text)
  );
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('legado_importado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    select ep.public_id into v_public_id
    from public.equipamentos_patrimonio ep
    where ep.id = v_idempotencia.resultado_patrimonio_id;
    return v_public_id;
  end if;

  select
    coalesce(e.nome, ''), e.categoria, coalesce(btrim(e.localizacao), ''), coalesce(e.patrimonio, '')
  into v_equipamento_nome, v_categoria_origem, v_localizacao, v_patrimonio_espelho
  from public.equipamentos e
  where e.id = p_equipamento_id
  for update;
  if not found then
    raise exception 'Equipamento nao encontrado.' using errcode = 'P0002';
  end if;

  select c.codigo, c.nome
  into v_categoria_codigo, v_categoria_nome
  from public.equipamento_categorias c
  where c.ativo
    and lower(btrim(c.nome)) = lower(btrim(coalesce(v_categoria_origem, '')));
  if not found then
    raise exception 'Categoria desconhecida para o equipamento legado.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.equipamento_id = p_equipamento_id
      and ep.situacao not in ('baixado', 'anulado')
  ) then
    raise exception 'Equipamento ja possui patrimonio ativo.' using errcode = '23505';
  end if;
  if nullif(btrim(v_patrimonio_espelho), '') is null then
    raise exception 'Importacao legada exige espelho atual nao vazio no equipamento.' using errcode = '22023';
  end if;
  if btrim(v_patrimonio_espelho) is distinct from v_codigo then
    raise exception 'Codigo informado difere do espelho legado do equipamento.' using errcode = '22023';
  end if;

  select count(*), min(p.id) into v_pontos, v_ponto_id
  from public.pontos p
  where lower(btrim(p.nome_fantasia)) = lower(v_localizacao);
  if v_pontos <> 1 then v_ponto_id := null; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('stockon'),
    pg_catalog.hashtext('patrimonio_codigo')
  );
  if exists (select 1 from public.equipamentos_patrimonio ep where ep.codigo = v_codigo) then
    raise exception 'Codigo patrimonial ja utilizado.' using errcode = '23505';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.equipamentos_patrimonio (
    codigo, numero, equipamento_id, lote_id, origem, situacao,
    equipamento_nome_snapshot, categoria_codigo_snapshot, categoria_nome_snapshot,
    localizacao_snapshot, ponto_id_snapshot,
    criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
  ) values (
    v_codigo, null, p_equipamento_id, null, 'legado', 'legado',
    v_equipamento_nome, v_categoria_codigo, v_categoria_nome,
    v_localizacao, v_ponto_id,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  ) returning id, public_id into v_patrimonio_id, v_public_id;

  update public.equipamentos e
  set patrimonio = v_codigo
  where e.id = p_equipamento_id;

  perform private.patrimonio_registrar_evento(
    'legado_importado', null, v_patrimonio_id, null, 'legado', null,
    jsonb_build_object('codigo', v_codigo, 'numero', null),
    p_idempotencia, v_payload
  );
  return v_public_id;
end;
$$;

revoke all on function public.patrimonio_preparar_lote(bigint[], uuid) from public, anon;
revoke all on function public.patrimonio_gerar_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_importar_legado(bigint, text, uuid) from public, anon;

commit;
