-- Executar somente em uma instancia local descartavel do Supabase, depois das migrations.
-- O teste inteiro roda em transacao e termina com rollback.

begin;

do $$
declare
  v_manager_a uuid := '10000000-0000-0000-0000-000000000001';
  v_manager_b uuid := '10000000-0000-0000-0000-000000000002';
  v_operator uuid := '10000000-0000-0000-0000-000000000003';
  v_admin uuid := '10000000-0000-0000-0000-000000000004';
  v_consulta uuid := '10000000-0000-0000-0000-000000000005';
  v_modalidade bigint;
  v_relatorio bigint;
  v_divida bigint;
  v_count bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_manager_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-a@example.invalid', '', now(), now(), now()),
    (v_manager_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-b@example.invalid', '', now(), now(), now()),
    (v_operator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator@example.invalid', '', now(), now(), now()),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.invalid', '', now(), now(), now()),
    (v_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'consulta@example.invalid', '', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.perfis (user_id, nome, perfil, gerente_nome)
  values
    (v_manager_a, 'Gerente A', 'gerente', 'Gerente A'),
    (v_manager_b, 'Gerente B', 'gerente', 'Gerente B'),
    (v_operator, 'Operador Teste', 'operador', null),
    (v_admin, 'Administrador Teste', 'administrador', null),
    (v_consulta, 'Proprietario Consulta', 'consulta', null)
  on conflict (user_id) do update set nome = excluded.nome, perfil = excluded.perfil, gerente_nome = excluded.gerente_nome;

  select id into v_modalidade from public.devedores_modalidades where nome = 'ViaPix';

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
    v_divida, 2, 1, 'pessoa', 'Pessoa Corrigida pelo Admin', null, 'Rua Local', '10', null, null,
    'Cidade Teste', 'BA', '(74) 90000-0000', null, 120.00, v_modalidade, current_date, null,
    'Correcao administrativa ficticia'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform count(*) from public.devedores_dividas;
    raise exception 'Anonimo realizou leitura.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
