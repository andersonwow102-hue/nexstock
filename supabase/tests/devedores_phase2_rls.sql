-- Executar somente em Supabase local descartavel, com ON_ERROR_STOP=1.
-- O roteiro usa dados ficticios e termina com rollback.

begin;

do $$
declare
  v_gerente uuid := '20000000-0000-0000-0000-000000000001';
  v_outro_gerente uuid := '20000000-0000-0000-0000-000000000002';
  v_operador uuid := '20000000-0000-0000-0000-000000000003';
  v_admin uuid := '20000000-0000-0000-0000-000000000004';
  v_consulta uuid := '20000000-0000-0000-0000-000000000005';
  v_sem_perfil uuid := '20000000-0000-0000-0000-000000000006';
  v_modalidade bigint;
  v_relatorio bigint;
  v_divida bigint;
  v_relatorio_2 bigint;
  v_divida_2 bigint;
  v_negociacao bigint;
  v_negociacao_2 bigint;
  v_parcela_1 bigint;
  v_parcela_2 bigint;
  v_parcela_3 bigint;
  v_pagamento_1 bigint;
  v_pagamento_repetido bigint;
  v_pagamento_2 bigint;
  v_pagamento_3 bigint;
  v_pagamento_4 bigint;
  v_estorno bigint;
  v_negociacao_repetida bigint;
  v_count bigint;
  v_numeric numeric;
  v_text text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_gerente, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fase2-gerente@example.invalid', '', now(), now(), now()),
    (v_outro_gerente, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fase2-outro@example.invalid', '', now(), now(), now()),
    (v_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fase2-operador@example.invalid', '', now(), now(), now()),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fase2-admin@example.invalid', '', now(), now(), now()),
    (v_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fase2-consulta@example.invalid', '', now(), now(), now()),
    (v_sem_perfil, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fase2-sem-perfil@example.invalid', '', now(), now(), now())
  on conflict (id) do nothing;

  delete from public.perfis where user_id = v_sem_perfil;
  insert into public.perfis (user_id, nome, perfil, gerente_nome)
  values
    (v_gerente, 'Gerente Fase 2', 'gerente', 'Gerente Fase 2'),
    (v_outro_gerente, 'Outro Gerente', 'gerente', 'Outro Gerente'),
    (v_operador, 'Operador Fase 2', 'operador', null),
    (v_admin, 'Administrador Fase 2', 'administrador', null),
    (v_consulta, 'Consulta Fase 2', 'consulta', null)
  on conflict (user_id) do update
    set nome = excluded.nome, perfil = excluded.perfil, gerente_nome = excluded.gerente_nome;
  select id into v_modalidade from public.devedores_modalidades where nome = 'ViaPix';

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select relatorio_id, divida_id into v_relatorio, v_divida
  from public.devedores_cadastrar_relatorio_divida(
    'pessoa', 'Devedor Ficticio Parcelado', null, 'Rua Local', '1', null, null,
    'Cidade Teste', 'BA', '74900000000', null, 120, v_modalidade, current_date, null
  );
  select relatorio_id, divida_id into v_relatorio_2, v_divida_2
  from public.devedores_cadastrar_relatorio_divida(
    'ponto', 'Devedor Ficticio Vista', 'Ponto Ficticio', 'Rua Local', '2', null, null,
    'Cidade Teste', 'BA', '74900000001', null, 80, v_modalidade, current_date, null
  );
  begin
    perform public.devedores_criar_negociacao(v_divida, 1, 'vista', 100, current_date, null, null, null, gen_random_uuid());
    raise exception 'Gerente criou negociacao.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  set local role authenticated;
  v_negociacao := public.devedores_criar_negociacao(
    v_divida, 1, 'parcelada', 100, null, 3, current_date - 40, 'Acordo ficticio',
    '30000000-0000-0000-0000-000000000001'
  );
  v_negociacao_repetida := public.devedores_criar_negociacao(
    v_divida, 1, 'parcelada', 100, null, 3, current_date - 40, 'Acordo ficticio',
    '30000000-0000-0000-0000-000000000001'
  );
  if v_negociacao_repetida <> v_negociacao then raise exception 'Idempotencia da negociacao divergiu.'; end if;
  begin
    perform public.devedores_criar_negociacao(
      v_divida_2, 1, 'vista', 70, current_date, null, null, null,
      '30000000-0000-0000-0000-000000000001'
    );
    raise exception 'Chave de negociacao foi reutilizada com outro payload.';
  exception when invalid_parameter_value then null;
  end;
  select id into v_parcela_1 from public.devedores_parcelas where negociacao_id = v_negociacao and numero = 1;
  select id into v_parcela_2 from public.devedores_parcelas where negociacao_id = v_negociacao and numero = 2;
  select id into v_parcela_3 from public.devedores_parcelas where negociacao_id = v_negociacao and numero = 3;
  select sum(valor) into v_numeric from public.devedores_parcelas where negociacao_id = v_negociacao;
  if v_numeric <> 100 then raise exception 'Soma das parcelas divergiu.'; end if;
  select valor into v_numeric from public.devedores_parcelas where id = v_parcela_3;
  if v_numeric <> 33.34 then raise exception 'Arredondamento nao ficou na ultima parcela.'; end if;
  select situacao into v_text from public.devedores_parcelas_resumo where id = v_parcela_1;
  if v_text <> 'vencida' then raise exception 'Parcela vencida nao foi identificada.'; end if;

  begin
    insert into public.devedores_pagamentos (
      divida_id, negociacao_id, parcela_id, valor, data_pagamento, idempotencia,
      registrado_por, registrado_por_nome_snapshot, registrado_por_perfil_snapshot
    ) values (v_divida, v_negociacao, v_parcela_1, 1, current_date, gen_random_uuid(), v_operador, 'Operador', 'operador');
    raise exception 'Escrita direta foi aceita.';
  exception when insufficient_privilege then null;
  end;

  v_pagamento_1 := public.devedores_registrar_pagamento(
    v_negociacao, v_parcela_1, 1, 10, current_date, 'Parcial ficticio',
    '40000000-0000-0000-0000-000000000001'
  );
  v_pagamento_repetido := public.devedores_registrar_pagamento(
    v_negociacao, v_parcela_1, 1, 10, current_date, 'Parcial ficticio',
    '40000000-0000-0000-0000-000000000001'
  );
  if v_pagamento_repetido <> v_pagamento_1 then raise exception 'Idempotencia retornou outro pagamento.'; end if;
  begin
    perform public.devedores_registrar_pagamento(
      v_negociacao, v_parcela_1, 2, 11, current_date, 'Payload alterado',
      '40000000-0000-0000-0000-000000000001'
    );
    raise exception 'Chave de pagamento foi reutilizada com outro payload.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.devedores_registrar_pagamento(
      v_negociacao, v_parcela_1, 2, 'NaN'::numeric, current_date, null, gen_random_uuid()
    );
    raise exception 'Pagamento NaN foi aceito.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.devedores_registrar_pagamento(
      v_negociacao, v_parcela_1, 2, 1, 'infinity'::date, null, gen_random_uuid()
    );
    raise exception 'Data infinita foi aceita.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.devedores_registrar_pagamento(
      v_negociacao, v_parcela_1, 2, 1,
      (now() at time zone 'America/Sao_Paulo')::date + 1, null, gen_random_uuid()
    );
    raise exception 'Pagamento futuro foi aceito.';
  exception when invalid_parameter_value then null;
  end;
  select saldo_restante into v_numeric from public.devedores_dividas_resumo where divida_id = v_divida;
  if v_numeric <> 90 then raise exception 'Saldo parcial incorreto.'; end if;
  begin
    perform public.devedores_registrar_pagamento(
      v_negociacao, v_parcela_1, 2, 30, current_date, null, gen_random_uuid()
    );
    raise exception 'Pagamento acima da parcela foi aceito.';
  exception when numeric_value_out_of_range then null;
  end;
  begin
    perform public.devedores_registrar_pagamento(
      v_negociacao, v_parcela_1, 1, 1, current_date, null, gen_random_uuid()
    );
    raise exception 'Stale version foi aceita.';
  exception when serialization_failure then null;
  end;

  v_pagamento_2 := public.devedores_registrar_pagamento(v_negociacao, v_parcela_1, 2, 23.33, current_date, null, gen_random_uuid());
  v_pagamento_3 := public.devedores_registrar_pagamento(v_negociacao, v_parcela_2, 3, 33.33, current_date, null, gen_random_uuid());
  v_pagamento_4 := public.devedores_registrar_pagamento(v_negociacao, v_parcela_3, 4, 33.34, current_date, null, gen_random_uuid());
  select situacao, saldo_restante into v_text, v_numeric from public.devedores_dividas_resumo where divida_id = v_divida;
  if v_text <> 'quitada' or v_numeric <> 0 then raise exception 'Quitacao automatica incorreta.'; end if;
  begin
    perform public.devedores_substituir_negociacao(
      v_divida, 6, 'vista', 90, current_date, null, null, null, 'Renegociar', gen_random_uuid()
    );
    raise exception 'Negociacao paga foi substituida.';
  exception when raise_exception then null;
  end;
  begin
    perform public.devedores_estornar_pagamento(v_pagamento_3, 5, 'Operador nao pode', gen_random_uuid());
    raise exception 'Operador estornou pagamento.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_corrigir_negociacao_admin(
      v_divida_2, 2, 'vista', 70, current_date, null, null, null, 'Operador nao pode', gen_random_uuid()
    );
    raise exception 'Operador executou correcao administrativa.';
  exception when insufficient_privilege then null;
  end;

  v_negociacao_2 := public.devedores_criar_negociacao(
    v_divida_2, 1, 'vista', 75, current_date + 10, null, null, null,
    '30000000-0000-0000-0000-000000000002'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_consulta::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_pagamentos where divida_id = v_divida;
  if v_count <> 4 then raise exception 'Consulta nao visualizou pagamentos.'; end if;
  select count(*) into v_count from public.devedores_dividas_resumo;
  if v_count <> 2 then raise exception 'Consulta nao visualizou resumo global.'; end if;
  select count(*) into v_count from public.devedores_parcelas_resumo where negociacao_id = v_negociacao;
  if v_count <> 3 then raise exception 'Consulta nao visualizou parcelas.'; end if;
  begin
    perform public.devedores_registrar_pagamento(v_negociacao, v_parcela_1, 5, 1, current_date, null, gen_random_uuid());
    raise exception 'Consulta registrou pagamento.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_criar_negociacao(v_divida, 5, 'vista', 1, current_date, null, null, null, gen_random_uuid());
    raise exception 'Consulta criou negociacao.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_substituir_negociacao(v_divida, 5, 'vista', 1, current_date, null, null, null, 'Teste', gen_random_uuid());
    raise exception 'Consulta substituiu negociacao.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_estornar_pagamento(v_pagamento_1, 5, 'Teste', gen_random_uuid());
    raise exception 'Consulta estornou pagamento.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_corrigir_negociacao_admin(v_divida, 5, 'vista', 1, current_date, null, null, null, 'Teste', gen_random_uuid());
    raise exception 'Consulta executou correcao administrativa.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.devedores_negociacoes where id = v_negociacao;
    raise exception 'Consulta executou DELETE.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_outro_gerente::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_negociacoes where id = v_negociacao;
  if v_count <> 0 then raise exception 'Outro gerente visualizou negociacao.'; end if;
  select count(*) into v_count from public.devedores_dividas_resumo where divida_id = v_divida;
  if v_count <> 0 then raise exception 'Outro gerente acessou resumo alheio por ID.'; end if;
  select count(*) into v_count from public.devedores_parcelas_resumo where negociacao_id = v_negociacao;
  if v_count <> 0 then raise exception 'Outro gerente acessou parcelas alheias por ID.'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_pagamentos where divida_id = v_divida;
  if v_count <> 4 then raise exception 'Gerente responsavel nao acompanhou pagamentos.'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', v_sem_perfil::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_negociacoes;
  if v_count <> 0 then raise exception 'Usuario sem perfil recebeu leitura.'; end if;
  begin
    perform public.devedores_criar_negociacao(v_divida, 6, 'vista', 1, current_date, null, null, null, gen_random_uuid());
    raise exception 'Usuario sem perfil executou RPC.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  v_estorno := public.devedores_estornar_pagamento(
    v_pagamento_3, 5, 'Correcao administrativa ficticia',
    '50000000-0000-0000-0000-000000000001'
  );
  if public.devedores_estornar_pagamento(
    v_pagamento_3, 5, 'Correcao administrativa ficticia',
    '50000000-0000-0000-0000-000000000001'
  ) <> v_estorno then raise exception 'Idempotencia do estorno divergiu.'; end if;
  begin
    perform public.devedores_estornar_pagamento(
      v_pagamento_3, 5, 'Motivo alterado', '50000000-0000-0000-0000-000000000001'
    );
    raise exception 'Chave de estorno foi reutilizada com outro payload.';
  exception when invalid_parameter_value then null;
  end;
  select saldo_restante, situacao into v_numeric, v_text from public.devedores_dividas_resumo where divida_id = v_divida;
  if v_numeric <> 33.33 or v_text <> 'vencida' then raise exception 'Estorno nao reabriu o saldo vencido.'; end if;
  if not exists (
    select 1 from public.devedores_historico
    where entidade = 'estorno' and entidade_id = v_estorno and motivo is not null
      and dados_anteriores ? 'saldo' and dados_novos ? 'saldo'
  ) then raise exception 'Auditoria do estorno incompleta.'; end if;

  v_negociacao_2 := public.devedores_corrigir_negociacao_admin(
    v_divida_2, 2, 'vista', 70, current_date + 20, null, null, 'Correcao',
    'Motivo administrativo ficticio', '50000000-0000-0000-0000-000000000002'
  );
  if public.devedores_corrigir_negociacao_admin(
    v_divida_2, 2, 'vista', 70, current_date + 20, null, null, 'Correcao',
    'Motivo administrativo ficticio', '50000000-0000-0000-0000-000000000002'
  ) <> v_negociacao_2 then raise exception 'Idempotencia da correcao administrativa divergiu.'; end if;
  begin
    perform public.devedores_corrigir_negociacao_admin(
      v_divida_2, 3, 'vista', 69, current_date + 20, null, null, 'Alterada',
      'Motivo administrativo ficticio', '50000000-0000-0000-0000-000000000002'
    );
    raise exception 'Chave administrativa foi reutilizada com outro payload.';
  exception when invalid_parameter_value then null;
  end;
  if not exists (
    select 1 from public.devedores_historico
    where entidade_id = v_negociacao_2 and acao = 'negociacao_corrigida_admin'
      and motivo is not null and dados_anteriores is not null and dados_novos is not null
  ) then raise exception 'Correcao administrativa nao registrou antes e depois.'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform count(*) from public.devedores_negociacoes;
    raise exception 'Anonimo realizou leitura.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_criar_negociacao(v_divida, 6, 'vista', 1, current_date, null, null, null, gen_random_uuid());
    raise exception 'Anonimo executou RPC.';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

do $$
declare
  v_view text;
  v_sequence text;
  v_table text;
  v_function text;
begin
  foreach v_view in array array['devedores_parcelas_resumo', 'devedores_dividas_resumo'] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_view
        and 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
        and c.relowner not in (
          (select oid from pg_roles where rolname = 'anon'),
          (select oid from pg_roles where rolname = 'authenticated')
        )
    ) then raise exception 'View % nao usa security_invoker.', v_view; end if;
  end loop;

  foreach v_sequence in array array[
    'public.devedores_negociacoes_id_seq', 'public.devedores_parcelas_id_seq',
    'public.devedores_pagamentos_id_seq', 'public.devedores_pagamentos_estornos_id_seq'
  ] loop
    if has_sequence_privilege('authenticated', v_sequence, 'USAGE')
      or has_sequence_privilege('anon', v_sequence, 'USAGE') then
      raise exception 'Sequence % exposta.', v_sequence;
    end if;
  end loop;

  foreach v_table in array array[
    'public.devedores_negociacoes', 'public.devedores_parcelas',
    'public.devedores_pagamentos', 'public.devedores_pagamentos_estornos'
  ] loop
    if has_table_privilege('authenticated', v_table, 'INSERT')
      or has_table_privilege('authenticated', v_table, 'UPDATE')
      or has_table_privilege('authenticated', v_table, 'DELETE') then
      raise exception 'Escrita direta concedida em %.', v_table;
    end if;
  end loop;

  if has_column_privilege('authenticated', 'public.devedores_negociacoes', 'idempotencia_payload', 'SELECT')
    or has_column_privilege('authenticated', 'public.devedores_pagamentos', 'idempotencia', 'SELECT')
    or has_column_privilege('authenticated', 'public.devedores_pagamentos_estornos', 'idempotencia_payload', 'SELECT') then
    raise exception 'Metadado interno de idempotencia exposto.';
  end if;

  foreach v_function in array array[
    'public.devedores_criar_negociacao(bigint,bigint,text,numeric,date,integer,date,text,uuid)',
    'public.devedores_substituir_negociacao(bigint,bigint,text,numeric,date,integer,date,text,text,uuid)',
    'public.devedores_registrar_pagamento(bigint,bigint,bigint,numeric,date,text,uuid)',
    'public.devedores_estornar_pagamento(bigint,bigint,text,uuid)',
    'public.devedores_corrigir_negociacao_admin(bigint,bigint,text,numeric,date,integer,date,text,text,uuid)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'RPC % exposta para anon.', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'RPC % indisponivel para validacao interna de perfil.', v_function;
    end if;
  end loop;
end;
$$;

rollback;
