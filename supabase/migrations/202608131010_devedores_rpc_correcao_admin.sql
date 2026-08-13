begin;

create or replace function public.devedores_corrigir_fase1_admin(
  p_divida_id bigint,
  p_versao_relatorio bigint,
  p_versao_divida bigint,
  p_tipo text,
  p_nome text,
  p_nome_fantasia text,
  p_endereco text,
  p_numero text,
  p_complemento text,
  p_bairro text,
  p_cidade text,
  p_estado text,
  p_telefone text,
  p_observacoes_cadastrais text,
  p_valor_original numeric,
  p_modalidade_id bigint,
  p_data_registro date,
  p_observacoes_originais text,
  p_motivo text
)
returns table (nova_versao_relatorio bigint, nova_versao_divida bigint)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_identidade record;
  v_relatorio_anterior public.devedores_relatorios%rowtype;
  v_relatorio_novo public.devedores_relatorios%rowtype;
  v_divida_anterior public.devedores_dividas%rowtype;
  v_divida_nova public.devedores_dividas%rowtype;
  v_modalidade public.devedores_modalidades%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_relatorio_anteriores jsonb := '{}'::jsonb;
  v_relatorio_novos jsonb := '{}'::jsonb;
  v_divida_anteriores jsonb := '{}'::jsonb;
  v_divida_novos jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Acesso exclusivo do administrador.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Motivo da correcao obrigatorio.' using errcode = '22023'; end if;
  if p_tipo not in ('pessoa', 'ponto') or coalesce(btrim(p_nome), '') = ''
     or coalesce(btrim(p_endereco), '') = '' or coalesce(btrim(p_numero), '') = ''
     or coalesce(btrim(p_cidade), '') = '' or upper(btrim(coalesce(p_estado, ''))) !~ '^[A-Z]{2}$'
     or char_length(btrim(coalesce(p_telefone, ''))) < 8
     or p_valor_original is null or p_valor_original <= 0 or p_data_registro is null then
    raise exception 'Dados obrigatorios invalidos.' using errcode = '22023';
  end if;

  select * into v_divida_anterior from public.devedores_dividas where id = p_divida_id for update;
  if not found then raise exception 'Divida nao encontrada.' using errcode = 'P0002'; end if;
  select * into v_relatorio_anterior from public.devedores_relatorios where id = v_divida_anterior.relatorio_id for update;
  if v_relatorio_anterior.versao <> p_versao_relatorio or v_divida_anterior.versao <> p_versao_divida then
    raise exception 'Registro alterado por outro usuario. Atualize e tente novamente.' using errcode = '40001';
  end if;

  select * into v_modalidade from public.devedores_modalidades where id = p_modalidade_id and ativo;
  if not found then raise exception 'Modalidade ativa nao encontrada.' using errcode = 'P0002'; end if;

  v_relatorio_anteriores := v_relatorio_anteriores
    || case when v_relatorio_anterior.tipo is distinct from p_tipo then jsonb_build_object('tipo', v_relatorio_anterior.tipo) else '{}'::jsonb end
    || case when v_relatorio_anterior.nome is distinct from btrim(p_nome) then jsonb_build_object('nome', v_relatorio_anterior.nome) else '{}'::jsonb end
    || case when v_relatorio_anterior.nome_fantasia is distinct from nullif(btrim(p_nome_fantasia), '') then jsonb_build_object('nome_fantasia', v_relatorio_anterior.nome_fantasia) else '{}'::jsonb end
    || case when v_relatorio_anterior.endereco is distinct from btrim(p_endereco) then jsonb_build_object('endereco', v_relatorio_anterior.endereco) else '{}'::jsonb end
    || case when v_relatorio_anterior.numero is distinct from btrim(p_numero) then jsonb_build_object('numero', v_relatorio_anterior.numero) else '{}'::jsonb end
    || case when v_relatorio_anterior.complemento is distinct from nullif(btrim(p_complemento), '') then jsonb_build_object('complemento', v_relatorio_anterior.complemento) else '{}'::jsonb end
    || case when v_relatorio_anterior.bairro is distinct from nullif(btrim(p_bairro), '') then jsonb_build_object('bairro', v_relatorio_anterior.bairro) else '{}'::jsonb end
    || case when v_relatorio_anterior.cidade is distinct from btrim(p_cidade) then jsonb_build_object('cidade', v_relatorio_anterior.cidade) else '{}'::jsonb end
    || case when v_relatorio_anterior.estado is distinct from upper(btrim(p_estado)) then jsonb_build_object('estado', v_relatorio_anterior.estado) else '{}'::jsonb end
    || case when v_relatorio_anterior.telefone is distinct from btrim(p_telefone) then jsonb_build_object('telefone', v_relatorio_anterior.telefone) else '{}'::jsonb end
    || case when v_relatorio_anterior.observacoes_cadastrais is distinct from nullif(btrim(p_observacoes_cadastrais), '') then jsonb_build_object('observacoes_cadastrais', v_relatorio_anterior.observacoes_cadastrais) else '{}'::jsonb end;

  v_relatorio_novos := v_relatorio_novos
    || case when v_relatorio_anteriores ? 'tipo' then jsonb_build_object('tipo', p_tipo) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'nome' then jsonb_build_object('nome', btrim(p_nome)) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'nome_fantasia' then jsonb_build_object('nome_fantasia', nullif(btrim(p_nome_fantasia), '')) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'endereco' then jsonb_build_object('endereco', btrim(p_endereco)) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'numero' then jsonb_build_object('numero', btrim(p_numero)) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'complemento' then jsonb_build_object('complemento', nullif(btrim(p_complemento), '')) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'bairro' then jsonb_build_object('bairro', nullif(btrim(p_bairro), '')) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'cidade' then jsonb_build_object('cidade', btrim(p_cidade)) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'estado' then jsonb_build_object('estado', upper(btrim(p_estado))) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'telefone' then jsonb_build_object('telefone', btrim(p_telefone)) else '{}'::jsonb end
    || case when v_relatorio_anteriores ? 'observacoes_cadastrais' then jsonb_build_object('observacoes_cadastrais', nullif(btrim(p_observacoes_cadastrais), '')) else '{}'::jsonb end;

  v_divida_anteriores := v_divida_anteriores
    || case when v_divida_anterior.valor_original is distinct from round(p_valor_original, 2) then jsonb_build_object('valor_original', v_divida_anterior.valor_original) else '{}'::jsonb end
    || case when v_divida_anterior.modalidade_id is distinct from v_modalidade.id then jsonb_build_object('modalidade_id', v_divida_anterior.modalidade_id, 'modalidade', v_divida_anterior.modalidade_nome_snapshot) else '{}'::jsonb end
    || case when v_divida_anterior.data_registro is distinct from p_data_registro then jsonb_build_object('data_registro', v_divida_anterior.data_registro) else '{}'::jsonb end
    || case when v_divida_anterior.observacoes_originais is distinct from nullif(btrim(p_observacoes_originais), '') then jsonb_build_object('observacoes_originais', v_divida_anterior.observacoes_originais) else '{}'::jsonb end;

  v_divida_novos := v_divida_novos
    || case when v_divida_anteriores ? 'valor_original' then jsonb_build_object('valor_original', round(p_valor_original, 2)) else '{}'::jsonb end
    || case when v_divida_anteriores ? 'modalidade_id' then jsonb_build_object('modalidade_id', v_modalidade.id, 'modalidade', v_modalidade.nome) else '{}'::jsonb end
    || case when v_divida_anteriores ? 'data_registro' then jsonb_build_object('data_registro', p_data_registro) else '{}'::jsonb end
    || case when v_divida_anteriores ? 'observacoes_originais' then jsonb_build_object('observacoes_originais', nullif(btrim(p_observacoes_originais), '')) else '{}'::jsonb end;

  if v_relatorio_anteriores = '{}'::jsonb and v_divida_anteriores = '{}'::jsonb then
    raise exception 'Nenhuma alteracao informada.' using errcode = 'P0004';
  end if;

  if v_relatorio_anteriores <> '{}'::jsonb then
    update public.devedores_relatorios set
      tipo = p_tipo, nome = btrim(p_nome), nome_fantasia = nullif(btrim(p_nome_fantasia), ''),
      endereco = btrim(p_endereco), numero = btrim(p_numero), complemento = nullif(btrim(p_complemento), ''),
      bairro = nullif(btrim(p_bairro), ''), cidade = btrim(p_cidade), estado = upper(btrim(p_estado)),
      telefone = btrim(p_telefone), observacoes_cadastrais = nullif(btrim(p_observacoes_cadastrais), ''),
      atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1
    where id = v_relatorio_anterior.id and versao = p_versao_relatorio returning * into v_relatorio_novo;
    if not found then raise exception 'Conflito de versao.' using errcode = '40001'; end if;
  else
    v_relatorio_novo := v_relatorio_anterior;
  end if;

  v_snapshot := jsonb_build_object(
    'tipo', v_relatorio_novo.tipo, 'nome', v_relatorio_novo.nome, 'nome_fantasia', v_relatorio_novo.nome_fantasia,
    'endereco', v_relatorio_novo.endereco, 'numero', v_relatorio_novo.numero, 'complemento', v_relatorio_novo.complemento,
    'bairro', v_relatorio_novo.bairro, 'cidade', v_relatorio_novo.cidade, 'estado', v_relatorio_novo.estado,
    'telefone', v_relatorio_novo.telefone, 'observacoes_cadastrais', v_relatorio_novo.observacoes_cadastrais
  );

  update public.devedores_dividas set
    valor_original = round(p_valor_original, 2), modalidade_id = v_modalidade.id,
    modalidade_nome_snapshot = v_modalidade.nome, data_registro = p_data_registro,
    observacoes_originais = nullif(btrim(p_observacoes_originais), ''), relatorio_snapshot = v_snapshot,
    atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1
  where id = p_divida_id and versao = p_versao_divida returning * into v_divida_nova;
  if not found then raise exception 'Conflito de versao.' using errcode = '40001'; end if;

  if v_relatorio_anteriores <> '{}'::jsonb then
    v_relatorio_anteriores := v_relatorio_anteriores || jsonb_build_object('versao', v_relatorio_anterior.versao);
    v_relatorio_novos := v_relatorio_novos || jsonb_build_object('versao', v_relatorio_novo.versao);
  end if;
  v_divida_anteriores := v_divida_anteriores || jsonb_build_object('versao', v_divida_anterior.versao);
  v_divida_novos := v_divida_novos || jsonb_build_object('versao', v_divida_nova.versao);

  if v_relatorio_anteriores <> '{}'::jsonb then
    insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos, motivo,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
    ) values
    (v_relatorio_novo.id, p_divida_id, 'relatorio', v_relatorio_novo.id, 'cadastro_corrigido_admin',
     v_relatorio_anteriores, v_relatorio_novos, btrim(p_motivo),
     auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id);
  end if;

  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos, motivo,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values
    (v_relatorio_novo.id, p_divida_id, 'divida', p_divida_id, 'divida_corrigida_admin',
     v_divida_anteriores, v_divida_novos, btrim(p_motivo),
     auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id);

  return query select v_relatorio_novo.versao, v_divida_nova.versao;
end;
$$;

revoke all on function public.devedores_corrigir_fase1_admin(bigint,bigint,bigint,text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text,text) from public, anon;
grant execute on function public.devedores_corrigir_fase1_admin(bigint,bigint,bigint,text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text,text) to authenticated;

commit;
