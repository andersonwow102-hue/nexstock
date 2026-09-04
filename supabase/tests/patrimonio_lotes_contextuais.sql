-- Executar somente em PostgreSQL local descartavel, depois do bootstrap e das
-- migrations 202609010900..202609021100. Tudo termina em ROLLBACK.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('94000000-0000-0000-0000-000000000001', 'admin-contexto@local.invalid');
insert into public.perfis (user_id, nome, perfil, gerente_nome, login_nome, rotas_permitidas) values
  ('94000000-0000-0000-0000-000000000001', 'Admin Contexto', 'administrador', '', 'admin.contexto', '{}')
on conflict (user_id) do update set nome = excluded.nome, perfil = excluded.perfil;

insert into public.pontos (id, nome_fantasia, gerente) overriding system value values
  (801, 'Ponto Contextual', 'Rota Contextual');

create function private.patrimonio_teste_contexto_sequence_np()
returns table (ultimo bigint, chamada boolean)
language sql
security definer
set search_path = pg_catalog, public, private
as $$ select last_value, is_called from public.patrimonio_np_seq $$;
revoke all on function private.patrimonio_teste_contexto_sequence_np()
  from public, anon, authenticated, service_role;
grant execute on function private.patrimonio_teste_contexto_sequence_np()
  to authenticated;

select set_config('stockon.patrimonio_rpc', 'permitido', true);
insert into public.equipamentos (
  id, nome, categoria, quantidade, localizacao, patrimonio, status, minimo,
  observacao, responsavel, data_cadastro, gerente_responsavel
)
select 2000 + n, 'Estoque ' || n, 'Terminais', 1, '', '', 'Disponível', 1,
       '', '', '2026-09-01', ''
from generate_series(1, 19) n;
insert into public.equipamentos (
  id, nome, categoria, quantidade, localizacao, patrimonio, status, minimo,
  observacao, responsavel, data_cadastro, gerente_responsavel
) values
  (2101, 'Ponto 1', 'Terminais', 1, 'Ponto Contextual', '', 'Em rota', 1, '', '', '2026-09-01', 'Rota Contextual'),
  (2102, 'Ponto 2', 'Terminais', 1, 'Ponto Contextual', '', 'Em rota', 1, '', '', '2026-09-01', 'Rota Contextual'),
  (2201, 'Gerente 1', 'Terminais', 1, '', '', 'Com gerente', 1, '', '', '2026-09-01', 'Gerente Contextual'),
  (2202, 'Gerente 2', 'Terminais', 1, '', '', 'Com gerente', 1, '', '', '2026-09-01', 'Gerente Contextual');
select set_config('stockon.patrimonio_rpc', '', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_campanha uuid;
  v_lote uuid;
  v_repetido uuid;
  v_excesso uuid;
  v_contexto_lote uuid;
  v_seq_last bigint;
  v_seq_called boolean;
begin
  v_campanha := public.patrimonio_criar_campanha(
    'Campanha contextual local', '94100000-0000-0000-0000-000000000001'
  );
  if (select quantidade_snapshot from public.patrimonio_campanhas where id = v_campanha) <> 23 then
    raise exception 'Snapshot contextual divergente.';
  end if;

  v_contexto_lote := public.patrimonio_preparar_lote(
    v_campanha, 1, '{"tipo":"ponto","referencia":"801"}', 'Contexto ponto', false,
    '94100000-0000-0000-0000-000000000010'
  );
  if not exists (select 1 from public.patrimonio_lotes where id = v_contexto_lote and contexto_tipo = 'ponto' and contexto_referencia = '801' and lower(contexto_label) = 'ponto contextual' and demanda_contexto_no_preparo = 2) then raise exception 'Contexto ponto invalido.'; end if;
  perform public.patrimonio_cancelar_lote(v_contexto_lote, 'Fim da prova de ponto', '94100000-0000-0000-0000-000000000011');

  v_contexto_lote := public.patrimonio_preparar_lote(
    v_campanha, 1, '{"tipo":"rota","referencia":"rota contextual"}', 'Contexto rota', false,
    '94100000-0000-0000-0000-000000000012'
  );
  if not exists (select 1 from public.patrimonio_lotes where id = v_contexto_lote and contexto_tipo = 'rota' and contexto_referencia = 'Rota Contextual' and contexto_label = 'Rota Contextual' and demanda_contexto_no_preparo = 2) then raise exception 'Contexto rota invalido.'; end if;
  perform public.patrimonio_cancelar_lote(v_contexto_lote, 'Fim da prova de rota', '94100000-0000-0000-0000-000000000013');

  v_contexto_lote := public.patrimonio_preparar_lote(
    v_campanha, 1, '{"tipo":"gerente","referencia":"gerente contextual"}', 'Contexto gerente', false,
    '94100000-0000-0000-0000-000000000014'
  );
  if not exists (select 1 from public.patrimonio_lotes where id = v_contexto_lote and contexto_tipo = 'gerente' and contexto_referencia = 'Gerente Contextual' and contexto_label = 'Gerente Contextual' and demanda_contexto_no_preparo = 2) then raise exception 'Contexto gerente invalido.'; end if;
  perform public.patrimonio_cancelar_lote(v_contexto_lote, 'Fim da prova de gerente', '94100000-0000-0000-0000-000000000015');

  v_lote := public.patrimonio_preparar_lote(
    v_campanha, 5, '{"tipo":"estoque"}', '  Piloto Estoque — Etapa 1  ', false,
    '94100000-0000-0000-0000-000000000002'
  );
  v_repetido := public.patrimonio_preparar_lote(
    v_campanha, 5, '{"tipo":"estoque"}', 'Piloto Estoque — Etapa 1', false,
    '94100000-0000-0000-0000-000000000002'
  );
  if v_repetido <> v_lote or (select count(*) from public.patrimonio_lotes where id = v_lote) <> 1 then
    raise exception 'Preparo nao foi idempotente.';
  end if;
  if not exists (
    select 1 from public.patrimonio_lotes l
    where l.id = v_lote and l.nome_amigavel = 'Piloto Estoque — Etapa 1'
      and l.contexto_tipo = 'estoque' and l.contexto_referencia is null
      and l.contexto_label = 'Estoque interno' and l.demanda_contexto_no_preparo = 19
      and l.quantidade = 5 and l.saldo_pendente_no_preparo = 23
      and l.quantidade_excedente = 0 and not l.excesso_confirmado
      and l.quantidade_excedente_contexto = 0 and not l.excesso_contexto_confirmado
  ) then raise exception 'Lote parcial nao preservou nome, contexto, demanda e saldo global.'; end if;

  begin
    perform public.patrimonio_preparar_lote(
      v_campanha, 5, '{"tipo":"estoque"}', 'Payload diferente', false,
      '94100000-0000-0000-0000-000000000002'
    );
    raise exception 'Idempotencia aceitou payload diferente.';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.patrimonio_preparar_lote(
      v_campanha, 15, '{"tipo":"estoque"}', 'Excesso sem confirmacao', false,
      '94100000-0000-0000-0000-000000000003'
    );
    raise exception 'Excesso contextual foi aceito sem confirmacao.';
  exception when sqlstate '22023' then null; end;
  v_excesso := public.patrimonio_preparar_lote(
    v_campanha, 15, '{"tipo":"estoque"}', 'Excesso confirmado', true,
    '94100000-0000-0000-0000-000000000004'
  );
  if not exists (
    select 1 from public.patrimonio_lotes
    where id = v_excesso and demanda_contexto_no_preparo = 14
      and quantidade_excedente = 0 and not excesso_confirmado
      and quantidade_excedente_contexto = 1 and excesso_contexto_confirmado
  ) then raise exception 'Excesso confirmado nao ficou auditavel.'; end if;

  begin
    perform public.patrimonio_preparar_lote(
      v_campanha, 1, '{"tipo":"estoque"}', 'x', false,
      '94100000-0000-0000-0000-000000000005'
    );
    raise exception 'Nome fora do limite foi aceito.';
  exception when sqlstate '22023' then null; end;

  if not exists (
    select 1 from public.patrimonio_lotes_resumo_v v
    where v.id = v_lote and v.codigo like 'PAT-%'
      and v.nome_amigavel = 'Piloto Estoque — Etapa 1'
      and v.campanha_nome = 'Campanha contextual local'
      and v.contexto_label = 'Estoque interno' and v.demanda_contexto_no_preparo = 19
      and v.quantidade = 5 and v.situacao = 'preparado'
      and v.geradas = 0 and v.disponiveis = 0 and v.vinculadas = 0
      and v.aplicadas = 0 and v.conferidas = 0 and v.anuladas = 0
      and v.preparado_em is not null and v.gerado_em is null and v.concluido_em is null
  ) then raise exception 'View de lotes nao expos o contrato contextual completo.'; end if;

  select ultimo, chamada into v_seq_last, v_seq_called
  from private.patrimonio_teste_contexto_sequence_np();
  if v_seq_last <> 1 or v_seq_called
     or exists (select 1 from public.equipamentos_patrimonio)
     or exists (select 1 from public.patrimonio_eventos where evento = 'patrimonio_gerado') then
    raise exception 'Preparar lote consumiu NP ou criou patrimonio/QR.';
  end if;
end;
$$;

reset role;
drop function private.patrimonio_teste_contexto_sequence_np();

do $$
begin
  if has_function_privilege('authenticated', 'public.patrimonio_preparar_lote(uuid,integer,text,boolean,uuid)', 'EXECUTE') then
    raise exception 'Assinatura antiga continua executavel por authenticated.';
  end if;
  if not has_function_privilege('authenticated', 'public.patrimonio_preparar_lote(uuid,integer,jsonb,text,boolean,uuid)', 'EXECUTE') then
    raise exception 'Nova assinatura nao esta disponivel a authenticated.';
  end if;
  if has_table_privilege('authenticated', 'public.patrimonio_lotes', 'INSERT,UPDATE,DELETE') then
    raise exception 'DML direto de lotes foi ampliado.';
  end if;
end;
$$;

rollback;
\echo 'OK: lotes contextuais, view, excesso, idempotencia, grants e sequence NP validados.'
