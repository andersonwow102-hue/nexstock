-- Executar somente em PostgreSQL local descartavel, depois do bootstrap e das
-- migrations 202609010900 a 202609011010. O teste abre duas conexoes reais via
-- dblink, grava fixtures ficticias e deve ser seguido pelo descarte do banco.
--
-- Exemplo:
-- psql -v ON_ERROR_STOP=1 -v patrimonio_local_confirmado=1 \
--   -d patrimonio_concurrency -f patrimonio_fase1_concorrencia.sql

\if :{?patrimonio_local_confirmado}
\else
  \echo 'ABORTADO: informe -v patrimonio_local_confirmado=1 em banco local descartavel.'
  \quit
\endif

\set ON_ERROR_STOP on

do $$
declare
  v_called boolean;
  v_last bigint;
begin
  select last_value, is_called into v_last, v_called from public.patrimonio_np_seq;
  if v_last <> 1 or v_called
     or exists (select 1 from public.equipamentos_patrimonio)
     or exists (select 1 from public.patrimonio_lotes) then
    raise exception 'Teste concorrente exige banco local patrimonial virgem.';
  end if;
end;
$$;

create extension if not exists dblink;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '91000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'patrimonio-concorrencia@example.invalid',
  '', now(), now(), now()
);

insert into public.perfis (user_id, nome, perfil, gerente_nome, rotas_permitidas)
values (
  '91000000-0000-0000-0000-000000000001',
  'Administrador Concorrencia', 'administrador', '', '{}'
);

select set_config('stockon.patrimonio_rpc', 'permitido', false);
insert into public.equipamentos (
  nome, categoria, quantidade, status, minimo, observacao, localizacao,
  responsavel, patrimonio, data_cadastro, gerente_responsavel
) values
  ('TERMINAL CONCORRENCIA LOCAL', 'Terminais', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''),
  ('TERMINAL IDEMPOTENCIA LOCAL', 'Terminais', 1, 'Disponível', 1, '', '', '', '', current_date::text, '');
select set_config('stockon.patrimonio_rpc', '', false);

select set_config(
  'request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false
);
set role authenticated;
select public.patrimonio_preparar_lote(
  array[(select id from public.equipamentos where nome = 'TERMINAL CONCORRENCIA LOCAL')],
  '92000000-0000-0000-0000-000000000001'
) as lote_disputa_a
\gset
select public.patrimonio_preparar_lote(
  array[(select id from public.equipamentos where nome = 'TERMINAL CONCORRENCIA LOCAL')],
  '92000000-0000-0000-0000-000000000002'
) as lote_disputa_b
\gset
select public.patrimonio_preparar_lote(
  array[(select id from public.equipamentos where nome = 'TERMINAL IDEMPOTENCIA LOCAL')],
  '92000000-0000-0000-0000-000000000003'
) as lote_idempotencia
\gset
reset role;

create function public.patrimonio_teste_tentar_gerar(
  p_lote_id uuid,
  p_idempotencia uuid
)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  perform public.patrimonio_gerar_lote(p_lote_id, p_idempotencia);
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;
grant execute on function public.patrimonio_teste_tentar_gerar(uuid, uuid) to authenticated;

select dblink_connect('patrimonio_a', 'dbname=' || current_database());
select dblink_connect('patrimonio_b', 'dbname=' || current_database());

-- 1. Dois lotes disputam o mesmo equipamento. A sessao B precisa aguardar A e
-- retornar 23505 sem consumir outro NP.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_gerar_lote(%L::uuid, %L::uuid)',
    :'lote_disputa_a', '93000000-0000-0000-0000-000000000001'
  )
);
do $$
begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end;
$$;
create temp table patrimonio_resultados_uuid (origem text primary key, resultado uuid);
insert into patrimonio_resultados_uuid
select 'disputa_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado uuid);
select * from dblink_get_result('patrimonio_a') as t(resultado uuid);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_tentar_gerar(%L::uuid, %L::uuid)',
    :'lote_disputa_b', '93000000-0000-0000-0000-000000000002'
  )
);
select pg_sleep(0.25);
do $$
begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Sessao perdedora nao aguardou o lock do equipamento.';
  end if;
end;
$$;
select dblink_exec('patrimonio_a', 'commit');
create temp table patrimonio_resultados_texto (origem text primary key, resultado text);
insert into patrimonio_resultados_texto
select 'disputa_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados_texto where origem = 'disputa_b') <> '23505' then
    raise exception 'Sessao perdedora nao retornou unique_violation.';
  end if;
  if (select last_value from public.patrimonio_np_seq) <> 1
     or (select count(*) from public.equipamentos_patrimonio) <> 1
     or (select count(*) from public.patrimonio_eventos where evento = 'patrimonio_gerado') <> 1 then
    raise exception 'Disputa consumiu numero ou criou patrimonio/evento duplicado.';
  end if;
end;
$$;

-- 2. Mesma chave e mesmo lote em paralelo retornam o mesmo resultado.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_gerar_lote(%L::uuid, %L::uuid)',
    :'lote_idempotencia', '93000000-0000-0000-0000-000000000003'
  )
);
do $$
begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end;
$$;
insert into patrimonio_resultados_uuid
select 'idempotencia_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado uuid);
select * from dblink_get_result('patrimonio_a') as t(resultado uuid);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_gerar_lote(%L::uuid, %L::uuid)',
    :'lote_idempotencia', '93000000-0000-0000-0000-000000000003'
  )
);
select pg_sleep(0.25);
do $$
begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Chamada idempotente paralela nao aguardou o advisory lock.';
  end if;
end;
$$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados_uuid
select 'idempotencia_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado uuid);
select * from dblink_get_result('patrimonio_b') as t(resultado uuid);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados_uuid where origem = 'idempotencia_a')
     is distinct from
     (select resultado from patrimonio_resultados_uuid where origem = 'idempotencia_b') then
    raise exception 'Idempotencia paralela retornou lotes diferentes.';
  end if;
  if (select last_value from public.patrimonio_np_seq) <> 2
     or (select count(*) from public.patrimonio_eventos
         where idempotencia = '93000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'Idempotencia paralela consumiu numero ou evento adicional.';
  end if;
end;
$$;

-- 3. Aplicacao concorrente com cancelamento: cancelamento espera o ativo,
-- captura o estado confirmado e registra aplicado -> anulado.
select set_config(
  'request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false
);
set role authenticated;
select public.patrimonio_emitir_lote(
  :'lote_idempotencia'::uuid,
  '93000000-0000-0000-0000-000000000004'
);
select public.patrimonio_iniciar_lote(
  :'lote_idempotencia'::uuid,
  '93000000-0000-0000-0000-000000000005'
);
reset role;

select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_aplicar_etiqueta((select public_id from public.equipamentos_patrimonio where lote_id = %L::uuid), %L::uuid)',
    :'lote_idempotencia', '93000000-0000-0000-0000-000000000006'
  )
);
do $$
begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end;
$$;
insert into patrimonio_resultados_uuid
select 'aplicacao_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado uuid);
select * from dblink_get_result('patrimonio_a') as t(resultado uuid);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_cancelar_lote(%L::uuid, %L, %L::uuid)',
    :'lote_idempotencia', 'Cancelamento concorrente ficticio',
    '93000000-0000-0000-0000-000000000007'
  )
);
select pg_sleep(0.25);
do $$
begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Cancelamento nao aguardou a aplicacao concorrente.';
  end if;
end;
$$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados_uuid
select 'cancelamento_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado uuid);
select * from dblink_get_result('patrimonio_b') as t(resultado uuid);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if not exists (
    select 1
    from public.patrimonio_eventos e
    join public.equipamentos_patrimonio ep on ep.id = e.patrimonio_id
    where ep.lote_id = (
      select lote_id from public.patrimonio_eventos
      where idempotencia = '92000000-0000-0000-0000-000000000003'
    )
      and e.evento = 'anulado'
      and e.estado_anterior = 'aplicado'
      and e.estado_posterior = 'anulado'
  ) then
    raise exception 'Cancelamento concorrente perdeu o estado anterior aplicado.';
  end if;
end;
$$;

select dblink_disconnect('patrimonio_a');
select dblink_disconnect('patrimonio_b');
drop function public.patrimonio_teste_tentar_gerar(uuid, uuid);

\echo 'OK: concorrencia, idempotencia e cancelamento serializado validados.'
