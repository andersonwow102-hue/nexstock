begin;

create or replace function private.patrimonio_identidade_atual()
returns table (
  user_id uuid,
  perfil text,
  usuario_nome text,
  gerente_nome text
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
    ),
    coalesce(nullif(btrim(p.gerente_nome), ''), nullif(btrim(p.nome), ''), '')
  from public.perfis p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function private.patrimonio_idempotencia_obter(
  p_operacao text,
  p_idempotencia uuid,
  p_payload jsonb
)
returns table (encontrado boolean, resultado jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_registro public.patrimonio_operacoes_idempotentes%rowtype;
begin
  select o.* into v_registro
  from public.patrimonio_operacoes_idempotentes o
  where o.autor_user_id = auth.uid() and o.chave = p_idempotencia;

  if not found then
    return query select false, null::jsonb;
    return;
  end if;
  if v_registro.operacao is distinct from p_operacao
     or v_registro.payload is distinct from p_payload then
    raise exception 'Chave de idempotencia reutilizada com operacao ou dados diferentes.'
      using errcode = '22023';
  end if;
  return query select true, v_registro.resultado;
end;
$$;

create or replace function private.patrimonio_idempotencia_registrar(
  p_operacao text,
  p_idempotencia uuid,
  p_payload jsonb,
  p_resultado jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.patrimonio_operacoes_idempotentes (
    autor_user_id, chave, operacao, payload, resultado
  ) values (
    auth.uid(), p_idempotencia, p_operacao, p_payload, p_resultado
  );
end;
$$;

create or replace function private.patrimonio_registrar_evento(
  p_evento text,
  p_campanha_id uuid,
  p_campanha_item_id uuid,
  p_lote_id uuid,
  p_patrimonio_id bigint,
  p_legado_id bigint,
  p_equipamento_id bigint,
  p_estado_anterior text,
  p_estado_posterior text,
  p_motivo text,
  p_detalhes jsonb,
  p_idempotencia uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_evento_id bigint;
  v_equipamento_id bigint := p_equipamento_id;
begin
  select * into v_identidade from private.patrimonio_identidade_atual();
  if auth.uid() is null or v_identidade.user_id is null then
    raise exception 'Acesso nao autenticado ou sem perfil.' using errcode = '42501';
  end if;
  if p_patrimonio_id is not null and v_equipamento_id is null then
    select ep.equipamento_id into v_equipamento_id
    from public.equipamentos_patrimonio ep where ep.id = p_patrimonio_id;
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.patrimonio_eventos (
    evento, campanha_id, campanha_item_id, lote_id, patrimonio_id, legado_id,
    equipamento_id, equipamento_id_snapshot,
    estado_anterior, estado_posterior, motivo, detalhes, idempotencia,
    autor_user_id, autor_nome_snapshot, autor_perfil_snapshot
  ) values (
    p_evento, p_campanha_id, p_campanha_item_id, p_lote_id, p_patrimonio_id, p_legado_id,
    v_equipamento_id, v_equipamento_id,
    p_estado_anterior, p_estado_posterior, nullif(btrim(coalesce(p_motivo, '')), ''),
    coalesce(p_detalhes, '{}'::jsonb), p_idempotencia,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  ) returning id into v_evento_id;
  return v_evento_id;
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
begin
  loop
    v_numero := nextval('public.patrimonio_np_seq'::regclass);
    exit when not exists (
      select 1 from public.equipamentos_patrimonio ep
      where ep.numero = v_numero or ep.codigo = 'NP-' || lpad(v_numero::text, 6, '0')
    );
  end loop;
  return v_numero;
end;
$$;

create or replace function private.patrimonio_resultado_lote(p_lote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object(
    'lote_id', l.id,
    'codigo', l.codigo,
    'quantidade', l.quantidade,
    'etiquetas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'public_id', ep.public_id,
          'codigo', ep.codigo,
          'numero', ep.numero,
          'situacao', ep.situacao
        ) order by ep.numero
      )
      from public.equipamentos_patrimonio ep
      where ep.lote_origem_id = l.id
    ), '[]'::jsonb)
  )
  from public.patrimonio_lotes l
  where l.id = p_lote_id;
$$;

revoke all on function private.patrimonio_identidade_atual() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_idempotencia_obter(text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_idempotencia_registrar(text, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_registrar_evento(text, uuid, uuid, uuid, bigint, bigint, bigint, text, text, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_proximo_numero_np() from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_resultado_lote(uuid) from public, anon, authenticated, service_role;

create or replace function public.patrimonio_criar_campanha(
  p_nome text,
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
  v_resultado jsonb;
  v_campanha_id uuid := gen_random_uuid();
  v_codigo text;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_total integer;
  v_data_corte timestamptz;
begin
  if auth.uid() is null or p_idempotencia is null then
    raise exception 'Autenticacao e chave de idempotencia sao obrigatorias.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode criar campanha patrimonial.' using errcode = '42501';
  end if;
  if char_length(v_nome) not between 3 and 160 then
    raise exception 'Nome da campanha invalido.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('nome', v_nome);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('campanha_criada', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    return (v_idempotencia.resultado ->> 'campanha_id')::uuid;
  end if;

  -- Congela o conjunto elegivel durante contagem + materializacao do snapshot.
  -- Mutacoes concorrentes de Equipamentos aguardam o corte terminar.
  lock table public.equipamentos in share mode;
  v_data_corte := clock_timestamp();

  if exists (
    select 1
    from public.equipamentos e
    left join public.equipamento_categorias c
      on c.ativo and lower(btrim(c.nome)) = lower(btrim(coalesce(e.categoria, '')))
    where c.codigo is null
  ) then
    raise exception 'Existem equipamentos com categoria desconhecida; campanha falhou fechada.'
      using errcode = '23514';
  end if;

  select count(*)::integer into v_total
  from public.equipamentos e
  join public.equipamento_categorias c
    on c.ativo and c.patrimoniavel
   and lower(btrim(c.nome)) = lower(btrim(coalesce(e.categoria, '')));
  if v_total = 0 then
    raise exception 'Campanha sem equipamentos elegiveis nao pode ser criada.' using errcode = '22023';
  end if;

  v_codigo := 'CAMP-' || to_char(v_data_corte, 'YYYYMMDD') || '-'
    || upper(substr(replace(v_campanha_id::text, '-', ''), 1, 8));
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.patrimonio_campanhas (
    id, codigo, nome, data_corte, quantidade_snapshot,
    criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
  ) values (
    v_campanha_id, v_codigo, v_nome, v_data_corte, v_total,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  );

  insert into public.patrimonio_campanha_equipamentos (
    campanha_id, equipamento_id, equipamento_id_snapshot, categoria_codigo_snapshot
  )
  select v_campanha_id, e.id, e.id, c.codigo
  from public.equipamentos e
  join public.equipamento_categorias c
    on c.ativo and c.patrimoniavel
   and lower(btrim(c.nome)) = lower(btrim(coalesce(e.categoria, '')))
  order by e.id;

  v_resultado := jsonb_build_object('campanha_id', v_campanha_id, 'codigo', v_codigo, 'quantidade_snapshot', v_total);
  perform private.patrimonio_registrar_evento(
    'campanha_criada', v_campanha_id, null, null, null, null, null,
    null, 'ativa', null, jsonb_build_object('quantidade_snapshot', v_total), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('campanha_criada', p_idempotencia, v_payload, v_resultado);
  return v_campanha_id;
end;
$$;

create or replace function public.patrimonio_preparar_lote(
  p_campanha_id uuid,
  p_quantidade integer,
  p_contexto text,
  p_confirmar_excesso boolean,
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
  v_resultado jsonb;
  v_campanha public.patrimonio_campanhas%rowtype;
  v_lote_id uuid := gen_random_uuid();
  v_numero bigint;
  v_codigo text;
  v_contexto text := nullif(btrim(coalesce(p_contexto, '')), '');
  v_pendentes integer;
  v_reservadas integer;
  v_saldo_pendente integer;
  v_excesso integer;
begin
  if auth.uid() is null or p_idempotencia is null then
    raise exception 'Autenticacao e chave de idempotencia sao obrigatorias.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode preparar lote patrimonial.' using errcode = '42501';
  end if;
  if p_campanha_id is null or p_quantidade is null or p_quantidade not between 1 and 500 then
    raise exception 'Campanha e quantidade entre 1 e 500 sao obrigatorias.' using errcode = '22023';
  end if;
  if v_contexto is not null and char_length(v_contexto) > 300 then
    raise exception 'Contexto do lote excede 300 caracteres.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'campanha_id', p_campanha_id,
    'quantidade', p_quantidade,
    'contexto', v_contexto,
    'confirmar_excesso', coalesce(p_confirmar_excesso, false)
  );
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_preparado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    return (v_idempotencia.resultado ->> 'lote_id')::uuid;
  end if;

  select * into v_campanha from public.patrimonio_campanhas c
  where c.id = p_campanha_id for update;
  if not found then raise exception 'Campanha nao encontrada.' using errcode = 'P0002'; end if;
  if v_campanha.situacao <> 'ativa' then
    raise exception 'Somente campanha ativa aceita novos lotes.' using errcode = '55000';
  end if;

  select
    (select count(*)::integer
     from public.patrimonio_campanha_equipamentos ce
     where ce.campanha_id = p_campanha_id and ce.resolucao = 'pendente'),
    coalesce((select sum(l.quantidade)::integer
      from public.patrimonio_lotes l
      where l.campanha_id = p_campanha_id and l.situacao = 'preparado'), 0)
      +
      coalesce((select count(*)::integer
        from public.equipamentos_patrimonio ep
        join public.patrimonio_lotes l on l.id = ep.lote_origem_id
        where l.campanha_id = p_campanha_id
          and ep.situacao in ('disponivel', 'vinculado', 'aplicado')), 0)
  into v_pendentes, v_reservadas;

  v_saldo_pendente := greatest(v_pendentes - v_reservadas, 0);
  v_excesso := greatest(p_quantidade - v_saldo_pendente, 0);
  if v_excesso > 0 and p_confirmar_excesso is distinct from true then
    raise exception 'Quantidade excede em % o saldo pendente da campanha; confirme explicitamente o excesso.', v_excesso
      using errcode = '22023',
            detail = jsonb_build_object(
              'quantidade_solicitada', p_quantidade,
              'saldo_pendente', v_saldo_pendente,
              'quantidade_excedente', v_excesso
            )::text,
            hint = 'Repita a operacao com confirmar_excesso=true apos revisar quantidade e contexto.';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  v_numero := nextval('public.patrimonio_lote_seq'::regclass);
  v_codigo := 'PAT-' || to_char(current_date, 'YYYYMM') || '-' || lpad(v_numero::text, 4, '0');
  insert into public.patrimonio_lotes (
    id, numero, codigo, campanha_id, quantidade, contexto,
    saldo_pendente_no_preparo, quantidade_excedente, excesso_confirmado,
    criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
  ) values (
    v_lote_id, v_numero, v_codigo, p_campanha_id, p_quantidade, v_contexto,
    v_saldo_pendente, v_excesso, v_excesso > 0,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  );
  v_resultado := jsonb_build_object(
    'lote_id', v_lote_id,
    'codigo', v_codigo,
    'quantidade', p_quantidade,
    'saldo_pendente_no_preparo', v_saldo_pendente,
    'quantidade_excedente', v_excesso,
    'excesso_confirmado', v_excesso > 0
  );
  perform private.patrimonio_registrar_evento(
    'lote_preparado', p_campanha_id, null, v_lote_id, null, null, null,
    null, 'preparado', null,
    jsonb_build_object(
      'quantidade', p_quantidade,
      'contexto', v_contexto,
      'saldo_pendente_no_preparo', v_saldo_pendente,
      'quantidade_excedente', v_excesso,
      'excesso_confirmado', v_excesso > 0
    ),
    p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('lote_preparado', p_idempotencia, v_payload, v_resultado);
  return v_lote_id;
end;
$$;

create or replace function public.patrimonio_gerar_lote(
  p_lote_id uuid,
  p_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_lote public.patrimonio_lotes%rowtype;
  v_campanha_situacao text;
  v_numero bigint;
  v_codigo text;
  v_patrimonio_id bigint;
  v_indice integer;
begin
  if auth.uid() is null or p_lote_id is null or p_idempotencia is null then
    raise exception 'Autenticacao, lote e chave de idempotencia sao obrigatorios.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode gerar lote patrimonial.' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_gerado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado; end if;

  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao <> 'preparado' then
    raise exception 'Somente lote preparado pode gerar etiquetas.' using errcode = '55000';
  end if;
  select c.situacao into v_campanha_situacao
  from public.patrimonio_campanhas c where c.id = v_lote.campanha_id for update;
  if v_campanha_situacao <> 'ativa' then
    raise exception 'Campanha nao esta ativa.' using errcode = '55000';
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  for v_indice in 1..v_lote.quantidade loop
    v_numero := private.patrimonio_proximo_numero_np();
    v_codigo := 'NP-' || lpad(v_numero::text, 6, '0');
    insert into public.equipamentos_patrimonio (
      numero, codigo, equipamento_id, lote_origem_id, campanha_item_id,
      origem, situacao, criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
    ) values (
      v_numero, v_codigo, null, p_lote_id, null,
      'implantacao', 'disponivel', auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
    ) returning id into v_patrimonio_id;
    perform private.patrimonio_registrar_evento(
      'patrimonio_gerado', v_lote.campanha_id, null, p_lote_id, v_patrimonio_id, null, null,
      null, 'disponivel', null, jsonb_build_object('codigo', v_codigo, 'numero', v_numero), p_idempotencia
    );
  end loop;

  update public.patrimonio_lotes
  set situacao = 'gerado', gerado_em = now(),
      gerado_por_user_id = auth.uid(),
      gerado_por_nome_snapshot = v_identidade.usuario_nome,
      gerado_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = p_lote_id;
  v_resultado := private.patrimonio_resultado_lote(p_lote_id);
  perform private.patrimonio_registrar_evento(
    'lote_gerado', v_lote.campanha_id, null, p_lote_id, null, null, null,
    'preparado', 'gerado', null, jsonb_build_object('quantidade', v_lote.quantidade), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('lote_gerado', p_idempotencia, v_payload, v_resultado);
  return v_resultado;
end;
$$;

create or replace function public.patrimonio_registrar_impressao_lote(
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
  v_resultado jsonb;
  v_lote public.patrimonio_lotes%rowtype;
begin
  if auth.uid() is null or p_lote_id is null or p_idempotencia is null then
    raise exception 'Autenticacao, lote e chave sao obrigatorios.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then
    raise exception 'Perfil sem permissao para imprimir lote.' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_impresso', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'lote_id')::uuid; end if;
  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao not in ('gerado', 'em_uso') then
    raise exception 'Lote ainda nao gerado ou ja encerrado.' using errcode = '55000';
  end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_lotes
  set impressoes = impressoes + 1, ultima_impressao_em = now(), versao = versao + 1
  where id = p_lote_id;
  v_resultado := jsonb_build_object('lote_id', p_lote_id, 'impressoes', v_lote.impressoes + 1);
  perform private.patrimonio_registrar_evento(
    'lote_impresso', v_lote.campanha_id, null, p_lote_id, null, null, null,
    v_lote.situacao, v_lote.situacao, null, jsonb_build_object('impressao', v_lote.impressoes + 1), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('lote_impresso', p_idempotencia, v_payload, v_resultado);
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_importar_legado(
  p_equipamento_id bigint,
  p_codigo text,
  p_idempotencia uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_espelho text;
  v_categoria text;
  v_categoria_codigo text;
  v_legado_id bigint;
begin
  if auth.uid() is null or p_equipamento_id is null or p_idempotencia is null then
    raise exception 'Autenticacao, equipamento e chave sao obrigatorios.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then
    raise exception 'Somente administrador pode importar referencia legada.' using errcode = '42501';
  end if;
  if char_length(v_codigo) not between 1 and 80 or upper(v_codigo) ~ '^NP-[0-9]{6}$' then
    raise exception 'Codigo legado invalido ou reservado ao namespace NP.' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('equipamento_id', p_equipamento_id, 'codigo', v_codigo);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('legado_importado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'legado_id')::bigint; end if;

  select e.patrimonio, e.categoria into v_espelho, v_categoria
  from public.equipamentos e where e.id = p_equipamento_id for update;
  if not found then raise exception 'Equipamento nao encontrado.' using errcode = 'P0002'; end if;
  if btrim(coalesce(v_espelho, '')) is distinct from v_codigo then
    raise exception 'Codigo informado difere da referencia legada atual do equipamento.' using errcode = '22023';
  end if;
  select c.codigo into v_categoria_codigo
  from public.equipamento_categorias c
  where c.ativo and lower(btrim(c.nome)) = lower(btrim(coalesce(v_categoria, '')));
  if not found then raise exception 'Categoria desconhecida para o legado.' using errcode = '23514'; end if;

  select l.id into v_legado_id
  from public.equipamentos_patrimonio_legados l
  where l.equipamento_id_snapshot = p_equipamento_id and l.codigo_normalizado = lower(v_codigo);
  if found then
    v_resultado := jsonb_build_object('legado_id', v_legado_id);
    perform private.patrimonio_idempotencia_registrar('legado_importado', p_idempotencia, v_payload, v_resultado);
    return v_legado_id;
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.equipamentos_patrimonio_legados (
    equipamento_id, equipamento_id_snapshot, codigo, categoria_codigo_snapshot,
    importado_por_user_id, importado_por_nome_snapshot, importado_por_perfil_snapshot
  ) values (
    p_equipamento_id, p_equipamento_id, v_codigo, v_categoria_codigo,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  ) returning id into v_legado_id;
  v_resultado := jsonb_build_object('legado_id', v_legado_id);
  perform private.patrimonio_registrar_evento(
    'legado_importado', null, null, null, null, v_legado_id, p_equipamento_id,
    null, 'legado_importado', null, jsonb_build_object('codigo', v_codigo), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('legado_importado', p_idempotencia, v_payload, v_resultado);
  return v_legado_id;
end;
$$;

create or replace function public.patrimonio_cadastrar_equipamentos(
  p_dados jsonb,
  p_quantidade integer,
  p_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_nome text;
  v_categoria text;
  v_categoria_codigo text;
  v_patrimoniavel boolean;
  v_status text;
  v_minimo integer;
  v_observacao text;
  v_localizacao text;
  v_responsavel text;
  v_data_cadastro text;
  v_gerente_responsavel text;
  v_transferencia_status text;
  v_transferencia_enviada_em timestamptz;
  v_transferencia_recebida_em timestamptz;
  v_equipamento_id bigint;
  v_patrimonio_id bigint;
  v_public_id text;
  v_numero bigint;
  v_codigo text;
  v_indice integer;
begin
  if auth.uid() is null or p_idempotencia is null then
    raise exception 'Autenticacao e chave de idempotencia sao obrigatorias.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador', 'gerente') then
    raise exception 'Perfil sem permissao para cadastrar equipamento.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object'
     or p_quantidade is null or p_quantidade not between 1 and 100 then
    raise exception 'Dados devem ser objeto e quantidade deve estar entre 1 e 100.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_dados) k
    where k not in (
      'nome', 'categoria', 'status', 'minimo', 'observacao', 'localizacao',
      'responsavel', 'data_cadastro', 'gerente_responsavel', 'transferencia_status',
      'transferencia_enviada_em', 'transferencia_recebida_em'
    )
  ) then
    raise exception 'Campo nao permitido no cadastro atomico.' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('dados', p_dados, 'quantidade', p_quantidade);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('equipamentos_cadastrados', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado; end if;

  v_nome := btrim(coalesce(p_dados ->> 'nome', ''));
  v_categoria := btrim(coalesce(p_dados ->> 'categoria', ''));
  v_status := coalesce(nullif(btrim(p_dados ->> 'status'), ''), 'Disponível');
  v_minimo := coalesce((p_dados ->> 'minimo')::integer, 5);
  v_observacao := btrim(coalesce(p_dados ->> 'observacao', ''));
  v_localizacao := btrim(coalesce(p_dados ->> 'localizacao', ''));
  v_responsavel := btrim(coalesce(p_dados ->> 'responsavel', ''));
  v_data_cadastro := coalesce(nullif(btrim(p_dados ->> 'data_cadastro'), ''), to_char(current_date, 'YYYY-MM-DD'));
  v_gerente_responsavel := btrim(coalesce(p_dados ->> 'gerente_responsavel', ''));
  v_transferencia_status := btrim(coalesce(p_dados ->> 'transferencia_status', ''));
  v_transferencia_enviada_em := nullif(p_dados ->> 'transferencia_enviada_em', '')::timestamptz;
  v_transferencia_recebida_em := nullif(p_dados ->> 'transferencia_recebida_em', '')::timestamptz;

  if char_length(v_nome) not between 1 and 200 or v_status not in ('Disponível', 'Em rota', 'Em conserto') then
    raise exception 'Nome ou status do equipamento invalido.' using errcode = '22023';
  end if;
  if v_status = 'Em rota' and v_localizacao = '' then
    raise exception 'Equipamento em rota exige localizacao.' using errcode = '22023';
  end if;
  select c.codigo, c.nome, c.patrimoniavel
  into v_categoria_codigo, v_categoria, v_patrimoniavel
  from public.equipamento_categorias c
  where c.ativo and lower(btrim(c.nome)) = lower(v_categoria);
  if not found then raise exception 'Categoria desconhecida.' using errcode = '23514'; end if;
  if v_patrimoniavel and v_localizacao <> '' and not exists (
    select 1 from public.pontos pt
    where lower(btrim(pt.nome_fantasia)) = lower(v_localizacao)
  ) then
    raise exception 'Localizacao nao corresponde a um ponto real; cadastro patrimonial exige revisao.'
      using errcode = '23514';
  end if;

  if v_identidade.perfil = 'gerente' then
    if nullif(btrim(v_identidade.gerente_nome), '') is null then
      raise exception 'Perfil de gerente sem identidade operacional valida.' using errcode = '42501';
    end if;
    v_responsavel := v_identidade.gerente_nome;
    v_gerente_responsavel := v_identidade.gerente_nome;
    if v_localizacao <> '' and not exists (
      select 1
      from public.pontos pt
      join public.perfis pf on pf.user_id = auth.uid()
      where lower(btrim(pt.nome_fantasia)) = lower(v_localizacao)
        and pt.gerente = any(coalesce(pf.rotas_permitidas, array[]::text[]))
    ) then
      raise exception 'Gerente nao pode cadastrar equipamento fora de suas rotas.' using errcode = '42501';
    end if;
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  for v_indice in 1..p_quantidade loop
    insert into public.equipamentos (
      nome, categoria, quantidade, status, minimo, observacao, localizacao,
      responsavel, patrimonio, data_cadastro, gerente_responsavel,
      transferencia_status, transferencia_enviada_em, transferencia_recebida_em
    ) values (
      v_nome, v_categoria, 1, v_status, v_minimo, v_observacao, v_localizacao,
      v_responsavel, '', v_data_cadastro, v_gerente_responsavel,
      v_transferencia_status, v_transferencia_enviada_em, v_transferencia_recebida_em
    ) returning id into v_equipamento_id;

    if v_patrimoniavel then
      v_numero := private.patrimonio_proximo_numero_np();
      v_codigo := 'NP-' || lpad(v_numero::text, 6, '0');
      insert into public.equipamentos_patrimonio (
        numero, codigo, equipamento_id, lote_origem_id, campanha_item_id,
        origem, situacao,
        criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot,
        vinculado_em, vinculado_por_user_id, vinculado_por_nome_snapshot, vinculado_por_perfil_snapshot
      ) values (
        v_numero, v_codigo, v_equipamento_id, null, null,
        'cadastro', 'vinculado',
        auth.uid(), v_identidade.usuario_nome, v_identidade.perfil,
        now(), auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
      ) returning id, public_id into v_patrimonio_id, v_public_id;
      perform private.patrimonio_registrar_evento(
        'equipamento_cadastrado_com_patrimonio', null, null, null, v_patrimonio_id, null, v_equipamento_id,
        null, 'vinculado', null, jsonb_build_object('codigo', v_codigo, 'categoria_codigo', v_categoria_codigo), p_idempotencia
      );
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'equipamento_id', v_equipamento_id, 'public_id', v_public_id,
        'codigo', v_codigo, 'situacao', 'vinculado'
      ));
    else
      perform private.patrimonio_registrar_evento(
        'equipamento_cadastrado_sem_patrimonio', null, null, null, null, null, v_equipamento_id,
        null, 'nao_patrimoniavel', null, jsonb_build_object('categoria_codigo', v_categoria_codigo), p_idempotencia
      );
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'equipamento_id', v_equipamento_id, 'public_id', null,
        'codigo', null, 'situacao', 'nao_patrimoniavel'
      ));
    end if;
  end loop;

  v_resultado := jsonb_build_object('quantidade', p_quantidade, 'itens', v_itens);
  perform private.patrimonio_idempotencia_registrar('equipamentos_cadastrados', p_idempotencia, v_payload, v_resultado);
  return v_resultado;
end;
$$;

revoke all on function public.patrimonio_criar_campanha(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_preparar_lote(uuid, integer, text, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_gerar_lote(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_registrar_impressao_lote(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_importar_legado(bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_cadastrar_equipamentos(jsonb, integer, uuid) from public, anon, authenticated, service_role;

commit;
