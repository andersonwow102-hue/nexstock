begin;

create or replace function public.devedores_corrigir_relatorio_gerente(
  p_relatorio_id bigint,
  p_versao_esperada bigint,
  p_nome text,
  p_nome_fantasia text,
  p_endereco text,
  p_numero text,
  p_complemento text,
  p_bairro text,
  p_cidade text,
  p_estado text,
  p_telefone text,
  p_observacoes_cadastrais text
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_identidade record;
  v_anterior public.devedores_relatorios%rowtype;
  v_novo public.devedores_relatorios%rowtype;
  v_divida public.devedores_dividas%rowtype;
  v_divida_id bigint;
  v_correlation_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_anteriores jsonb := '{}'::jsonb;
  v_novos jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'gerente' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select * into v_anterior from public.devedores_relatorios
  where id = p_relatorio_id and gerente_responsavel_id = auth.uid()
  for update;
  if not found then raise exception 'Relatorio nao encontrado no escopo do gerente.' using errcode = 'P0002'; end if;
  if v_anterior.versao <> p_versao_esperada then raise exception 'Registro alterado por outro usuario. Atualize e tente novamente.' using errcode = '40001'; end if;

  select * into v_divida from public.devedores_dividas
  where relatorio_id = p_relatorio_id and gerente_responsavel_id = auth.uid()
  for update;
  if not found then raise exception 'Divida vinculada nao encontrada.' using errcode = 'P0002'; end if;

  if coalesce(btrim(p_nome), '') = '' or coalesce(btrim(p_endereco), '') = ''
     or coalesce(btrim(p_numero), '') = '' or coalesce(btrim(p_cidade), '') = ''
     or upper(btrim(coalesce(p_estado, ''))) !~ '^[A-Z]{2}$'
     or char_length(btrim(coalesce(p_telefone, ''))) < 8 then
    raise exception 'Dados cadastrais obrigatorios invalidos.' using errcode = '22023';
  end if;

  v_anteriores := v_anteriores
    || case when v_anterior.nome is distinct from btrim(p_nome) then jsonb_build_object('nome', v_anterior.nome) else '{}'::jsonb end
    || case when v_anterior.nome_fantasia is distinct from nullif(btrim(p_nome_fantasia), '') then jsonb_build_object('nome_fantasia', v_anterior.nome_fantasia) else '{}'::jsonb end
    || case when v_anterior.endereco is distinct from btrim(p_endereco) then jsonb_build_object('endereco', v_anterior.endereco) else '{}'::jsonb end
    || case when v_anterior.numero is distinct from btrim(p_numero) then jsonb_build_object('numero', v_anterior.numero) else '{}'::jsonb end
    || case when v_anterior.complemento is distinct from nullif(btrim(p_complemento), '') then jsonb_build_object('complemento', v_anterior.complemento) else '{}'::jsonb end
    || case when v_anterior.bairro is distinct from nullif(btrim(p_bairro), '') then jsonb_build_object('bairro', v_anterior.bairro) else '{}'::jsonb end
    || case when v_anterior.cidade is distinct from btrim(p_cidade) then jsonb_build_object('cidade', v_anterior.cidade) else '{}'::jsonb end
    || case when v_anterior.estado is distinct from upper(btrim(p_estado)) then jsonb_build_object('estado', v_anterior.estado) else '{}'::jsonb end
    || case when v_anterior.telefone is distinct from btrim(p_telefone) then jsonb_build_object('telefone', v_anterior.telefone) else '{}'::jsonb end
    || case when v_anterior.observacoes_cadastrais is distinct from nullif(btrim(p_observacoes_cadastrais), '') then jsonb_build_object('observacoes_cadastrais', v_anterior.observacoes_cadastrais) else '{}'::jsonb end;

  if v_anteriores = '{}'::jsonb then
    raise exception 'Nenhuma alteracao cadastral informada.' using errcode = 'P0004';
  end if;

  v_novos := v_novos
    || case when v_anteriores ? 'nome' then jsonb_build_object('nome', btrim(p_nome)) else '{}'::jsonb end
    || case when v_anteriores ? 'nome_fantasia' then jsonb_build_object('nome_fantasia', nullif(btrim(p_nome_fantasia), '')) else '{}'::jsonb end
    || case when v_anteriores ? 'endereco' then jsonb_build_object('endereco', btrim(p_endereco)) else '{}'::jsonb end
    || case when v_anteriores ? 'numero' then jsonb_build_object('numero', btrim(p_numero)) else '{}'::jsonb end
    || case when v_anteriores ? 'complemento' then jsonb_build_object('complemento', nullif(btrim(p_complemento), '')) else '{}'::jsonb end
    || case when v_anteriores ? 'bairro' then jsonb_build_object('bairro', nullif(btrim(p_bairro), '')) else '{}'::jsonb end
    || case when v_anteriores ? 'cidade' then jsonb_build_object('cidade', btrim(p_cidade)) else '{}'::jsonb end
    || case when v_anteriores ? 'estado' then jsonb_build_object('estado', upper(btrim(p_estado))) else '{}'::jsonb end
    || case when v_anteriores ? 'telefone' then jsonb_build_object('telefone', btrim(p_telefone)) else '{}'::jsonb end
    || case when v_anteriores ? 'observacoes_cadastrais' then jsonb_build_object('observacoes_cadastrais', nullif(btrim(p_observacoes_cadastrais), '')) else '{}'::jsonb end;

  update public.devedores_relatorios set
    nome = btrim(p_nome), nome_fantasia = nullif(btrim(p_nome_fantasia), ''),
    endereco = btrim(p_endereco), numero = btrim(p_numero), complemento = nullif(btrim(p_complemento), ''),
    bairro = nullif(btrim(p_bairro), ''), cidade = btrim(p_cidade), estado = upper(btrim(p_estado)),
    telefone = btrim(p_telefone), observacoes_cadastrais = nullif(btrim(p_observacoes_cadastrais), ''),
    atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1
  where id = p_relatorio_id and versao = p_versao_esperada
  returning * into v_novo;
  if not found then raise exception 'Conflito de versao.' using errcode = '40001'; end if;

  v_snapshot := jsonb_build_object(
    'tipo', v_novo.tipo, 'nome', v_novo.nome, 'nome_fantasia', v_novo.nome_fantasia,
    'endereco', v_novo.endereco, 'numero', v_novo.numero, 'complemento', v_novo.complemento,
    'bairro', v_novo.bairro, 'cidade', v_novo.cidade, 'estado', v_novo.estado,
    'telefone', v_novo.telefone, 'observacoes_cadastrais', v_novo.observacoes_cadastrais
  );

  update public.devedores_dividas set
    relatorio_snapshot = v_snapshot, atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1
  where id = v_divida.id
  returning id into v_divida_id;

  v_anteriores := v_anteriores || jsonb_build_object('versao', v_anterior.versao, 'versao_divida', v_divida.versao);
  v_novos := v_novos || jsonb_build_object('versao', v_novo.versao, 'versao_divida', v_divida.versao + 1);
  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values (
    p_relatorio_id, v_divida_id, 'relatorio', p_relatorio_id, 'cadastro_corrigido_gerente',
    v_anteriores, v_novos,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
  );

  return v_novo.versao;
end;
$$;

revoke all on function public.devedores_corrigir_relatorio_gerente(bigint,bigint,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.devedores_corrigir_relatorio_gerente(bigint,bigint,text,text,text,text,text,text,text,text,text,text) to authenticated;

commit;
