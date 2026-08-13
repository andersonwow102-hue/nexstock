begin;

create or replace function public.devedores_cadastrar_relatorio_divida(
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
  p_observacoes_originais text default null
)
returns table (relatorio_id bigint, divida_id bigint)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_identidade record;
  v_modalidade public.devedores_modalidades%rowtype;
  v_relatorio public.devedores_relatorios%rowtype;
  v_divida_id bigint;
  v_correlation_id uuid := gen_random_uuid();
  v_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acesso nao autenticado.' using errcode = '42501';
  end if;

  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.perfil <> 'gerente' then
    raise exception 'Somente gerente pode cadastrar divida nesta fase.' using errcode = '42501';
  end if;

  if p_tipo not in ('pessoa', 'ponto') then raise exception 'Tipo de devedor invalido.' using errcode = '22023'; end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'Nome obrigatorio.' using errcode = '22023'; end if;
  if coalesce(btrim(p_endereco), '') = '' then raise exception 'Endereco obrigatorio.' using errcode = '22023'; end if;
  if coalesce(btrim(p_numero), '') = '' then raise exception 'Numero obrigatorio.' using errcode = '22023'; end if;
  if coalesce(btrim(p_cidade), '') = '' then raise exception 'Cidade obrigatoria.' using errcode = '22023'; end if;
  if upper(btrim(coalesce(p_estado, ''))) !~ '^[A-Z]{2}$' then raise exception 'Estado invalido.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_telefone, ''))) < 8 then raise exception 'Telefone invalido.' using errcode = '22023'; end if;
  if p_valor_original is null or p_valor_original <= 0 then raise exception 'Valor original deve ser maior que zero.' using errcode = '22023'; end if;
  if p_data_registro is null then raise exception 'Data do registro obrigatoria.' using errcode = '22023'; end if;

  select * into v_modalidade
  from public.devedores_modalidades
  where id = p_modalidade_id and ativo;
  if not found then raise exception 'Modalidade ativa nao encontrada.' using errcode = 'P0002'; end if;

  insert into public.devedores_relatorios (
    gerente_responsavel_id, gerente_nome_snapshot, tipo, nome, nome_fantasia,
    endereco, numero, complemento, bairro, cidade, estado, telefone,
    observacoes_cadastrais, criado_por, criado_por_nome_snapshot, atualizado_por
  ) values (
    auth.uid(), v_identidade.gerente_nome, p_tipo, btrim(p_nome), nullif(btrim(p_nome_fantasia), ''),
    btrim(p_endereco), btrim(p_numero), nullif(btrim(p_complemento), ''), nullif(btrim(p_bairro), ''),
    btrim(p_cidade), upper(btrim(p_estado)), btrim(p_telefone), nullif(btrim(p_observacoes_cadastrais), ''),
    auth.uid(), v_identidade.usuario_nome, auth.uid()
  ) returning * into v_relatorio;

  v_snapshot := jsonb_build_object(
    'tipo', v_relatorio.tipo, 'nome', v_relatorio.nome, 'nome_fantasia', v_relatorio.nome_fantasia,
    'endereco', v_relatorio.endereco, 'numero', v_relatorio.numero, 'complemento', v_relatorio.complemento,
    'bairro', v_relatorio.bairro, 'cidade', v_relatorio.cidade, 'estado', v_relatorio.estado,
    'telefone', v_relatorio.telefone, 'observacoes_cadastrais', v_relatorio.observacoes_cadastrais
  );

  insert into public.devedores_dividas (
    relatorio_id, gerente_responsavel_id, gerente_nome_snapshot, valor_original,
    modalidade_id, modalidade_nome_snapshot, data_registro, observacoes_originais,
    relatorio_snapshot, criado_por, criado_por_nome_snapshot, atualizado_por
  ) values (
    v_relatorio.id, auth.uid(), v_identidade.gerente_nome, round(p_valor_original, 2),
    v_modalidade.id, v_modalidade.nome, p_data_registro, nullif(btrim(p_observacoes_originais), ''),
    v_snapshot, auth.uid(), v_identidade.usuario_nome, auth.uid()
  ) returning id into v_divida_id;

  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_novos,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values
    (v_relatorio.id, v_divida_id, 'relatorio', v_relatorio.id, 'cadastro_criado', v_snapshot,
     auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id),
    (v_relatorio.id, v_divida_id, 'divida', v_divida_id, 'divida_criada',
     jsonb_build_object('valor_original', round(p_valor_original, 2), 'modalidade_id', v_modalidade.id,
       'modalidade', v_modalidade.nome, 'data_registro', p_data_registro, 'gerente', v_identidade.gerente_nome),
     auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id);

  return query select v_relatorio.id, v_divida_id;
end;
$$;

revoke all on function public.devedores_cadastrar_relatorio_divida(text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text) from public, anon;
grant execute on function public.devedores_cadastrar_relatorio_divida(text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text) to authenticated;

commit;
