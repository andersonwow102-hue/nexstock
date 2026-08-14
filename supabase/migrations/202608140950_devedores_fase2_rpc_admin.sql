begin;

create or replace function public.devedores_corrigir_negociacao_admin(
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
  v_anterior public.devedores_negociacoes%rowtype;
  v_nova public.devedores_negociacoes%rowtype;
  v_divida public.devedores_dividas%rowtype;
  v_nova_id bigint;
  v_existente bigint;
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode realizar correcao administrativa.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Motivo obrigatorio.' using errcode = '22023'; end if;

  select id into v_existente from public.devedores_negociacoes
  where criado_por = auth.uid() and idempotencia = p_idempotencia;
  if found then return v_existente; end if;

  select * into v_anterior from public.devedores_negociacoes
  where divida_id = p_divida_id and situacao = 'ativa';
  if not found then raise exception 'Negociacao ativa nao encontrada.' using errcode = 'P0002'; end if;

  v_nova_id := public.devedores_substituir_negociacao(
    p_divida_id, p_versao_esperada, p_forma_pagamento, p_valor_negociado,
    p_data_prevista_quitacao, p_quantidade_parcelas, p_primeiro_vencimento,
    p_observacoes, p_motivo, p_idempotencia
  );

  select * into v_nova from public.devedores_negociacoes where id = v_nova_id;
  select * into v_divida from public.devedores_dividas where id = p_divida_id;
  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos, motivo,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values (
    v_divida.relatorio_id, v_divida.id, 'negociacao', v_nova.id, 'negociacao_corrigida_admin',
    to_jsonb(v_anterior) - 'idempotencia', to_jsonb(v_nova) - 'idempotencia', btrim(p_motivo),
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
  );
  return v_nova_id;
end;
$$;

commit;
