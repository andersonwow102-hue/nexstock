begin;

create or replace function public.devedores_registrar_pagamento(
  p_negociacao_id bigint,
  p_parcela_id bigint,
  p_versao_esperada bigint,
  p_valor numeric,
  p_data_pagamento date,
  p_observacao text,
  p_idempotencia uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_identidade record;
  v_negociacao public.devedores_negociacoes%rowtype;
  v_divida public.devedores_dividas%rowtype;
  v_parcela public.devedores_parcelas%rowtype;
  v_existente bigint;
  v_total_pago numeric(14,2);
  v_pago_parcela numeric(14,2);
  v_pagamento_id bigint;
  v_saldo_antes numeric(14,2);
  v_saldo_depois numeric(14,2);
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil not in ('operador', 'administrador') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_idempotencia is null then raise exception 'Chave de idempotencia obrigatoria.' using errcode = '22023'; end if;
  if p_valor is null or round(p_valor, 2) <= 0 then raise exception 'Valor deve ser maior que zero.' using errcode = '22023'; end if;
  if p_data_pagamento is null then raise exception 'Data do pagamento obrigatoria.' using errcode = '22023'; end if;

  select id into v_existente from public.devedores_pagamentos
  where registrado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;

  select * into v_negociacao from public.devedores_negociacoes
  where id = p_negociacao_id and situacao = 'ativa' for update;
  if not found then raise exception 'Negociacao ativa nao encontrada.' using errcode = 'P0002'; end if;
  select id into v_existente from public.devedores_pagamentos
  where registrado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;
  if v_negociacao.versao <> p_versao_esperada then raise exception 'Versao desatualizada.' using errcode = '40001'; end if;
  select * into v_divida from public.devedores_dividas where id = v_negociacao.divida_id for update;

  select coalesce(sum(pg.valor), 0)::numeric(14,2) into v_total_pago
  from public.devedores_pagamentos pg
  left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
  where pg.negociacao_id = v_negociacao.id and e.id is null;
  v_saldo_antes := v_negociacao.valor_negociado - v_total_pago;
  if round(p_valor, 2) > v_saldo_antes then
    raise exception 'Pagamento excede o saldo da negociacao.' using errcode = '22003';
  end if;

  if v_negociacao.forma_pagamento = 'parcelada' then
    if p_parcela_id is null then raise exception 'Parcela obrigatoria.' using errcode = '22023'; end if;
    select * into v_parcela from public.devedores_parcelas
    where id = p_parcela_id and negociacao_id = v_negociacao.id for update;
    if not found then raise exception 'Parcela nao encontrada na negociacao.' using errcode = 'P0002'; end if;
    select coalesce(sum(pg.valor), 0)::numeric(14,2) into v_pago_parcela
    from public.devedores_pagamentos pg
    left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
    where pg.parcela_id = v_parcela.id and e.id is null;
    if round(p_valor, 2) > v_parcela.valor - v_pago_parcela then
      raise exception 'Pagamento excede o saldo da parcela.' using errcode = '22003';
    end if;
  elsif p_parcela_id is not null then
    raise exception 'Negociacao a vista nao aceita parcela.' using errcode = '22023';
  end if;

  begin
    insert into public.devedores_pagamentos (
      divida_id, negociacao_id, parcela_id, valor, data_pagamento, observacao, idempotencia,
      registrado_por, registrado_por_nome_snapshot, registrado_por_perfil_snapshot
    ) values (
      v_negociacao.divida_id, v_negociacao.id, p_parcela_id, round(p_valor, 2), p_data_pagamento,
      nullif(btrim(p_observacao), ''), p_idempotencia, auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
    ) returning id into v_pagamento_id;
  exception when unique_violation then
    select id into v_existente from public.devedores_pagamentos
    where registrado_por = auth.uid() and idempotencia = p_idempotencia;
    if found then return v_existente; end if;
    raise;
  end;

  update public.devedores_negociacoes set versao = versao + 1 where id = v_negociacao.id;
  update public.devedores_dividas
  set versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
  where id = v_negociacao.divida_id;

  v_saldo_depois := v_saldo_antes - round(p_valor, 2);
  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values (
    v_divida.relatorio_id, v_divida.id, 'pagamento', v_pagamento_id,
    case
      when v_saldo_depois = 0
        or (v_negociacao.forma_pagamento = 'parcelada' and round(p_valor, 2) = v_parcela.valor - v_pago_parcela)
      then 'pagamento_integral'
      else 'pagamento_parcial'
    end,
    jsonb_build_object('saldo', v_saldo_antes),
    jsonb_build_object('pagamento_id', v_pagamento_id, 'parcela_id', p_parcela_id,
      'valor', round(p_valor, 2), 'data_pagamento', p_data_pagamento,
      'saldo', v_saldo_depois, 'idempotencia', p_idempotencia),
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
  );
  if v_saldo_depois = 0 then
    insert into public.devedores_historico (
      relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos,
      usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
    ) values (
      v_divida.relatorio_id, v_divida.id, 'divida', v_divida.id, 'divida_quitada',
      jsonb_build_object('situacao', case when v_saldo_antes < v_negociacao.valor_negociado then 'parcialmente_paga' else 'negociada' end),
      jsonb_build_object('situacao', 'quitada', 'saldo', 0),
      auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
    );
  end if;
  return v_pagamento_id;
end;
$$;

create or replace function public.devedores_estornar_pagamento(
  p_pagamento_id bigint,
  p_versao_esperada bigint,
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
  v_pagamento public.devedores_pagamentos%rowtype;
  v_negociacao public.devedores_negociacoes%rowtype;
  v_divida public.devedores_dividas%rowtype;
  v_existente bigint;
  v_estorno_id bigint;
  v_total_pago numeric(14,2);
  v_saldo_antes numeric(14,2);
  v_saldo_depois numeric(14,2);
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode estornar pagamento.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Motivo obrigatorio.' using errcode = '22023'; end if;
  if p_idempotencia is null then raise exception 'Chave de idempotencia obrigatoria.' using errcode = '22023'; end if;

  select id into v_existente from public.devedores_pagamentos_estornos
  where estornado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;

  select * into v_pagamento from public.devedores_pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'Pagamento nao encontrado.' using errcode = 'P0002'; end if;
  select * into v_negociacao from public.devedores_negociacoes where id = v_pagamento.negociacao_id for update;
  select id into v_existente from public.devedores_pagamentos_estornos
  where estornado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;
  if v_negociacao.versao <> p_versao_esperada then raise exception 'Versao desatualizada.' using errcode = '40001'; end if;
  if exists (select 1 from public.devedores_pagamentos_estornos where pagamento_id = p_pagamento_id) then
    raise exception 'Pagamento ja estornado.' using errcode = '23505';
  end if;
  select * into v_divida from public.devedores_dividas where id = v_pagamento.divida_id for update;

  select coalesce(sum(pg.valor), 0)::numeric(14,2) into v_total_pago
  from public.devedores_pagamentos pg
  left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
  where pg.negociacao_id = v_negociacao.id and e.id is null;
  v_saldo_antes := v_negociacao.valor_negociado - v_total_pago;

  begin
    insert into public.devedores_pagamentos_estornos (
      pagamento_id, divida_id, motivo, idempotencia, estornado_por,
      estornado_por_nome_snapshot, estornado_por_perfil_snapshot
    ) values (
      v_pagamento.id, v_pagamento.divida_id, btrim(p_motivo), p_idempotencia, auth.uid(),
      v_identidade.usuario_nome, v_identidade.perfil
    ) returning id into v_estorno_id;
  exception when unique_violation then
    select id into v_existente from public.devedores_pagamentos_estornos
    where estornado_por = auth.uid() and idempotencia = p_idempotencia;
    if found then return v_existente; end if;
    raise;
  end;

  update public.devedores_negociacoes set versao = versao + 1 where id = v_negociacao.id;
  update public.devedores_dividas
  set versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
  where id = v_pagamento.divida_id;
  v_saldo_depois := v_saldo_antes + v_pagamento.valor;

  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos, motivo,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values (
    v_divida.relatorio_id, v_divida.id, 'estorno', v_estorno_id, 'pagamento_estornado',
    jsonb_build_object('pagamento_id', v_pagamento.id, 'valor', v_pagamento.valor, 'saldo', v_saldo_antes),
    jsonb_build_object('estorno_id', v_estorno_id, 'saldo', v_saldo_depois, 'idempotencia', p_idempotencia),
    btrim(p_motivo), auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
  );
  if v_saldo_antes = 0 then
    insert into public.devedores_historico (
      relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos, motivo,
      usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
    ) values (
      v_divida.relatorio_id, v_divida.id, 'divida', v_divida.id, 'divida_reaberta_por_estorno',
      jsonb_build_object('situacao', 'quitada', 'saldo', 0),
      jsonb_build_object('situacao', case when v_saldo_depois < v_negociacao.valor_negociado then 'parcialmente_paga' else 'negociada' end, 'saldo', v_saldo_depois),
      btrim(p_motivo), auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
    );
  end if;
  return v_estorno_id;
end;
$$;

commit;
