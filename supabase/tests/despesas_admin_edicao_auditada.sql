-- Executar somente em uma instancia Supabase local descartavel, depois das migrations.
-- O teste termina em rollback e nao toca dados remotos.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('23000000-0000-0000-0000-000000000001', 'expense-admin@example.invalid', '{}'),
  ('23000000-0000-0000-0000-000000000002', 'expense-manager@example.invalid', '{}'),
  ('23000000-0000-0000-0000-000000000003', 'expense-operator@example.invalid', '{}')
on conflict (id) do nothing;

insert into public.perfis (user_id, nome, perfil, gerente_nome, rotas_permitidas)
values
  ('23000000-0000-0000-0000-000000000001', 'Admin Despesas', 'administrador', '', '{}'),
  ('23000000-0000-0000-0000-000000000002', 'Gerente Despesas', 'gerente', 'Gerente Despesas', array['Rota Teste']),
  ('23000000-0000-0000-0000-000000000003', 'Operador Despesas', 'operador', '', '{}')
on conflict (user_id) do update set nome=excluded.nome, perfil=excluded.perfil,
  gerente_nome=excluded.gerente_nome, rotas_permitidas=excluded.rotas_permitidas;

insert into public.pontos (nome_fantasia, gerente)
values ('PONTO TESTE EDICAO DESPESA', 'Rota Teste')
returning id \gset expense_point_

insert into public.despesas_mensais (ponto_id, competencia, descricao, tipo, valor_previsto, valor_real, observacao)
values (:expense_point_id, date '2026-07-01', 'Energia antiga', 'fixa', 100, 100, 'Antes')
returning id \gset expense_row_

insert into public.despesas_mensais (ponto_id, competencia, descricao, tipo, valor_previsto, valor_real, observacao)
values (:expense_point_id, date '2026-07-01', 'Internet existente', 'fixa', 50, 50, '');

insert into public.despesas_mensais (ponto_id, gerente, rota, competencia, descricao, tipo, valor_previsto, valor_real, observacao)
values (null, 'Gerente Despesas', 'Rota Teste', date '2026-07-01', 'Despesa da rota', 'fixa', 780, 780, 'Antes gerente')
returning id \gset manager_expense_

select set_config('app.expense_row_id', :'expense_row_id', true);
select set_config('app.manager_expense_id', :'manager_expense_id', true);

select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select public.editar_despesa_mensal_admin(
  :expense_row_id, 'Energia corrigida', 125, 125, 'Revisado pelo admin'
);

reset role;

do $$
begin
  if not exists (
    select 1 from public.despesas_mensais
    where id = current_setting('app.expense_row_id')::bigint
      and competencia = date '2026-07-01'
      and descricao = 'Energia corrigida' and valor_real = 125
  ) then raise exception 'Update administrativo nao preservou id/competencia.'; end if;
end $$;

do $$
begin
  if not exists (
    select 1 from public.despesas_mensais_edicoes
    where despesa_id = current_setting('app.expense_row_id')::bigint
      and competencia = date '2026-07-01'
      and autor_user_id = '23000000-0000-0000-0000-000000000001'
      and autor_nome_snapshot = 'Admin Despesas'
      and antes->>'descricao' = 'Energia antiga'
      and depois->>'descricao' = 'Energia corrigida'
  ) then raise exception 'Historico transacional nao foi gravado corretamente.'; end if;
end $$;

select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select public.editar_despesa_mensal_admin(
  :manager_expense_id, 'Despesa da rota corrigida', 800, 800, 'Revisado pelo admin'
);

reset role;

do $$
begin
  if not exists (
    select 1 from public.despesas_mensais
    where id = current_setting('app.manager_expense_id')::bigint
      and ponto_id is null
      and gerente = 'Gerente Despesas'
      and rota = 'Rota Teste'
      and competencia = date '2026-07-01'
      and valor_real = 800
  ) then raise exception 'Despesa propria do gerente perdeu identidade ou competencia.'; end if;

  if (select valor_real from public.despesas_mensais where id = current_setting('app.expense_row_id')::bigint) <> 125 then
    raise exception 'Edicao da despesa do gerente alterou despesa do ponto.';
  end if;

  if (select count(*) from public.despesas_mensais_edicoes where despesa_id = current_setting('app.manager_expense_id')::bigint) <> 1 then
    raise exception 'Historico da despesa propria do gerente nao possui exatamente um evento.';
  end if;

  if not exists (
    select 1 from public.despesas_mensais_edicoes
    where despesa_id = current_setting('app.manager_expense_id')::bigint
      and competencia = date '2026-07-01'
      and autor_user_id = '23000000-0000-0000-0000-000000000001'
      and (antes->>'valor_real')::numeric = 780
      and (depois->>'valor_real')::numeric = 800
  ) then raise exception 'Historico da despesa propria do gerente esta incoerente.'; end if;
end $$;

-- Gerente e operador continuam fail-closed na RPC administrativa.
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin
  perform public.editar_despesa_mensal_admin(current_setting('app.expense_row_id')::bigint, 'Fraude', 1, 1, '');
  raise exception 'Gerente conseguiu usar RPC administrativa.';
exception when insufficient_privilege then null; end $$;
reset role;

select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $$ begin
  perform public.editar_despesa_mensal_admin(current_setting('app.expense_row_id')::bigint, 'Fraude', 1, 1, '');
  raise exception 'Operador conseguiu usar RPC administrativa.';
exception when insufficient_privilege then null; end $$;
reset role;

rollback;
