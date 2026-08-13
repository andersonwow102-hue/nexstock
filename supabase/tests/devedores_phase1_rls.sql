-- Executar com psql -v ON_ERROR_STOP=1 somente em uma instancia local descartavel do Supabase.
-- O teste inteiro roda em transacao e termina com rollback.
-- Nao executar em producao. O stale version abaixo nao representa concorrencia real.

begin;

create temporary table devedores_teste_estado_operacional (
  tabela regclass primary key,
  quantidade_antes bigint not null
) on commit drop;

do $$
declare
  v_tabela record;
  v_quantidade bigint;
begin
  for v_tabela in
    select c.oid::regclass as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not like 'devedores\_%' escape '\'
      and c.relname <> 'perfis'
  loop
    execute format('select count(*) from %s', v_tabela.tabela) into v_quantidade;
    insert into devedores_teste_estado_operacional values (v_tabela.tabela, v_quantidade);
  end loop;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname not like 'devedores\_%' escape '\'
      and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ilike '%devedores_%'
  ) then
    raise exception 'Trigger externo referencia o modulo DEVEDORES.';
  end if;

  if exists (
    select 1
    from pg_depend dep
    join pg_proc p on p.oid = dep.objid
    join pg_class c on c.oid = dep.refobjid
    join pg_namespace n on n.oid = c.relnamespace
    where p.proname like 'devedores\_%' escape '\'
      and n.nspname = 'public'
      and c.relname not like 'devedores\_%' escape '\'
      and c.relname <> 'perfis'
  ) then
    raise exception 'Funcao DEVEDORES depende de tabela operacional externa.';
  end if;
end;
$$;

do $$
declare
  v_manager_a uuid := '10000000-0000-0000-0000-000000000001';
  v_manager_b uuid := '10000000-0000-0000-0000-000000000002';
  v_operator uuid := '10000000-0000-0000-0000-000000000003';
  v_admin uuid := '10000000-0000-0000-0000-000000000004';
  v_consulta uuid := '10000000-0000-0000-0000-000000000005';
  v_sem_perfil uuid := '10000000-0000-0000-0000-000000000006';
  v_modalidade bigint;
  v_relatorio bigint;
  v_divida bigint;
  v_count bigint;
  v_snapshot jsonb;
  v_hist_antes bigint;
  v_modalidade_inativa bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_manager_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-a@example.invalid', '', now(), now(), now()),
    (v_manager_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-b@example.invalid', '', now(), now(), now()),
    (v_operator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator@example.invalid', '', now(), now(), now()),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.invalid', '', now(), now(), now()),
    (v_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'consulta@example.invalid', '', now(), now(), now()),
    (v_sem_perfil, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sem-perfil@example.invalid', '', now(), now(), now())
  on conflict (id) do nothing;

  select count(*) into v_count
  from public.perfis
  where user_id = v_sem_perfil and perfil = 'consulta';
  if v_count <> 1 then raise exception 'Trigger local nao criou perfil consulta.'; end if;

  -- O trigger real cria perfil consulta. Remove-se apenas o perfil ficticio deste
  -- usuario para comprovar que o fallback do helper nao concede acesso.
  delete from public.perfis where user_id = v_sem_perfil;

  insert into public.perfis (user_id, nome, perfil, gerente_nome)
  values
    (v_manager_a, 'Gerente A', 'gerente', 'Gerente A'),
    (v_manager_b, 'Gerente B', 'gerente', 'Gerente B'),
    (v_operator, 'Operador Teste', 'operador', null),
    (v_admin, 'Administrador Teste', 'administrador', null),
    (v_consulta, 'Proprietario Consulta', 'consulta', null)
  on conflict (user_id) do update set nome = excluded.nome, perfil = excluded.perfil, gerente_nome = excluded.gerente_nome;

  select id into v_modalidade from public.devedores_modalidades where nome = 'ViaPix';
  insert into public.devedores_modalidades (nome, ativo) values ('Modalidade Inativa Teste', false)
  returning id into v_modalidade_inativa;

  perform set_config('request.jwt.claim.sub', v_manager_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  select relatorio_id, divida_id into v_relatorio, v_divida
  from public.devedores_cadastrar_relatorio_divida(
    'pessoa', 'Pessoa Ficticia A', null, 'Rua Local', '10', null, null,
    'Cidade Teste', 'BA', '(74) 90000-0000', null, 100.00, v_modalidade, current_date, null
  );

  select count(*) into v_count from public.devedores_dividas where id = v_divida;
  if v_count <> 1 then raise exception 'Gerente A nao visualizou a propria divida.'; end if;

  perform public.devedores_corrigir_relatorio_gerente(
    v_relatorio, 1, 'Pessoa Ficticia A Corrigida', null, 'Rua Local', '10', null, null,
    'Cidade Teste', 'BA', '(74) 90000-0000', 'Correcao permitida'
  );

  select relatorio_snapshot into v_snapshot from public.devedores_dividas where id = v_divida;
  if v_snapshot ->> 'nome' is distinct from 'Pessoa Ficticia A Corrigida' then
    raise exception 'Correcao do gerente deixou relatorio e snapshot divergentes.';
  end if;
  select count(*) into v_count from public.devedores_historico
  where divida_id = v_divida and acao = 'cadastro_corrigido_gerente'
    and dados_anteriores ? 'nome' and dados_novos ? 'nome'
    and not (dados_anteriores ? 'telefone');
  if v_count <> 1 then raise exception 'Auditoria do gerente nao registrou somente campos alterados.'; end if;

  select count(*) into v_hist_antes from public.devedores_historico where divida_id = v_divida;
  begin
    perform public.devedores_corrigir_relatorio_gerente(
      v_relatorio, 2, 'Pessoa Ficticia A Corrigida', null, 'Rua Local', '10', null, null,
      'Cidade Teste', 'BA', '(74) 90000-0000', 'Correcao permitida'
    );
    raise exception 'Operacao sem alteracao foi aceita.';
  exception when sqlstate 'P0004' then null;
  end;
  select count(*) into v_count from public.devedores_historico where divida_id = v_divida;
  if v_count <> v_hist_antes then raise exception 'Operacao sem alteracao criou historico.'; end if;

  begin
    perform public.devedores_cadastrar_relatorio_divida(
      'pessoa', 'Modalidade bloqueada', null, 'Rua', '1', null, null, 'Cidade', 'BA', '74900000000', null,
      10, v_modalidade_inativa, current_date, null
    );
    raise exception 'Cadastro aceitou modalidade inativa.';
  exception when no_data_found then null;
  end;

  begin
    perform public.devedores_corrigir_relatorio_gerente(
      v_relatorio, 1, 'Conflito', null, 'Rua Local', '10', null, null,
      'Cidade Teste', 'BA', '(74) 90000-0000', null
    );
    raise exception 'Controle de versao nao bloqueou sobrescrita.';
  exception when serialization_failure then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_manager_b::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_dividas where id = v_divida;
  if v_count <> 0 then raise exception 'Gerente B visualizou divida do Gerente A.'; end if;

  begin
    perform public.devedores_corrigir_relatorio_gerente(
      v_relatorio, 2, 'Tentativa indevida', null, 'Rua Local', '10', null, null,
      'Cidade Teste', 'BA', '(74) 90000-0000', null
    );
    raise exception 'Gerente B alterou relatorio de outro gerente.';
  exception when no_data_found then null;
  end;

  begin
    insert into public.devedores_historico (
      relatorio_id, divida_id, entidade, entidade_id, acao, usuario_nome_snapshot,
      perfil_snapshot, correlation_id
    ) values (v_relatorio, v_divida, 'divida', v_divida, 'bloqueado', 'Gerente B', 'gerente', gen_random_uuid());
    raise exception 'Outro gerente inseriu historico diretamente.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_operator::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_dividas where id = v_divida;
  if v_count <> 1 then raise exception 'Operador nao possui leitura global.'; end if;
  begin
    perform public.devedores_cadastrar_relatorio_divida(
      'pessoa', 'Bloqueado', null, 'Rua', '1', null, null, 'Cidade', 'BA', '74900000000', null,
      10, v_modalidade, current_date, null
    );
    raise exception 'Operador conseguiu cadastrar divida.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.devedores_dividas set valor_original = 1 where id = v_divida;
    raise exception 'Operador realizou update direto.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.devedores_historico where divida_id = v_divida;
    raise exception 'Operador realizou delete direto.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_corrigir_fase1_admin(
      v_divida, 2, 2, 'pessoa', 'Bloqueado', null, 'Rua', '1', null, null,
      'Cidade', 'BA', '74900000000', null, 10, v_modalidade, current_date, null, 'Bloqueado'
    );
    raise exception 'Operador executou RPC administrativa.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_consulta::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_historico where divida_id = v_divida;
  if v_count < 3 then raise exception 'Consulta nao visualizou historico completo.'; end if;
  begin
    update public.devedores_relatorios set nome = 'Bloqueado' where id = v_relatorio;
    raise exception 'Consulta realizou update direto.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.devedores_relatorios (
      gerente_responsavel_id, gerente_nome_snapshot, tipo, nome, endereco, numero, cidade, estado,
      telefone, criado_por_nome_snapshot
    ) values (v_consulta, 'Consulta', 'pessoa', 'Bloqueado', 'Rua', '1', 'Cidade', 'BA',
      '74900000000', 'Consulta');
    raise exception 'Consulta realizou insert direto.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.devedores_dividas where id = v_divida;
    raise exception 'Consulta realizou delete direto.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.devedores_historico (
      relatorio_id, divida_id, entidade, entidade_id, acao, usuario_nome_snapshot,
      perfil_snapshot, correlation_id
    ) values (v_relatorio, v_divida, 'divida', v_divida, 'bloqueado', 'Consulta', 'consulta', gen_random_uuid());
    raise exception 'Consulta inseriu historico diretamente.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_corrigir_relatorio_gerente(
      v_relatorio, 2, 'Bloqueado', null, 'Rua', '1', null, null, 'Cidade', 'BA', '74900000000', null
    );
    raise exception 'Consulta executou RPC mutavel.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_dividas where id = v_divida;
  if v_count <> 1 then raise exception 'Administrador nao possui leitura global.'; end if;
  perform public.devedores_corrigir_fase1_admin(
    v_divida, 2, 2, 'pessoa', 'Pessoa Corrigida pelo Admin', null, 'Rua Local', '10', null, null,
    'Cidade Teste', 'BA', '(74) 90000-0000', null, 120.00, v_modalidade, current_date, null,
    'Correcao administrativa ficticia'
  );

  select relatorio_snapshot into v_snapshot from public.devedores_dividas where id = v_divida;
  if v_snapshot ->> 'nome' is distinct from 'Pessoa Corrigida pelo Admin' then
    raise exception 'Correcao administrativa deixou relatorio e snapshot divergentes.';
  end if;

  begin
    perform public.devedores_corrigir_fase1_admin(
      v_divida, 3, 3, 'pessoa', 'Pessoa Corrigida pelo Admin', null, 'Rua Local', '10', null, null,
      'Cidade Teste', 'BA', '(74) 90000-0000', null, 120, v_modalidade_inativa, current_date, null,
      'Modalidade inativa deve falhar'
    );
    raise exception 'Administrador atribuiu modalidade inativa.';
  exception when no_data_found then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_sem_perfil::text, true);
  set local role authenticated;
  select count(*) into v_count from public.devedores_dividas;
  if v_count <> 0 then raise exception 'Usuario sem perfil recebeu leitura pelo fallback consulta.'; end if;
  select count(*) into v_count from public.devedores_modalidades;
  if v_count <> 0 then raise exception 'Usuario sem perfil visualizou catalogo de modalidades.'; end if;
  begin
    perform public.devedores_cadastrar_relatorio_divida(
      'pessoa', 'Sem perfil', null, 'Rua', '1', null, null, 'Cidade', 'BA', '74900000000', null,
      10, v_modalidade, current_date, null
    );
    raise exception 'Usuario sem perfil executou RPC.';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform count(*) from public.devedores_dividas;
    raise exception 'Anonimo realizou leitura.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.devedores_cadastrar_relatorio_divida(
      'pessoa', 'Anonimo', null, 'Rua', '1', null, null, 'Cidade', 'BA', '74900000000', null,
      10, v_modalidade, current_date, null
    );
    raise exception 'Anonimo executou RPC.';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

do $$
declare
  v_estado record;
  v_quantidade_depois bigint;
begin
  for v_estado in select * from devedores_teste_estado_operacional loop
    execute format('select count(*) from %s', v_estado.tabela) into v_quantidade_depois;
    if v_quantidade_depois is distinct from v_estado.quantidade_antes then
      raise exception 'Tabela operacional % foi modificada: antes %, depois %.',
        v_estado.tabela, v_estado.quantidade_antes, v_quantidade_depois;
    end if;
  end loop;
end;
$$;

rollback;
