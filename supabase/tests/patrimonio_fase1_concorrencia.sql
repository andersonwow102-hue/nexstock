-- Executar somente em PostgreSQL local descartavel, depois do bootstrap e das
-- migrations 202609010900 a 202609011010. O teste abre duas conexoes reais via
-- dblink e persiste fixtures ficticias; descarte o banco ao terminar.
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
     or exists (select 1 from public.patrimonio_campanhas)
     or exists (select 1 from public.patrimonio_lotes)
     or exists (select 1 from public.equipamentos_patrimonio) then
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
)
select
  'TERMINAL CONCORRENCIA ' || lpad(n::text, 2, '0'),
  'Terminais', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
from generate_series(1, 12) as n;
select set_config('stockon.patrimonio_rpc', '', false);

select set_config(
  'request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false
);
set role authenticated;
select public.patrimonio_criar_campanha(
  'Campanha local de concorrencia',
  '92000000-0000-0000-0000-000000000001'
) as campanha_id
\gset
reset role;

create function public.patrimonio_teste_preparar(
  p_campanha_id uuid,
  p_quantidade integer,
  p_contexto text,
  p_confirmar_excesso boolean,
  p_idempotencia uuid
)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  return public.patrimonio_preparar_lote(
    p_campanha_id, p_quantidade, p_contexto, p_confirmar_excesso, p_idempotencia
  )::text;
exception when others then
  return sqlstate;
end;
$$;

create function public.patrimonio_teste_criar_campanha(
  p_nome text,
  p_idempotencia uuid
)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  return public.patrimonio_criar_campanha(p_nome, p_idempotencia)::text;
exception when others then
  return sqlstate;
end;
$$;

create function public.patrimonio_teste_gerar(p_lote_id uuid, p_idempotencia uuid)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  return public.patrimonio_gerar_lote(p_lote_id, p_idempotencia)::text;
exception when others then
  return sqlstate;
end;
$$;

create function public.patrimonio_teste_vincular(
  p_public_id text,
  p_equipamento_id bigint,
  p_posicao_esperada jsonb,
  p_idempotencia uuid
)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  return public.patrimonio_vincular_etiqueta(
    p_public_id, p_equipamento_id, p_posicao_esperada, p_idempotencia
  );
exception when others then
  return sqlstate;
end;
$$;

create function public.patrimonio_teste_cadastrar(
  p_dados jsonb,
  p_quantidade integer,
  p_idempotencia uuid
)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  return public.patrimonio_cadastrar_equipamentos(
    p_dados, p_quantidade, p_idempotencia
  )::text;
exception when others then
  return sqlstate;
end;
$$;

create function public.patrimonio_teste_cancelar(
  p_lote_id uuid,
  p_motivo text,
  p_idempotencia uuid
)
returns text
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  return public.patrimonio_cancelar_lote(
    p_lote_id, p_motivo, p_idempotencia
  )::text;
exception when others then
  return sqlstate;
end;
$$;

grant execute on function public.patrimonio_teste_preparar(uuid, integer, text, boolean, uuid) to authenticated;
grant execute on function public.patrimonio_teste_criar_campanha(text, uuid) to authenticated;
grant execute on function public.patrimonio_teste_gerar(uuid, uuid) to authenticated;
grant execute on function public.patrimonio_teste_vincular(text, bigint, jsonb, uuid) to authenticated;
grant execute on function public.patrimonio_teste_cadastrar(jsonb, integer, uuid) to authenticated;
grant execute on function public.patrimonio_teste_cancelar(uuid, text, uuid) to authenticated;

select dblink_connect('patrimonio_a', 'dbname=' || current_database());
select dblink_connect('patrimonio_b', 'dbname=' || current_database());

create temp table patrimonio_resultados (
  origem text primary key,
  resultado text not null
);

-- 1. O corte de campanha mantem o snapshot consistente enquanto um cadastro
-- tenta inserir em Equipamentos. O cadastro aguarda e fica fora do corte.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_criar_campanha(%L, %L::uuid)',
    'Campanha com corte concorrente', '93000000-0000-0000-0000-000000000020'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end; $$;
insert into patrimonio_resultados
select 'campanha_corte', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_cadastrar(%L::jsonb, 1, %L::uuid)',
    '{"nome":"CADASTRO APOS CORTE","categoria":"Máquina de Brindes","status":"Disponível","minimo":1,"observacao":"","localizacao":"","responsavel":"","data_cadastro":"2026-09-01","gerente_responsavel":"","transferencia_status":""}',
    '93000000-0000-0000-0000-000000000021'
  )
);
select pg_sleep(0.25);
do $$ begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Cadastro nao aguardou o lock do corte de campanha.';
  end if;
end; $$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados
select 'cadastro_pos_corte', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
declare
  v_campanha_id uuid;
begin
  v_campanha_id := (select resultado::uuid from patrimonio_resultados where origem = 'campanha_corte');
  if left((select resultado from patrimonio_resultados where origem = 'cadastro_pos_corte'), 1) <> '{'
     or (select quantidade_snapshot from public.patrimonio_campanhas where id = v_campanha_id) <> 12
     or (select count(*) from public.patrimonio_campanha_equipamentos where campanha_id = v_campanha_id) <> 12
     or exists (
       select 1
       from public.patrimonio_campanha_equipamentos ce
       join public.equipamentos e on e.id = ce.equipamento_id
       where ce.campanha_id = v_campanha_id and e.nome = 'CADASTRO APOS CORTE'
     ) then
    raise exception 'Corte concorrente produziu snapshot inconsistente.';
  end if;
end;
$$;

-- 2. Dois preparos que, somados, excedem a meta disputam o lock da campanha.
-- Apenas o primeiro lote existe; o perdedor falha antes de consumir numero.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_preparar(%L::uuid, 7, %L, false, %L::uuid)',
    :'campanha_id', 'Reserva concorrente A', '93000000-0000-0000-0000-000000000001'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end; $$;
insert into patrimonio_resultados
select 'preparo_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_preparar(%L::uuid, 7, %L, false, %L::uuid)',
    :'campanha_id', 'Reserva concorrente B', '93000000-0000-0000-0000-000000000002'
  )
);
select pg_sleep(0.25);
do $$ begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Segundo preparo nao aguardou o lock da campanha.';
  end if;
end; $$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados
select 'preparo_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados where origem = 'preparo_b') <> '22023'
     or (select count(*) from public.patrimonio_lotes) <> 1
     or (select last_value from public.patrimonio_lote_seq) <> 1 then
    raise exception 'Reserva concorrente excedeu a meta ou consumiu lote adicional.';
  end if;
end;
$$;

select resultado as lote_reserva
from patrimonio_resultados
where origem = 'preparo_a'
\gset

select set_config(
  'request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false
);
set role authenticated;
select public.patrimonio_cancelar_lote(
  :'lote_reserva'::uuid,
  'Libera a reserva do primeiro cenario',
  '93000000-0000-0000-0000-000000000003'
);
select public.patrimonio_preparar_lote(
  :'campanha_id'::uuid, 2, 'Geracao idempotente concorrente',
  false,
  '93000000-0000-0000-0000-000000000004'
) as lote_idempotente
\gset
reset role;

-- 3. Mesma chave e mesmo lote em paralelo retornam exatamente o mesmo JSON.
-- A segunda sessao aguarda o advisory lock e nao cria NPs/eventos adicionais.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_gerar(%L::uuid, %L::uuid)',
    :'lote_idempotente', '93000000-0000-0000-0000-000000000005'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end; $$;
insert into patrimonio_resultados
select 'geracao_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_gerar(%L::uuid, %L::uuid)',
    :'lote_idempotente', '93000000-0000-0000-0000-000000000005'
  )
);
select pg_sleep(0.25);
do $$ begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Chamada idempotente paralela nao aguardou o advisory lock.';
  end if;
end; $$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados
select 'geracao_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados where origem = 'geracao_a')
     is distinct from
     (select resultado from patrimonio_resultados where origem = 'geracao_b')
     or (select count(*)
         from public.equipamentos_patrimonio ep
         join public.patrimonio_lotes l on l.id = ep.lote_origem_id
         where l.contexto = 'Geracao idempotente concorrente') <> 2
     or (select last_value from public.patrimonio_np_seq) <> 2
     or (select count(*) from public.patrimonio_eventos
         where evento = 'lote_gerado'
           and idempotencia = '93000000-0000-0000-0000-000000000005') <> 1 then
    raise exception 'Idempotencia concorrente criou resultado, numero ou evento adicional.';
  end if;
end;
$$;

select public_id as etiqueta_a
from public.equipamentos_patrimonio
where lote_origem_id = :'lote_idempotente'::uuid
order by numero
limit 1
\gset
select public_id as etiqueta_b
from public.equipamentos_patrimonio
where lote_origem_id = :'lote_idempotente'::uuid
order by numero
offset 1 limit 1
\gset
select id as equipamento_disputado
from public.equipamentos
where nome = 'TERMINAL CONCORRENCIA 01'
\gset

-- 4. Duas etiquetas livres disputam o mesmo equipamento. O lock da linha de
-- equipamento serializa a verificacao e somente uma vinculacao permanece.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_vincular(%L, %L::bigint, %L::jsonb, %L::uuid)',
    :'etiqueta_a', :'equipamento_disputado',
    '{"status":"Disponível","localizacao":""}',
    '93000000-0000-0000-0000-000000000006'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end; $$;
insert into patrimonio_resultados
select 'vinculo_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_vincular(%L, %L::bigint, %L::jsonb, %L::uuid)',
    :'etiqueta_b', :'equipamento_disputado',
    '{"status":"Disponível","localizacao":""}',
    '93000000-0000-0000-0000-000000000007'
  )
);
select pg_sleep(0.25);
do $$ begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Segundo vinculo nao aguardou o lock do equipamento.';
  end if;
end; $$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados
select 'vinculo_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados where origem = 'vinculo_b') <> '23505'
     or (select count(*) from public.equipamentos_patrimonio
         where equipamento_id = (
           select id from public.equipamentos where nome = 'TERMINAL CONCORRENCIA 01'
         )
           and situacao not in ('anulado', 'baixado')) <> 1
     or (select count(*)
         from public.equipamentos_patrimonio ep
         join public.patrimonio_lotes l on l.id = ep.lote_origem_id
         where l.contexto = 'Geracao idempotente concorrente'
           and ep.situacao = 'disponivel') <> 1
     or (select last_value from public.patrimonio_np_seq) <> 2 then
    raise exception 'Disputa de vinculo criou duplicidade ou alterou a etiqueta perdedora.';
  end if;
end;
$$;

select id as equipamento_destino_a
from public.equipamentos
where nome = 'TERMINAL CONCORRENCIA 02'
\gset
select id as equipamento_destino_b
from public.equipamentos
where nome = 'TERMINAL CONCORRENCIA 03'
\gset

-- 5. O mesmo NP livre nao pode ser vinculado a dois equipamentos. O lock do
-- patrimonio canonico serializa a disputa antes de qualquer segunda gravacao.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_vincular(%L, %L::bigint, %L::jsonb, %L::uuid)',
    :'etiqueta_b', :'equipamento_destino_a',
    '{"status":"Disponível","localizacao":""}',
    '93000000-0000-0000-0000-000000000011'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end; $$;
insert into patrimonio_resultados
select 'mesmo_np_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_vincular(%L, %L::bigint, %L::jsonb, %L::uuid)',
    :'etiqueta_b', :'equipamento_destino_b',
    '{"status":"Disponível","localizacao":""}',
    '93000000-0000-0000-0000-000000000012'
  )
);
select pg_sleep(0.25);
do $$ begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Segundo destino nao aguardou o lock do mesmo NP.';
  end if;
end; $$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados
select 'mesmo_np_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados where origem = 'mesmo_np_b') <> '55000'
     or not exists (
       select 1 from public.equipamentos_patrimonio ep
       where ep.public_id = (select resultado from patrimonio_resultados where origem = 'mesmo_np_a')
         and ep.equipamento_id = (
           select id from public.equipamentos where nome = 'TERMINAL CONCORRENCIA 02'
         )
         and ep.situacao = 'vinculado'
     )
     or exists (
       select 1 from public.equipamentos_patrimonio ep
       where ep.equipamento_id = (
         select id from public.equipamentos where nome = 'TERMINAL CONCORRENCIA 03'
       )
         and ep.situacao not in ('anulado', 'baixado')
     ) then
    raise exception 'Mesmo NP foi vinculado a dois equipamentos ou perdeu o primeiro vinculo.';
  end if;
end;
$$;

insert into patrimonio_resultados (origem, resultado)
select 'np_antes_cadastros', count(*)::text from public.equipamentos_patrimonio;

-- 6. Dois cadastros patrimoniaveis simultaneos compartilham a sequencia global
-- sem colisao e cada chamada permanece atomica para equipamento + NP.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_cadastrar(%L::jsonb, 2, %L::uuid)',
    '{"nome":"CADASTRO CONCORRENTE A","categoria":"Terminais","status":"Disponível","minimo":1,"observacao":"","localizacao":"","responsavel":"","data_cadastro":"2026-09-01","gerente_responsavel":"","transferencia_status":""}',
    '93000000-0000-0000-0000-000000000013'
  )
);
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_cadastrar(%L::jsonb, 2, %L::uuid)',
    '{"nome":"CADASTRO CONCORRENTE B","categoria":"Terminais","status":"Disponível","minimo":1,"observacao":"","localizacao":"","responsavel":"","data_cadastro":"2026-09-01","gerente_responsavel":"","transferencia_status":""}',
    '93000000-0000-0000-0000-000000000014'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 or dblink_is_busy('patrimonio_b') = 1 loop
    perform pg_sleep(0.01);
  end loop;
end; $$;
insert into patrimonio_resultados
select 'cadastro_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);
insert into patrimonio_resultados
select 'cadastro_b', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_a', 'commit');
select dblink_exec('patrimonio_b', 'commit');

do $$
declare
  v_total bigint;
begin
  select count(*) into v_total from public.equipamentos_patrimonio;
  if left((select resultado from patrimonio_resultados where origem = 'cadastro_a'), 1) <> '{'
     or left((select resultado from patrimonio_resultados where origem = 'cadastro_b'), 1) <> '{'
     or v_total <> (select resultado::bigint + 4 from patrimonio_resultados where origem = 'np_antes_cadastros')
     or (select count(*)
         from public.equipamentos e
         join public.equipamentos_patrimonio ep on ep.equipamento_id = e.id
         where e.nome in ('CADASTRO CONCORRENTE A', 'CADASTRO CONCORRENTE B')
           and ep.origem = 'cadastro' and ep.situacao = 'vinculado') <> 4
     or (select count(distinct numero) from public.equipamentos_patrimonio) <> v_total
     or (select count(distinct codigo) from public.equipamentos_patrimonio) <> v_total
     or (select count(distinct public_id) from public.equipamentos_patrimonio) <> v_total then
    raise exception 'Cadastros simultaneos perderam atomicidade ou colidiram identidade NP.';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false
);
set role authenticated;
select public.patrimonio_preparar_lote(
  :'campanha_id'::uuid, 1, 'Lote paralelo ao cadastro', false,
  '93000000-0000-0000-0000-000000000015'
) as lote_misto
\gset
reset role;
insert into patrimonio_resultados (origem, resultado)
select 'np_antes_misto', count(*)::text from public.equipamentos_patrimonio;

-- 7. Geracao de lote e cadastro futuro usam a mesma sequencia global em sessoes
-- concorrentes, sem namespace paralelo nem reutilizacao de numero.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_gerar(%L::uuid, %L::uuid)',
    :'lote_misto', '93000000-0000-0000-0000-000000000016'
  )
);
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_cadastrar(%L::jsonb, 2, %L::uuid)',
    '{"nome":"CADASTRO PARALELO AO LOTE","categoria":"Terminais","status":"Disponível","minimo":1,"observacao":"","localizacao":"","responsavel":"","data_cadastro":"2026-09-01","gerente_responsavel":"","transferencia_status":""}',
    '93000000-0000-0000-0000-000000000017'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 or dblink_is_busy('patrimonio_b') = 1 loop
    perform pg_sleep(0.01);
  end loop;
end; $$;
insert into patrimonio_resultados
select 'misto_lote', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);
insert into patrimonio_resultados
select 'misto_cadastro', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_a', 'commit');
select dblink_exec('patrimonio_b', 'commit');

do $$
declare
  v_total bigint;
begin
  select count(*) into v_total from public.equipamentos_patrimonio;
  if left((select resultado from patrimonio_resultados where origem = 'misto_lote'), 1) <> '{'
     or left((select resultado from patrimonio_resultados where origem = 'misto_cadastro'), 1) <> '{'
     or v_total <> (select resultado::bigint + 3 from patrimonio_resultados where origem = 'np_antes_misto')
     or (select count(*)
         from public.equipamentos_patrimonio ep
         join public.patrimonio_lotes l on l.id = ep.lote_origem_id
         where l.contexto = 'Lote paralelo ao cadastro') <> 1
     or (select count(*)
         from public.equipamentos e
         join public.equipamentos_patrimonio ep on ep.equipamento_id = e.id
         where e.nome = 'CADASTRO PARALELO AO LOTE'
           and ep.origem = 'cadastro') <> 2
     or (select count(distinct numero) from public.equipamentos_patrimonio) <> v_total
     or (select count(distinct codigo) from public.equipamentos_patrimonio) <> v_total
     or (select count(distinct public_id) from public.equipamentos_patrimonio) <> v_total
     or (select last_value from public.patrimonio_np_seq) <> (select max(numero) from public.equipamentos_patrimonio) then
    raise exception 'Lote e cadastro simultaneos colidiram ou abriram lacuna inesperada na sequencia NP.';
  end if;
end;
$$;

insert into patrimonio_resultados (origem, resultado)
select 'np_antes_cancelamento', last_value::text from public.patrimonio_np_seq;

select set_config(
  'request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', false
);
set role authenticated;
select public.patrimonio_preparar_lote(
  :'campanha_id'::uuid, 1, 'Cancelamento concorrente',
  false,
  '93000000-0000-0000-0000-000000000008'
) as lote_cancelamento
\gset
reset role;

-- 8. Cancelamento e geracao do mesmo lote usam o mesmo lock de linha. Com o
-- cancelamento ainda sem commit, gerar aguarda e depois falha sem chamar nextval.
select dblink_exec('patrimonio_a', 'begin');
select dblink_exec(
  'patrimonio_a',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_a', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_a',
  format(
    'select public.patrimonio_teste_cancelar(%L::uuid, %L, %L::uuid)',
    :'lote_cancelamento', 'Cancelamento concorrente local',
    '93000000-0000-0000-0000-000000000009'
  )
);
do $$ begin
  while dblink_is_busy('patrimonio_a') = 1 loop perform pg_sleep(0.01); end loop;
end; $$;
insert into patrimonio_resultados
select 'cancelamento_a', resultado
from dblink_get_result('patrimonio_a') as t(resultado text);
select * from dblink_get_result('patrimonio_a') as t(resultado text);

select dblink_exec('patrimonio_b', 'begin');
select dblink_exec(
  'patrimonio_b',
  'set request.jwt.claim.sub = ''91000000-0000-0000-0000-000000000001'''
);
select dblink_exec('patrimonio_b', 'set local role authenticated');
select dblink_send_query(
  'patrimonio_b',
  format(
    'select public.patrimonio_teste_gerar(%L::uuid, %L::uuid)',
    :'lote_cancelamento', '93000000-0000-0000-0000-000000000010'
  )
);
select pg_sleep(0.25);
do $$ begin
  if dblink_is_busy('patrimonio_b') <> 1 then
    raise exception 'Geracao nao aguardou o cancelamento concorrente.';
  end if;
end; $$;
select dblink_exec('patrimonio_a', 'commit');
insert into patrimonio_resultados
select 'geracao_pos_cancelamento', resultado
from dblink_get_result('patrimonio_b') as t(resultado text);
select * from dblink_get_result('patrimonio_b') as t(resultado text);
select dblink_exec('patrimonio_b', 'commit');

do $$
begin
  if (select resultado from patrimonio_resultados where origem = 'geracao_pos_cancelamento') <> '55000'
     or (select situacao from public.patrimonio_lotes
         where contexto = 'Cancelamento concorrente') <> 'cancelado'
     or exists (
       select 1
       from public.equipamentos_patrimonio ep
       join public.patrimonio_lotes l on l.id = ep.lote_origem_id
       where l.contexto = 'Cancelamento concorrente'
     )
     or (select last_value::text from public.patrimonio_np_seq)
        <> (select resultado from patrimonio_resultados where origem = 'np_antes_cancelamento') then
    raise exception 'Geracao concorrente venceu cancelamento ou consumiu NP.';
  end if;
end;
$$;

select dblink_disconnect('patrimonio_a');
select dblink_disconnect('patrimonio_b');

drop function public.patrimonio_teste_preparar(uuid, integer, text, boolean, uuid);
drop function public.patrimonio_teste_criar_campanha(text, uuid);
drop function public.patrimonio_teste_gerar(uuid, uuid);
drop function public.patrimonio_teste_vincular(text, bigint, jsonb, uuid);
drop function public.patrimonio_teste_cadastrar(jsonb, integer, uuid);
drop function public.patrimonio_teste_cancelar(uuid, text, uuid);

\echo 'OK: reservas, idempotencia, vinculos, cadastros, sequencia e cancelamento concorrentes validados.'
