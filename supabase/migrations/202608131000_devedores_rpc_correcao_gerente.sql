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
  v_divida_id bigint;
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.perfil <> 'gerente' then raise exception 'Acesso negado.' using errcode = '42501'; end if;

  select * into v_anterior from public.devedores_relatorios
  where id = p_relatorio_id and gerente_responsavel_id = auth.uid()
  for update;
  if not found then raise exception 'Relatorio nao encontrado no escopo do gerente.' using errcode = 'P0002'; end if;
  if v_anterior.versao <> p_versao_esperada then raise exception 'Registro alterado por outro usuario. Atualize e tente novamente.' using errcode = '40001'; end if;

  if coalesce(btrim(p_nome), '') = '' or coalesce(btrim(p_endereco), '') = ''
     or coalesce(btrim(p_numero), '') = '' or coalesce(btrim(p_cidade), '') = ''
     or upper(btrim(coalesce(p_estado, ''))) !~ '^[A-Z]{2}$'
     or char_length(btrim(coalesce(p_telefone, ''))) < 8 then
    raise exception 'Dados cadastrais obrigatorios invalidos.' using errcode = '22023';
  end if;

  update public.devedores_relatorios set
    nome = btrim(p_nome), nome_fantasia = nullif(btrim(p_nome_fantasia), ''),
    endereco = btrim(p_endereco), numero = btrim(p_numero), complemento = nullif(btrim(p_complemento), ''),
    bairro = nullif(btrim(p_bairro), ''), cidade = btrim(p_cidade), estado = upper(btrim(p_estado)),
    telefone = btrim(p_telefone), observacoes_cadastrais = nullif(btrim(p_observacoes_cadastrais), ''),
    atualizado_por = auth.uid(), atualizado_em = now(), versao = versao + 1
  where id = p_relatorio_id and versao = p_versao_esperada
  returning * into v_novo;
  if not found then raise exception 'Conflito de versao.' using errcode = '40001'; end if;

  select id into v_divida_id from public.devedores_dividas where relatorio_id = p_relatorio_id;
  insert into public.devedores_historico (
    relatorio_id, divida_id, entidade, entidade_id, acao, dados_anteriores, dados_novos,
    usuario_id, usuario_nome_snapshot, perfil_snapshot, correlation_id
  ) values (
    p_relatorio_id, v_divida_id, 'relatorio', p_relatorio_id, 'cadastro_corrigido_gerente',
    to_jsonb(v_anterior) - array['criado_por','atualizado_por'],
    to_jsonb(v_novo) - array['criado_por','atualizado_por'],
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil, v_correlation_id
  );

  return v_novo.versao;
end;
$$;

revoke all on function public.devedores_corrigir_relatorio_gerente(bigint,bigint,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.devedores_corrigir_relatorio_gerente(bigint,bigint,text,text,text,text,text,text,text,text,text,text) to authenticated;

commit;
