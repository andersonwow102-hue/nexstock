begin;

create or replace function private.devedores_gravar_negociacao(
  p_divida_id bigint,
  p_forma_pagamento text,
  p_valor_negociado numeric,
  p_data_prevista_quitacao date,
  p_quantidade_parcelas integer,
  p_primeiro_vencimento date,
  p_observacoes text,
  p_idempotencia uuid,
  p_usuario_id uuid,
  p_usuario_nome text,
  p_perfil text,
  p_negociacao_anterior_id bigint,
  p_acao text,
  p_correlation_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_negociacao_id bigint;
  v_valor_base numeric(14,2);
  v_valor_ultima numeric(14,2);
  v_numero integer;
begin
  if p_idempotencia is null then raise exception 'Chave de idempotencia obrigatoria.' using errcode = '22023'; end if;
  if p_valor_negociado is null or round(p_valor_negociado, 2) <= 0 then
    raise exception 'Valor negociado deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_forma_pagamento = 'vista' then
    if p_data_prevista_quitacao is null or p_quantidade_parcelas is not null or p_primeiro_vencimento is not null then
      raise exception 'Parametros invalidos para negociacao a vista.' using errcode = '22023';
    end if;
  elsif p_forma_pagamento = 'parcelada' then
    if p_quantidade_parcelas is null or p_quantidade_parcelas not between 1 and 240 or p_primeiro_vencimento is null
       or p_data_prevista_quitacao is not null then
      raise exception 'Parametros invalidos para negociacao parcelada.' using errcode = '22023';
    end if;
    if round(p_valor_negociado, 2) < p_quantidade_parcelas * 0.01 then
      raise exception 'Valor insuficiente para gerar parcelas positivas.' using errcode = '22023';
    end if;
  else
    raise exception 'Forma de pagamento invalida.' using errcode = '22023';
  end if;

  insert into public.devedores_negociacoes (
    divida_id, negociacao_anterior_id, forma_pagamento, valor_negociado,
    data_prevista_quitacao, quantidade_parcelas, primeiro_vencimento, observacoes,
    idempotencia, criado_por, criado_por_nome_snapshot, criado_por_perfil_snapshot
  ) values (
    p_divida_id, p_negociacao_anterior_id, p_forma_pagamento, round(p_valor_negociado, 2),
    p_data_prevista_quitacao, p_quantidade_parcelas, p_primeiro_vencimento, nullif(btrim(p_observacoes), ''),
    p_idempotencia, p_usuario_id, p_usuario_nome, p_perfil
  ) returning id into v_negociacao_id;

  if p_forma_pagamento = 'parcelada' then
    v_valor_base := trunc(round(p_valor_negociado, 2) / p_quantidade_parcelas, 2);
    v_valor_ultima := round(p_valor_negociado, 2) - v_valor_base * (p_quantidade_parcelas - 1);
    for v_numero in 1..p_quantidade_parcelas loop
      insert into public.devedores_parcelas (negociacao_id, divida_id, numero, valor, vencimento)
      values (
        v_negociacao_id,
        p_divida_id,
        v_numero,
        case when v_numero = p_quantidade_parcelas then v_valor_ultima else v_valor_base end,
        (p_primeiro_vencimento + make_interval(months => v_numero - 1))::date
      );
    end loop;
  end if;

  update public.devedores_dividas
  set versao = versao + 1, atualizado_por = p_usuario_id, atualizado_em = now()
  where id = p_divida_id;

  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_novos,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  )
  select d.relatorio_id, d.id, 'negociacao', v_negociacao_id, p_acao,
    jsonb_build_object(
      'negociacao_id', v_negociacao_id,
      'negociacao_anterior_id', p_negociacao_anterior_id,
      'forma_pagamento', p_forma_pagamento,
      'valor_negociado', round(p_valor_negociado, 2),
      'data_prevista_quitacao', p_data_prevista_quitacao,
      'quantidade_parcelas', p_quantidade_parcelas,
      'primeiro_vencimento', p_primeiro_vencimento,
      'idempotencia', p_idempotencia
    ),
    p_usuario_id, p_usuario_nome, p_perfil, p_correlation_id
  from public.devedores_dividas d where d.id = p_divida_id;

  if p_forma_pagamento = 'parcelada' then
    insert into public.devedores_historico (
      relatorio_id, divida_id, entidade, entidade_id, acao, dados_novos,
      usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
    )
    select d.relatorio_id, d.id, 'negociacao', v_negociacao_id, 'parcelas_geradas',
      jsonb_build_object('quantidade', p_quantidade_parcelas, 'valor_total', round(p_valor_negociado, 2)),
      p_usuario_id, p_usuario_nome, p_perfil, p_correlation_id
    from public.devedores_dividas d where d.id = p_divida_id;
  end if;

  return v_negociacao_id;
end;
$$;

revoke all on function private.devedores_gravar_negociacao(bigint,text,numeric,date,integer,date,text,uuid,uuid,text,text,bigint,text,uuid)
  from public, anon, authenticated;

create or replace function public.devedores_criar_negociacao(
  p_divida_id bigint,
  p_versao_esperada bigint,
  p_forma_pagamento text,
  p_valor_negociado numeric,
  p_data_prevista_quitacao date,
  p_quantidade_parcelas integer,
  p_primeiro_vencimento date,
  p_observacoes text,
  p_idempotencia uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_identidade record;
  v_divida public.devedores_dividas%rowtype;
  v_existente bigint;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('operador', 'administrador') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select id into v_existente from public.devedores_negociacoes
  where criado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;

  select * into v_divida from public.devedores_dividas where id = p_divida_id for update;
  if not found then raise exception 'Divida nao encontrada.' using errcode = 'P0002'; end if;
  select id into v_existente from public.devedores_negociacoes
  where criado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;
  if v_divida.versao <> p_versao_esperada then raise exception 'Versao desatualizada.' using errcode = '40001'; end if;
  if exists (select 1 from public.devedores_negociacoes where divida_id = p_divida_id and situacao = 'ativa') then
    raise exception 'A divida ja possui negociacao ativa.' using errcode = '23505';
  end if;

  begin
    return private.devedores_gravar_negociacao(
      p_divida_id, p_forma_pagamento, p_valor_negociado, p_data_prevista_quitacao,
      p_quantidade_parcelas, p_primeiro_vencimento, p_observacoes, p_idempotencia,
      auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, null,
      'negociacao_criada', gen_random_uuid()
    );
  exception when unique_violation then
    select id into v_existente from public.devedores_negociacoes
    where criado_por = auth.uid() and idempotencia = p_idempotencia;
    if found then return v_existente; end if;
    raise;
  end;
end;
$$;

create or replace function public.devedores_substituir_negociacao(
  p_divida_id bigint,
  p_versao_esperada bigint,
  p_forma_pagamento text,
  p_valor_negociado numeric,
  p_data_prevista_quitacao date,
  p_quantidade_parcelas integer,
  p_primeiro_vencimento date,
  p_observacoes text,
  p_motivo text,
  p_idempotencia uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_identidade record;
  v_divida public.devedores_dividas%rowtype;
  v_anterior public.devedores_negociacoes%rowtype;
  v_existente bigint;
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('operador', 'administrador') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Motivo obrigatorio.' using errcode = '22023'; end if;

  select id into v_existente from public.devedores_negociacoes
  where criado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;

  select * into v_divida from public.devedores_dividas where id = p_divida_id for update;
  if not found then raise exception 'Divida nao encontrada.' using errcode = 'P0002'; end if;
  select id into v_existente from public.devedores_negociacoes
  where criado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;
  if v_divida.versao <> p_versao_esperada then raise exception 'Versao desatualizada.' using errcode = '40001'; end if;

  select * into v_anterior from public.devedores_negociacoes
  where divida_id = p_divida_id and situacao = 'ativa' for update;
  if not found then raise exception 'Negociacao ativa nao encontrada.' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.devedores_pagamentos pg
    left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
    where pg.negociacao_id = v_anterior.id and e.id is null
  ) then
    raise exception 'Negociacao com pagamento valido nao pode ser substituida.' using errcode = 'P0001';
  end if;

  update public.devedores_negociacoes
  set situacao = 'substituida', motivo_substituicao = btrim(p_motivo),
      substituida_por = auth.uid(), substituida_em = now(), versao = versao + 1
  where id = v_anterior.id;

  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos, motivo,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values (
    v_divida.relatorio_id, v_divida.id, 'negociacao', v_anterior.id, 'negociacao_substituida',
    to_jsonb(v_anterior) - 'idempotencia', jsonb_build_object('situacao', 'substituida'), btrim(p_motivo),
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
  );

  return private.devedores_gravar_negociacao(
    p_divida_id, p_forma_pagamento, p_valor_negociado, p_data_prevista_quitacao,
    p_quantidade_parcelas, p_primeiro_vencimento, p_observacoes, p_idempotencia,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_anterior.id,
    'negociacao_substituta_criada', v_correlation_id
  );
end;
$$;

commit;
