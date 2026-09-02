begin;

create or replace function private.patrimonio_validar_equipamento_patrimoniavel(
  p_equipamento_id bigint
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_categoria text;
  v_localizacao text;
  v_codigo text;
  v_patrimoniavel boolean;
begin
  select e.categoria, e.localizacao into v_categoria, v_localizacao
  from public.equipamentos e where e.id = p_equipamento_id;
  if not found then raise exception 'Equipamento nao encontrado.' using errcode = 'P0002'; end if;
  select c.codigo, c.patrimoniavel into v_codigo, v_patrimoniavel
  from public.equipamento_categorias c
  where c.ativo and lower(btrim(c.nome)) = lower(btrim(coalesce(v_categoria, '')));
  if not found then raise exception 'Categoria desconhecida; operacao falhou fechada.' using errcode = '23514'; end if;
  if not v_patrimoniavel then
    raise exception 'Categoria nao patrimoniavel nao pode receber NP.' using errcode = '23514';
  end if;
  if nullif(btrim(coalesce(v_localizacao, '')), '') is not null and not exists (
    select 1 from public.pontos pt
    where lower(btrim(pt.nome_fantasia)) = lower(btrim(v_localizacao))
  ) then
    raise exception 'Localizacao nao corresponde a um ponto real; equipamento exige revisao.'
      using errcode = '23514';
  end if;
  return v_codigo;
end;
$$;

create or replace function private.patrimonio_item_campanha_para_equipamento(
  p_campanha_id uuid,
  p_equipamento_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_item_id uuid;
begin
  select ce.id into v_item_id
  from public.patrimonio_campanha_equipamentos ce
  where ce.campanha_id = p_campanha_id
    and ce.equipamento_id = p_equipamento_id
    and ce.resolucao = 'pendente'
  for update;
  if not found then
    raise exception 'Equipamento nao pertence aos itens pendentes desta campanha.' using errcode = '23514';
  end if;
  return v_item_id;
end;
$$;

revoke all on function private.patrimonio_validar_equipamento_patrimoniavel(bigint) from public, anon, authenticated, service_role;
revoke all on function private.patrimonio_item_campanha_para_equipamento(uuid, bigint) from public, anon, authenticated, service_role;

create or replace function public.patrimonio_vincular_etiqueta(
  p_patrimonio_public_id text,
  p_equipamento_id bigint,
  p_posicao_esperada jsonb,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_equipamento public.equipamentos%rowtype;
  v_lote public.patrimonio_lotes%rowtype;
  v_campanha_item_id uuid;
  v_posicao_atual jsonb;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_equipamento_id is null
     or p_posicao_esperada is null or p_idempotencia is null then
    raise exception 'Autenticacao, patrimonio, equipamento, posicao esperada e chave sao obrigatorios.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_posicao_esperada) <> 'object' then
    raise exception 'Posicao esperada deve ser um objeto JSON.' using errcode = '22023';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then
    raise exception 'Perfil sem permissao para vincular patrimonio.' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object(
    'public_id', p_patrimonio_public_id,
    'equipamento_id', p_equipamento_id,
    'posicao_esperada', p_posicao_esperada
  );
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('patrimonio_vinculado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;

  select * into v_patrimonio
  from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.origem <> 'implantacao' or v_patrimonio.situacao <> 'disponivel'
     or v_patrimonio.equipamento_id is not null then
    raise exception 'Etiqueta nao esta disponivel para vinculacao.' using errcode = '55000';
  end if;

  select * into v_equipamento
  from public.equipamentos e
  where e.id = p_equipamento_id
  for update;
  if not found then raise exception 'Equipamento nao encontrado.' using errcode = 'P0002'; end if;
  v_posicao_atual := jsonb_build_object(
    'status', coalesce(v_equipamento.status, ''),
    'localizacao', coalesce(v_equipamento.localizacao, '')
  );
  if p_posicao_esperada is distinct from v_posicao_atual then
    raise exception 'Posicao do equipamento mudou desde a selecao. Atualize e tente novamente.'
      using errcode = '40001',
            detail = jsonb_build_object(
              'posicao_esperada', p_posicao_esperada,
              'posicao_atual', v_posicao_atual
            )::text;
  end if;
  perform private.patrimonio_validar_equipamento_patrimoniavel(p_equipamento_id);
  if exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.equipamento_id = p_equipamento_id
      and ep.situacao not in ('anulado', 'baixado')
  ) then
    raise exception 'Equipamento ja possui patrimonio NP ativo.' using errcode = '23505';
  end if;

  select * into v_lote from public.patrimonio_lotes l
  where l.id = v_patrimonio.lote_origem_id for update;
  if v_lote.situacao not in ('gerado', 'em_uso') then
    raise exception 'Lote nao esta disponivel para trabalho de campo.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.patrimonio_campanhas c
    where c.id = v_lote.campanha_id and c.situacao = 'ativa'
  ) then
    raise exception 'Campanha nao esta ativa.' using errcode = '55000';
  end if;
  v_campanha_item_id := private.patrimonio_item_campanha_para_equipamento(v_lote.campanha_id, p_equipamento_id);

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set equipamento_id = p_equipamento_id,
      campanha_item_id = v_campanha_item_id,
      situacao = 'vinculado', vinculado_em = now(),
      vinculado_por_user_id = auth.uid(),
      vinculado_por_nome_snapshot = v_identidade.usuario_nome,
      vinculado_por_perfil_snapshot = v_identidade.perfil,
      versao = versao + 1
  where id = v_patrimonio.id;

  if v_lote.situacao = 'gerado' then
    update public.patrimonio_lotes
    set situacao = 'em_uso', iniciado_em = now(), versao = versao + 1
    where id = v_lote.id;
    perform private.patrimonio_registrar_evento(
      'lote_iniciado', v_lote.campanha_id, null, v_lote.id, null, null, null,
      'gerado', 'em_uso', null, '{}'::jsonb, p_idempotencia
    );
  end if;

  v_resultado := jsonb_build_object('public_id', p_patrimonio_public_id, 'equipamento_id', p_equipamento_id);
  perform private.patrimonio_registrar_evento(
    'patrimonio_vinculado', v_lote.campanha_id, v_campanha_item_id, v_lote.id,
    v_patrimonio.id, null, p_equipamento_id,
    'disponivel', 'vinculado', null,
    jsonb_build_object('posicao_confirmada', v_posicao_atual), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('patrimonio_vinculado', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_corrigir_vinculo(
  p_patrimonio_public_id text,
  p_novo_equipamento_id bigint,
  p_motivo text,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_lote public.patrimonio_lotes%rowtype;
  v_novo_item_id uuid;
  v_equipamento_lock bigint;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_novo_equipamento_id is null or p_idempotencia is null then
    raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then
    raise exception 'Motivo de correcao deve ter entre 5 e 1000 caracteres.' using errcode = '22023';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then
    raise exception 'Somente administrador pode corrigir vinculo.' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object('public_id', p_patrimonio_public_id, 'novo_equipamento_id', p_novo_equipamento_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('vinculo_corrigido', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;

  select * into v_patrimonio from public.equipamentos_patrimonio ep
  where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.origem <> 'implantacao' or v_patrimonio.situacao not in ('vinculado', 'aplicado') then
    raise exception 'Correcao so e permitida antes da conferencia em patrimonio de implantacao.' using errcode = '55000';
  end if;
  if v_patrimonio.equipamento_id = p_novo_equipamento_id then
    raise exception 'Novo equipamento coincide com o vinculo atual.' using errcode = '22023';
  end if;

  for v_equipamento_lock in
    select id from public.equipamentos
    where id in (v_patrimonio.equipamento_id, p_novo_equipamento_id)
    order by id for update
  loop null; end loop;
  if not exists (select 1 from public.equipamentos where id = p_novo_equipamento_id) then
    raise exception 'Novo equipamento nao encontrado.' using errcode = 'P0002';
  end if;
  perform private.patrimonio_validar_equipamento_patrimoniavel(p_novo_equipamento_id);
  if exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.equipamento_id = p_novo_equipamento_id
      and ep.id <> v_patrimonio.id
      and ep.situacao not in ('anulado', 'baixado')
  ) then
    raise exception 'Novo equipamento ja possui patrimonio NP ativo.' using errcode = '23505';
  end if;
  select * into v_lote from public.patrimonio_lotes l where l.id = v_patrimonio.lote_origem_id;
  v_novo_item_id := private.patrimonio_item_campanha_para_equipamento(v_lote.campanha_id, p_novo_equipamento_id);

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set equipamento_id = p_novo_equipamento_id,
      campanha_item_id = v_novo_item_id,
      situacao = 'vinculado',
      vinculado_em = now(),
      vinculado_por_user_id = auth.uid(),
      vinculado_por_nome_snapshot = v_identidade.usuario_nome,
      vinculado_por_perfil_snapshot = v_identidade.perfil,
      aplicado_em = null,
      aplicado_por_user_id = null,
      aplicado_por_nome_snapshot = null,
      aplicado_por_perfil_snapshot = null,
      conferido_em = null,
      conferido_por_user_id = null,
      conferido_por_nome_snapshot = null,
      conferido_por_perfil_snapshot = null,
      versao = versao + 1
  where id = v_patrimonio.id;
  v_resultado := jsonb_build_object('public_id', p_patrimonio_public_id, 'equipamento_id', p_novo_equipamento_id);
  perform private.patrimonio_registrar_evento(
    'vinculo_corrigido', v_lote.campanha_id, v_novo_item_id, v_lote.id,
    v_patrimonio.id, null, p_novo_equipamento_id,
    v_patrimonio.situacao, 'vinculado', btrim(p_motivo),
    jsonb_build_object('equipamento_anterior_id', v_patrimonio.equipamento_id), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('vinculo_corrigido', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_aplicar_etiqueta(
  p_patrimonio_public_id text,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_campanha_id uuid;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then raise exception 'Perfil sem permissao para aplicar etiqueta.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('public_id', p_patrimonio_public_id);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('etiqueta_aplicada', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;
  select * into v_patrimonio from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao <> 'vinculado' then raise exception 'Somente patrimonio vinculado pode ser aplicado.' using errcode = '55000'; end if;
  if v_patrimonio.lote_origem_id is not null then select l.campanha_id into v_campanha_id from public.patrimonio_lotes l where l.id = v_patrimonio.lote_origem_id; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'aplicado', aplicado_em = now(),
      aplicado_por_user_id = auth.uid(), aplicado_por_nome_snapshot = v_identidade.usuario_nome,
      aplicado_por_perfil_snapshot = v_identidade.perfil, versao = versao + 1
  where id = v_patrimonio.id;
  v_resultado := jsonb_build_object('public_id', p_patrimonio_public_id);
  perform private.patrimonio_registrar_evento(
    'etiqueta_aplicada', v_campanha_id, v_patrimonio.campanha_item_id, v_patrimonio.lote_origem_id,
    v_patrimonio.id, null, v_patrimonio.equipamento_id,
    'vinculado', 'aplicado', null, '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('etiqueta_aplicada', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_conferir_etiqueta(
  p_patrimonio_public_id text,
  p_equipamento_id_esperado bigint,
  p_identificador_lido text,
  p_metodo text,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_payload jsonb;
  v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
  v_campanha_id uuid;
  v_identificador_lido text := btrim(coalesce(p_identificador_lido, ''));
  v_metodo text := lower(btrim(coalesce(p_metodo, '')));
  v_codigo_numerico text;
  v_leitura_confere boolean := false;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_equipamento_id_esperado is null
     or p_identificador_lido is null or p_metodo is null or p_idempotencia is null then
    raise exception 'Autenticacao, patrimonio, equipamento, segunda leitura, metodo e chave sao obrigatorios.' using errcode = '42501';
  end if;
  if char_length(v_identificador_lido) not between 1 and 80 then
    raise exception 'Identificador lido deve ter entre 1 e 80 caracteres.' using errcode = '22023';
  end if;
  if v_metodo not in ('qr', 'codigo', 'sufixo_6', 'sufixo_4') then
    raise exception 'Metodo de conferencia invalido.' using errcode = '22023';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then raise exception 'Perfil sem permissao para conferir etiqueta.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object(
    'public_id', p_patrimonio_public_id,
    'equipamento_id_esperado', p_equipamento_id_esperado,
    'identificador_lido', v_identificador_lido,
    'metodo', v_metodo
  );
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('patrimonio_conferido', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;
  select * into v_patrimonio from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao <> 'aplicado' then raise exception 'Somente patrimonio aplicado pode ser conferido.' using errcode = '55000'; end if;
  if v_patrimonio.equipamento_id is distinct from p_equipamento_id_esperado then raise exception 'Equipamento conferido diverge do vinculo patrimonial.' using errcode = '23514'; end if;
  v_codigo_numerico := regexp_replace(v_patrimonio.codigo, '[^0-9]', '', 'g');
  v_leitura_confere := case v_metodo
    when 'qr' then v_identificador_lido = v_patrimonio.public_id
    when 'codigo' then upper(v_identificador_lido) = upper(v_patrimonio.codigo)
    when 'sufixo_6' then v_identificador_lido ~ '^[0-9]{6}$'
      and v_identificador_lido = right(v_codigo_numerico, 6)
    when 'sufixo_4' then v_identificador_lido ~ '^[0-9]{4}$'
      and v_identificador_lido = right(v_codigo_numerico, 4)
    else false
  end;
  if not v_leitura_confere then
    raise exception 'Segunda leitura diverge da etiqueta patrimonial esperada.'
      using errcode = '23514',
            detail = jsonb_build_object('metodo', v_metodo, 'equipamento_id', p_equipamento_id_esperado)::text;
  end if;
  if v_patrimonio.lote_origem_id is not null then select l.campanha_id into v_campanha_id from public.patrimonio_lotes l where l.id = v_patrimonio.lote_origem_id; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'conferido', conferido_em = now(),
      conferido_por_user_id = auth.uid(), conferido_por_nome_snapshot = v_identidade.usuario_nome,
      conferido_por_perfil_snapshot = v_identidade.perfil, versao = versao + 1
  where id = v_patrimonio.id;
  if v_patrimonio.campanha_item_id is not null then
    update public.patrimonio_campanha_equipamentos
    set resolucao = 'conferido', resolucao_tipo = 'conferido', resolvido_em = now(),
        resolvido_por_user_id = auth.uid(), resolvido_por_nome_snapshot = v_identidade.usuario_nome,
        resolvido_por_perfil_snapshot = v_identidade.perfil
    where id = v_patrimonio.campanha_item_id and resolucao = 'pendente';
  end if;
  v_resultado := jsonb_build_object(
    'public_id', p_patrimonio_public_id,
    'equipamento_id', p_equipamento_id_esperado,
    'metodo', v_metodo
  );
  perform private.patrimonio_registrar_evento(
    'patrimonio_conferido', v_campanha_id, v_patrimonio.campanha_item_id, v_patrimonio.lote_origem_id,
    v_patrimonio.id, null, v_patrimonio.equipamento_id,
    'aplicado', 'conferido', null, jsonb_build_object('metodo', v_metodo), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('patrimonio_conferido', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_reimprimir_etiqueta(
  p_patrimonio_public_id text,
  p_motivo text,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype; v_campanha_id uuid;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 1000 then raise exception 'Motivo de reimpressao invalido.' using errcode = '22023'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('administrador', 'operador') then raise exception 'Perfil sem permissao para reimprimir.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('public_id', p_patrimonio_public_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('etiqueta_reimpressa', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;
  select * into v_patrimonio from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao = 'anulado' then raise exception 'Patrimonio anulado nao pode ser reimpresso.' using errcode = '55000'; end if;
  if v_patrimonio.lote_origem_id is not null then select l.campanha_id into v_campanha_id from public.patrimonio_lotes l where l.id = v_patrimonio.lote_origem_id; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set reimpressoes = reimpressoes + 1, ultima_reimpressao_em = now(), versao = versao + 1
  where id = v_patrimonio.id;
  v_resultado := jsonb_build_object('public_id', p_patrimonio_public_id, 'reimpressoes', v_patrimonio.reimpressoes + 1);
  perform private.patrimonio_registrar_evento(
    'etiqueta_reimpressa', v_campanha_id, v_patrimonio.campanha_item_id, v_patrimonio.lote_origem_id,
    v_patrimonio.id, null, v_patrimonio.equipamento_id,
    v_patrimonio.situacao, v_patrimonio.situacao, btrim(p_motivo),
    jsonb_build_object('reimpressao', v_patrimonio.reimpressoes + 1), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('etiqueta_reimpressa', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_anular(
  p_patrimonio_public_id text,
  p_motivo text,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype; v_campanha_id uuid;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then raise exception 'Motivo de anulacao invalido.' using errcode = '22023'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode anular patrimonio.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('public_id', p_patrimonio_public_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('patrimonio_anulado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;
  select * into v_patrimonio from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao not in ('disponivel', 'vinculado', 'aplicado') then raise exception 'Patrimonio neste estado nao pode ser anulado.' using errcode = '55000'; end if;
  if v_patrimonio.equipamento_id is not null then perform e.id from public.equipamentos e where e.id = v_patrimonio.equipamento_id for update; end if;
  if v_patrimonio.lote_origem_id is not null then select l.campanha_id into v_campanha_id from public.patrimonio_lotes l where l.id = v_patrimonio.lote_origem_id; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'anulado', anulado_em = now(),
      anulado_por_user_id = auth.uid(), anulado_por_nome_snapshot = v_identidade.usuario_nome,
      anulado_por_perfil_snapshot = v_identidade.perfil, motivo_anulacao = btrim(p_motivo), versao = versao + 1
  where id = v_patrimonio.id;
  v_resultado := jsonb_build_object('public_id', p_patrimonio_public_id);
  perform private.patrimonio_registrar_evento(
    'patrimonio_anulado', v_campanha_id, v_patrimonio.campanha_item_id, v_patrimonio.lote_origem_id,
    v_patrimonio.id, null, v_patrimonio.equipamento_id,
    v_patrimonio.situacao, 'anulado', btrim(p_motivo), '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('patrimonio_anulado', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_baixar(
  p_patrimonio_public_id text,
  p_motivo text,
  p_idempotencia uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_patrimonio public.equipamentos_patrimonio%rowtype; v_campanha_id uuid;
begin
  if auth.uid() is null or p_patrimonio_public_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then raise exception 'Motivo de baixa invalido.' using errcode = '22023'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode baixar patrimonio.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('public_id', p_patrimonio_public_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('patrimonio_baixado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return v_idempotencia.resultado ->> 'public_id'; end if;
  select * into v_patrimonio from public.equipamentos_patrimonio ep where ep.public_id = p_patrimonio_public_id for update;
  if not found then raise exception 'Patrimonio nao encontrado.' using errcode = 'P0002'; end if;
  if v_patrimonio.situacao <> 'conferido' then raise exception 'Somente patrimonio conferido pode ser baixado.' using errcode = '55000'; end if;
  perform e.id from public.equipamentos e where e.id = v_patrimonio.equipamento_id for update;
  if v_patrimonio.lote_origem_id is not null then select l.campanha_id into v_campanha_id from public.patrimonio_lotes l where l.id = v_patrimonio.lote_origem_id; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.equipamentos_patrimonio
  set situacao = 'baixado', baixado_em = now(),
      baixado_por_user_id = auth.uid(), baixado_por_nome_snapshot = v_identidade.usuario_nome,
      baixado_por_perfil_snapshot = v_identidade.perfil, motivo_baixa = btrim(p_motivo), versao = versao + 1
  where id = v_patrimonio.id;
  v_resultado := jsonb_build_object('public_id', p_patrimonio_public_id);
  perform private.patrimonio_registrar_evento(
    'patrimonio_baixado', v_campanha_id, v_patrimonio.campanha_item_id, v_patrimonio.lote_origem_id,
    v_patrimonio.id, null, v_patrimonio.equipamento_id,
    'conferido', 'baixado', btrim(p_motivo), '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('patrimonio_baixado', p_idempotencia, v_payload, v_resultado);
  return p_patrimonio_public_id;
end;
$$;

create or replace function public.patrimonio_resolver_item_campanha_excecao(
  p_campanha_item_id uuid,
  p_tipo text,
  p_motivo text,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_item public.patrimonio_campanha_equipamentos%rowtype;
begin
  if auth.uid() is null or p_campanha_item_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  if p_tipo not in ('equipamento_excluido', 'equipamento_baixado', 'inelegivel', 'outro')
     or char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then raise exception 'Tipo ou motivo de excecao invalido.' using errcode = '22023'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode resolver excecao de campanha.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('campanha_item_id', p_campanha_item_id, 'tipo', p_tipo, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('campanha_item_excecao', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'campanha_item_id')::uuid; end if;
  select * into v_item from public.patrimonio_campanha_equipamentos ce where ce.id = p_campanha_item_id for update;
  if not found then raise exception 'Item de campanha nao encontrado.' using errcode = 'P0002'; end if;
  if v_item.resolucao <> 'pendente' then raise exception 'Item de campanha ja resolvido.' using errcode = '55000'; end if;
  if exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.campanha_item_id = p_campanha_item_id and ep.situacao in ('vinculado', 'aplicado')
  ) then raise exception 'Item possui patrimonio ativo ainda nao resolvido.' using errcode = '55000'; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_campanha_equipamentos
  set resolucao = 'excecao', resolucao_tipo = p_tipo, resolucao_motivo = btrim(p_motivo),
      resolvido_em = now(), resolvido_por_user_id = auth.uid(),
      resolvido_por_nome_snapshot = v_identidade.usuario_nome,
      resolvido_por_perfil_snapshot = v_identidade.perfil
  where id = p_campanha_item_id;
  v_resultado := jsonb_build_object('campanha_item_id', p_campanha_item_id);
  perform private.patrimonio_registrar_evento(
    'campanha_item_excecao', v_item.campanha_id, v_item.id, null, null, null, v_item.equipamento_id,
    'pendente', 'excecao', btrim(p_motivo), jsonb_build_object('tipo', p_tipo), p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('campanha_item_excecao', p_idempotencia, v_payload, v_resultado);
  return p_campanha_item_id;
end;
$$;

create or replace function public.patrimonio_concluir_lote(p_lote_id uuid, p_idempotencia uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_lote public.patrimonio_lotes%rowtype;
begin
  if auth.uid() is null or p_lote_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode concluir lote.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('lote_id', p_lote_id);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('lote_concluido', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'lote_id')::uuid; end if;
  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao not in ('gerado', 'em_uso') then raise exception 'Lote nao pode ser concluido neste estado.' using errcode = '55000'; end if;
  if (select count(*) from public.equipamentos_patrimonio ep where ep.lote_origem_id = p_lote_id) <> v_lote.quantidade
     or exists (
       select 1 from public.equipamentos_patrimonio ep
       where ep.lote_origem_id = p_lote_id and ep.situacao not in ('conferido', 'anulado', 'baixado')
     ) then raise exception 'Todos os itens do lote devem estar conferidos, anulados ou baixados.' using errcode = '55000'; end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_lotes
  set situacao = 'concluido', concluido_em = now(), concluido_por_user_id = auth.uid(),
      concluido_por_nome_snapshot = v_identidade.usuario_nome,
      concluido_por_perfil_snapshot = v_identidade.perfil, versao = versao + 1
  where id = p_lote_id;
  v_resultado := jsonb_build_object('lote_id', p_lote_id);
  perform private.patrimonio_registrar_evento(
    'lote_concluido', v_lote.campanha_id, null, p_lote_id, null, null, null,
    v_lote.situacao, 'concluido', null, '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('lote_concluido', p_idempotencia, v_payload, v_resultado);
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_cancelar_lote(p_lote_id uuid, p_motivo text, p_idempotencia uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_lote public.patrimonio_lotes%rowtype;
begin
  if auth.uid() is null or p_lote_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then raise exception 'Motivo de cancelamento invalido.' using errcode = '22023'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode cancelar lote.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('lote_id', p_lote_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('lote_cancelado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'lote_id')::uuid; end if;
  select * into v_lote from public.patrimonio_lotes l where l.id = p_lote_id for update;
  if not found then raise exception 'Lote nao encontrado.' using errcode = 'P0002'; end if;
  if v_lote.situacao <> 'preparado' or exists (select 1 from public.equipamentos_patrimonio ep where ep.lote_origem_id = p_lote_id) then
    raise exception 'Somente lote preparado e sem NPs gerados pode ser cancelado.' using errcode = '55000';
  end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_lotes
  set situacao = 'cancelado', cancelado_em = now(), cancelado_por_user_id = auth.uid(),
      cancelado_por_nome_snapshot = v_identidade.usuario_nome,
      cancelado_por_perfil_snapshot = v_identidade.perfil,
      motivo_cancelamento = btrim(p_motivo), versao = versao + 1
  where id = p_lote_id;
  v_resultado := jsonb_build_object('lote_id', p_lote_id);
  perform private.patrimonio_registrar_evento(
    'lote_cancelado', v_lote.campanha_id, null, p_lote_id, null, null, null,
    'preparado', 'cancelado', btrim(p_motivo), '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('lote_cancelado', p_idempotencia, v_payload, v_resultado);
  return p_lote_id;
end;
$$;

create or replace function public.patrimonio_concluir_campanha(p_campanha_id uuid, p_idempotencia uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_campanha public.patrimonio_campanhas%rowtype;
begin
  if auth.uid() is null or p_campanha_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode concluir campanha.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('campanha_id', p_campanha_id);
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('campanha_concluida', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'campanha_id')::uuid; end if;
  select * into v_campanha from public.patrimonio_campanhas c where c.id = p_campanha_id for update;
  if not found then raise exception 'Campanha nao encontrada.' using errcode = 'P0002'; end if;
  if v_campanha.situacao <> 'ativa' then raise exception 'Campanha nao esta ativa.' using errcode = '55000'; end if;
  if exists (select 1 from public.patrimonio_campanha_equipamentos ce where ce.campanha_id = p_campanha_id and ce.resolucao = 'pendente') then
    raise exception 'Campanha possui itens pendentes.' using errcode = '55000';
  end if;
  if exists (select 1 from public.patrimonio_lotes l where l.campanha_id = p_campanha_id and l.situacao not in ('concluido', 'cancelado')) then
    raise exception 'Campanha possui lotes ainda abertos.' using errcode = '55000';
  end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_campanhas
  set situacao = 'concluida', concluido_em = now(), concluido_por_user_id = auth.uid(),
      concluido_por_nome_snapshot = v_identidade.usuario_nome,
      concluido_por_perfil_snapshot = v_identidade.perfil, versao = versao + 1
  where id = p_campanha_id;
  v_resultado := jsonb_build_object('campanha_id', p_campanha_id);
  perform private.patrimonio_registrar_evento(
    'campanha_concluida', p_campanha_id, null, null, null, null, null,
    'ativa', 'concluida', null, '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('campanha_concluida', p_idempotencia, v_payload, v_resultado);
  return p_campanha_id;
end;
$$;

create or replace function public.patrimonio_cancelar_campanha(p_campanha_id uuid, p_motivo text, p_idempotencia uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_idempotencia record; v_payload jsonb; v_resultado jsonb;
  v_campanha public.patrimonio_campanhas%rowtype;
begin
  if auth.uid() is null or p_campanha_id is null or p_idempotencia is null then raise exception 'Parametros obrigatorios ausentes.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 5 and 1000 then raise exception 'Motivo de cancelamento invalido.' using errcode = '22023'; end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil <> 'administrador' then raise exception 'Somente administrador pode cancelar campanha.' using errcode = '42501'; end if;
  v_payload := jsonb_build_object('campanha_id', p_campanha_id, 'motivo', btrim(p_motivo));
  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_idempotencia from private.patrimonio_idempotencia_obter('campanha_cancelada', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then return (v_idempotencia.resultado ->> 'campanha_id')::uuid; end if;
  select * into v_campanha from public.patrimonio_campanhas c where c.id = p_campanha_id for update;
  if not found then raise exception 'Campanha nao encontrada.' using errcode = 'P0002'; end if;
  if v_campanha.situacao <> 'ativa' then raise exception 'Campanha nao esta ativa.' using errcode = '55000'; end if;
  if exists (select 1 from public.patrimonio_lotes l where l.campanha_id = p_campanha_id and l.situacao <> 'cancelado') then
    raise exception 'Cancele primeiro todos os lotes preparados; campanhas com NPs gerados nao sao canceladas em massa.' using errcode = '55000';
  end if;
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  update public.patrimonio_campanhas
  set situacao = 'cancelada', cancelado_em = now(), cancelado_por_user_id = auth.uid(),
      cancelado_por_nome_snapshot = v_identidade.usuario_nome,
      cancelado_por_perfil_snapshot = v_identidade.perfil,
      motivo_cancelamento = btrim(p_motivo), versao = versao + 1
  where id = p_campanha_id;
  v_resultado := jsonb_build_object('campanha_id', p_campanha_id);
  perform private.patrimonio_registrar_evento(
    'campanha_cancelada', p_campanha_id, null, null, null, null, null,
    'ativa', 'cancelada', btrim(p_motivo), '{}'::jsonb, p_idempotencia
  );
  perform private.patrimonio_idempotencia_registrar('campanha_cancelada', p_idempotencia, v_payload, v_resultado);
  return p_campanha_id;
end;
$$;

revoke all on function public.patrimonio_vincular_etiqueta(text, bigint, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_corrigir_vinculo(text, bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_aplicar_etiqueta(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_conferir_etiqueta(text, bigint, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_reimprimir_etiqueta(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_anular(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_baixar(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_resolver_item_campanha_excecao(uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_concluir_lote(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_cancelar_lote(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_concluir_campanha(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.patrimonio_cancelar_campanha(uuid, text, uuid) from public, anon, authenticated, service_role;

commit;
