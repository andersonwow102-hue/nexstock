begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='devedores_relatorios' and column_name='excluido_em') then raise exception 'Coluna de exclusao ausente.'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='devedores_excluir_administrativamente' and p.prosecdef) then raise exception 'RPC protegida ausente.'; end if;
  if has_function_privilege('anon','public.devedores_excluir_administrativamente(bigint,bigint,text)','EXECUTE') then raise exception 'anon nao pode executar exclusao.'; end if;
  if has_function_privilege('public','public.devedores_excluir_administrativamente(bigint,bigint,text)','EXECUTE') then raise exception 'PUBLIC nao pode executar exclusao.'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='devedores_dividas_resumo_administrativo' and position('security_invoker=true' in array_to_string(c.reloptions,','))>0) then raise exception 'View administrativa deve usar security_invoker.'; end if;
end $$;

do $$
declare
  v_gerente uuid := '51000000-0000-0000-0000-000000000001';
  v_operador uuid := '51000000-0000-0000-0000-000000000002';
  v_admin uuid := '51000000-0000-0000-0000-000000000003';
  v_consulta uuid := '51000000-0000-0000-0000-000000000004';
  v_modalidade bigint; v_relatorio bigint; v_divida bigint; v_negociacao bigint; v_parcela bigint;
  v_pagamento bigint; v_versao bigint; v_count bigint; v_total_pago numeric; v_saldo numeric;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
    (v_gerente,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exclusao-gerente@example.invalid','',now(),now(),now()),
    (v_operador,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exclusao-operador@example.invalid','',now(),now(),now()),
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exclusao-admin@example.invalid','',now(),now(),now()),
    (v_consulta,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exclusao-consulta@example.invalid','',now(),now(),now())
  on conflict(id) do nothing;
  insert into public.perfis(user_id,nome,perfil,gerente_nome) values
    (v_gerente,'Gerente Exclusao','gerente','Gerente Exclusao'),
    (v_operador,'Operador Exclusao','operador',null),
    (v_admin,'Admin Exclusao','administrador',null),
    (v_consulta,'Consulta Exclusao','consulta',null)
  on conflict(user_id) do update set nome=excluded.nome,perfil=excluded.perfil,gerente_nome=excluded.gerente_nome;
  select id into v_modalidade from public.devedores_modalidades where ativo order by id limit 1;

  perform set_config('request.jwt.claim.sub',v_gerente::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  select relatorio_id,divida_id into v_relatorio,v_divida from public.devedores_cadastrar_relatorio_divida(
    'pessoa','Cadastro ficticio para exclusao',null,'Rua Local','1',null,null,'Cidade Teste','BA','74900000000',
    null,5000,v_modalidade,current_date,'Teste local descartavel');

  reset role; perform set_config('request.jwt.claim.sub',v_operador::text,true); set local role authenticated;
  v_negociacao := public.devedores_criar_negociacao(v_divida,1,'parcelada',5000,null,5,current_date,null,gen_random_uuid());
  select id into v_parcela from public.devedores_parcelas where negociacao_id=v_negociacao and numero=1;
  v_pagamento := public.devedores_registrar_pagamento(v_negociacao,v_parcela,1,700,current_date,'Pagamento preservado',gen_random_uuid());
  select versao into v_versao from public.devedores_dividas where id=v_divida;
  begin
    perform public.devedores_excluir_administrativamente(v_divida,v_versao,'Operador nao autorizado');
    raise exception 'Operador excluiu devedor.';
  exception when insufficient_privilege then null; end;

  reset role; perform set_config('request.jwt.claim.sub',v_gerente::text,true); set local role authenticated;
  begin
    perform public.devedores_excluir_administrativamente(v_divida,v_versao,'Gerente nao autorizado');
    raise exception 'Gerente excluiu devedor.';
  exception when insufficient_privilege then null; end;

  reset role; perform set_config('request.jwt.claim.sub',v_consulta::text,true); set local role authenticated;
  begin
    perform public.devedores_excluir_administrativamente(v_divida,v_versao,'Consulta nao autorizada');
    raise exception 'Consulta excluiu devedor.';
  exception when insufficient_privilege then null; end;

  reset role; perform set_config('request.jwt.claim.sub',v_admin::text,true); set local role authenticated;
  begin
    perform public.devedores_excluir_administrativamente(v_divida,v_versao,'   ');
    raise exception 'Motivo invalido foi aceito.';
  exception when invalid_parameter_value then null; end;
  perform public.devedores_excluir_administrativamente(v_divida,v_versao,'Registro criado exclusivamente para teste local.');

  select count(*) into v_count from public.devedores_relatorios where id=v_relatorio and excluido_em is not null
    and excluido_por=v_admin and motivo_exclusao='Registro criado exclusivamente para teste local.';
  if v_count<>1 then raise exception 'Marcacao administrativa incompleta.'; end if;
  select count(*) into v_count from public.devedores_historico where divida_id=v_divida and acao='exclusao_administrativa'
    and usuario_id=v_admin and motivo='Registro criado exclusivamente para teste local.';
  if v_count<>1 then raise exception 'Auditoria da exclusao ausente.'; end if;
  select count(*),coalesce(sum(valor),0) into v_count,v_total_pago from public.devedores_pagamentos where divida_id=v_divida;
  if v_count<>1 or v_total_pago<>700 then raise exception 'Pagamento foi alterado ou removido.'; end if;
  select count(*) into v_count from public.devedores_negociacoes where divida_id=v_divida;
  if v_count<>1 then raise exception 'Negociacao foi removida.'; end if;
  select count(*) into v_count from public.devedores_parcelas where divida_id=v_divida;
  if v_count<>5 then raise exception 'Parcelas foram removidas.'; end if;
  select saldo_restante,total_pago into v_saldo,v_total_pago from public.devedores_dividas_resumo_administrativo where divida_id=v_divida;
  if v_saldo<>4300 or v_total_pago<>700 then raise exception 'Resumo historico nao foi preservado.'; end if;
  begin
    perform public.devedores_excluir_administrativamente(v_divida,v_versao+1,'Tentativa duplicada');
    raise exception 'Exclusao duplicada foi aceita.';
  exception when unique_violation then null; end;
  begin
    select versao into v_versao from public.devedores_negociacoes where id=v_negociacao;
    perform public.devedores_registrar_pagamento(v_negociacao,v_parcela,v_versao,1,current_date,null,gen_random_uuid());
    raise exception 'Pagamento posterior a exclusao foi aceito.';
  exception when object_not_in_prerequisite_state then null; end;

  reset role; perform set_config('request.jwt.claim.sub',v_operador::text,true); set local role authenticated;
  select count(*) into v_count from public.devedores_dividas where id=v_divida;
  if v_count<>0 then raise exception 'Operador visualizou excluido.'; end if;
  reset role; perform set_config('request.jwt.claim.sub',v_gerente::text,true); set local role authenticated;
  select count(*) into v_count from public.devedores_dividas where id=v_divida;
  if v_count<>0 then raise exception 'Gerente visualizou excluido.'; end if;
  reset role; perform set_config('request.jwt.claim.sub',v_consulta::text,true); set local role authenticated;
  select count(*) into v_count from public.devedores_dividas where id=v_divida;
  if v_count<>0 then raise exception 'Consulta visualizou excluido.'; end if;
  reset role;
end $$;
rollback;
