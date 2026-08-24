-- Executar somente em Supabase local descartavel com ON_ERROR_STOP=1.
-- O teste inteiro termina com rollback.

begin;

do $$
begin
  if has_table_privilege('authenticated','public.solicitacoes_status_ponto','INSERT,UPDATE,DELETE') then
    raise exception 'Authenticated recebeu escrita direta em solicitacoes.';
  end if;
  if has_table_privilege('authenticated','public.historico_status_pontos','INSERT,UPDATE,DELETE') then
    raise exception 'Authenticated recebeu escrita direta em auditoria.';
  end if;
  if has_function_privilege('anon','public.solicitar_desativacao_ponto(bigint,text)','EXECUTE')
     or has_function_privilege('anon','public.decidir_desativacao_ponto(bigint,boolean,text)','EXECUTE')
     or has_function_privilege('anon','public.reativar_ponto(bigint,text)','EXECUTE') then
    raise exception 'Anon recebeu RPC mutavel.';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename in ('solicitacoes_status_ponto','historico_status_pontos')) <> 2 then
    raise exception 'Matriz RLS inesperada.';
  end if;
end;
$$;

do $$
declare
  v_ponto public.pontos%rowtype;
begin
  select * into strict v_ponto from public.pontos where nome_fantasia = 'PONTO EXISTENTE CONTROLE';
  if v_ponto.situacao_operacional <> 'ativo' or v_ponto.versao_operacional <> 1 then
    raise exception 'Registro anterior nao permaneceu ativo.';
  end if;
  if v_ponto.valor_despesa <> 123.45 or v_ponto.modalidades is distinct from array['Viapix','90 da Sorte']::text[] then
    raise exception 'Migration alterou dados operacionais do ponto existente.';
  end if;
  if not exists (select 1 from public.equipamentos where nome='EQUIPAMENTO CONTROLE' and localizacao='PONTO EXISTENTE CONTROLE') then
    raise exception 'Migration movimentou equipamento existente.';
  end if;
  if not exists (select 1 from public.despesas_mensais where descricao='DESPESA CONTROLE' and valor_real=123.45) then
    raise exception 'Migration alterou despesa existente.';
  end if;
end;
$$;

do $$
declare
  v_admin uuid := '20000000-0000-0000-0000-000000000001';
  v_gerente_a uuid := '20000000-0000-0000-0000-000000000002';
  v_gerente_b uuid := '20000000-0000-0000-0000-000000000003';
  v_operador uuid := '20000000-0000-0000-0000-000000000004';
  v_ponto bigint;
  v_ponto_delete bigint;
  v_ponto_equip bigint;
  v_solicitacao bigint;
  v_solicitacao_equip bigint;
  v_ponto_rejeitado bigint;
  v_solicitacao_rejeitada bigint;
  v_count bigint;
  v_modalidades text[];
  v_despesas bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-ciclo@example.invalid', '', now(), now(), now()),
    (v_gerente_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerente-a-ciclo@example.invalid', '', now(), now(), now()),
    (v_gerente_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerente-b-ciclo@example.invalid', '', now(), now(), now()),
    (v_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador-ciclo@example.invalid', '', now(), now(), now());

  insert into public.perfis (user_id,nome,perfil,gerente_nome,rotas_permitidas) values
    (v_admin,'Admin Ciclo','administrador','',array[]::text[]),
    (v_gerente_a,'Gerente A','gerente','Gerente A',array['Rota A']),
    (v_gerente_b,'Gerente B','gerente','Gerente B',array['Rota B']),
    (v_operador,'Operador Ciclo','operador','',array[]::text[]);

  insert into public.pontos (nome_fantasia,gerente,modalidades,possui_despesa,valor_despesa)
  values ('PONTO CICLO','Rota A',array['Viapix'],'sim',50),
         ('PONTO SEM HISTORICO','Rota A',array['90 da Sorte'],'nao',0),
         ('PONTO COM EQUIPAMENTO','Rota A',array['Lotobanca'],'nao',0);
  select id into v_ponto from public.pontos where nome_fantasia='PONTO CICLO';
  select id into v_ponto_delete from public.pontos where nome_fantasia='PONTO SEM HISTORICO';
  select id into v_ponto_equip from public.pontos where nome_fantasia='PONTO COM EQUIPAMENTO';

  if exists (select 1 from public.pontos where situacao_operacional <> 'ativo') then
    raise exception 'Ponto existente nao recebeu estado ativo.';
  end if;

  insert into public.despesas_mensais (ponto_id,competencia,descricao,valor_real)
  values (v_ponto,date '2026-07-01','Internet',50);
  select count(*) into v_despesas from public.despesas_mensais;
  select modalidades into v_modalidades from public.pontos where id=v_ponto;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  delete from public.pontos where id=v_ponto_delete;
  if not found then raise exception 'Ponto sem historico nao seguiu DELETE atual.'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente_b::text, true);
  set local role authenticated;
  begin
    perform public.solicitar_desativacao_ponto(v_ponto,'Ponto encerrou atividades');
    raise exception 'Gerente fora do escopo criou solicitacao.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.solicitar_desativacao_ponto(v_ponto,'x');
    raise exception 'Motivo curto foi aceito.';
  exception when invalid_parameter_value then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  set local role authenticated;
  begin
    update public.pontos set situacao_operacional='desativado', desativado_em=now() where id=v_ponto;
    raise exception 'Gerente alterou ciclo diretamente.';
  exception when insufficient_privilege then null;
  end;
  select id into v_solicitacao from public.solicitar_desativacao_ponto(v_ponto,'Ponto encerrou atividades');
  begin
    perform public.solicitar_desativacao_ponto(v_ponto,'Solicitacao duplicada');
    raise exception 'Duplicidade pendente foi aceita.';
  exception when unique_violation then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  set local role authenticated;
  begin
    perform public.decidir_desativacao_ponto(v_solicitacao,true,null);
    raise exception 'Operador aprovou desativacao.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  perform public.decidir_desativacao_ponto(v_solicitacao,true,null);
  if (select situacao_operacional from public.pontos where id=v_ponto) <> 'desativado' then
    raise exception 'Ponto nao foi desativado.';
  end if;
  select count(*) into v_count from public.historico_status_pontos where ponto_id=v_ponto and acao='desativacao_aprovada';
  if v_count <> 1 then raise exception 'Auditoria da desativacao nao foi criada.'; end if;
  begin
    perform public.decidir_desativacao_ponto(v_solicitacao,true,null);
    raise exception 'Aprovacao repetida foi aceita.';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.pontos where id=v_ponto;
    raise exception 'Ponto com historico foi excluido.';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.despesas_mensais (ponto_id,competencia,descricao,valor_real)
    values (v_ponto,date '2026-09-01','Posterior',10);
    raise exception 'Despesa posterior foi aceita.';
  exception when check_violation then null;
  end;
  insert into public.despesas_mensais (ponto_id,competencia,descricao,valor_real)
  values (v_ponto,date '2026-06-01','Retroativa',10);
  begin
    insert into public.equipamentos (nome,localizacao,status) values ('VINCULO TARDIO','PONTO CICLO','Em rota');
    raise exception 'Equipamento foi vinculado a ponto desativado.';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    perform public.reativar_ponto(v_ponto,'x');
    raise exception 'Reativacao sem motivo foi aceita.';
  exception when invalid_parameter_value then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  set local role authenticated;
  begin
    perform public.reativar_ponto(v_ponto,'Retomar operacao');
    raise exception 'Gerente reativou ponto.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  perform public.reativar_ponto(v_ponto,'Retomar operacao');
  if (select situacao_operacional from public.pontos where id=v_ponto) <> 'ativo' then raise exception 'Reativacao falhou.'; end if;
  if (select modalidades from public.pontos where id=v_ponto) is distinct from v_modalidades then raise exception 'Modalidades foram alteradas.'; end if;
  if (select count(*) from public.despesas_mensais) <> v_despesas + 1 then raise exception 'Despesas existentes foram alteradas.'; end if;
  if (select count(*) from public.historico_status_pontos where ponto_id=v_ponto) <> 2 then raise exception 'Historico anterior nao foi preservado.'; end if;

  insert into public.pontos (nome_fantasia,gerente) values ('PONTO PARA REJEITAR','Rota A') returning id into v_ponto_rejeitado;
  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  set local role authenticated;
  select id into v_solicitacao_rejeitada from public.solicitar_desativacao_ponto(v_ponto_rejeitado,'Encerramento informado');
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  perform public.decidir_desativacao_ponto(v_solicitacao_rejeitada,false,'Operação continua ativa');
  if (select status from public.solicitacoes_status_ponto where id=v_solicitacao_rejeitada) <> 'rejeitada' then raise exception 'Rejeicao nao foi registrada.'; end if;
  if (select situacao_operacional from public.pontos where id=v_ponto_rejeitado) <> 'ativo' then raise exception 'Rejeicao alterou o ponto.'; end if;

  insert into public.equipamentos (nome,localizacao,status) values ('TV TESTE','PONTO COM EQUIPAMENTO','Em rota');
  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  set local role authenticated;
  select id into v_solicitacao_equip from public.solicitar_desativacao_ponto(v_ponto_equip,'Ponto encerrou atividades');
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  begin
    perform public.decidir_desativacao_ponto(v_solicitacao_equip,true,null);
    raise exception 'Ponto com equipamento foi desativado.';
  exception when object_not_in_prerequisite_state then null;
  end;
  if (select situacao_operacional from public.pontos where id=v_ponto_equip) <> 'ativo' then raise exception 'Falha moveu estado parcialmente.'; end if;
  if not exists (select 1 from public.equipamentos where localizacao='PONTO COM EQUIPAMENTO') then raise exception 'Equipamento foi movimentado.'; end if;
end;
$$;

rollback;
