-- Executar somente em PostgreSQL local descartavel, depois do bootstrap e das
-- migrations 202609010900..202609021100. O script termina em ROLLBACK; nextval
-- nao e transacional, portanto recrie o banco antes de repetir a suite.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_last bigint;
  v_called boolean;
begin
  if (select count(*) from public.equipamento_categorias) <> 9 then
    raise exception 'Catalogo nao possui nove categorias.';
  end if;
  if not exists (
    select 1 from public.equipamento_categorias
    where codigo = 'maquina_de_brindes' and not patrimoniavel
  ) then raise exception 'Maquina de Brindes nao esta bloqueada no catalogo.'; end if;
  if exists (select 1 from public.patrimonio_campanhas)
     or exists (select 1 from public.patrimonio_lotes)
     or exists (select 1 from public.equipamentos_patrimonio)
     or exists (select 1 from public.equipamentos_patrimonio_legados) then
    raise exception 'Migration estrutural criou campanha, lote, NP ou legado real.';
  end if;
  select last_value, is_called into v_last, v_called from public.patrimonio_np_seq;
  if v_last <> 1 or v_called then raise exception 'Sequencia NP nao esta virgem.'; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patrimonio_campanha_equipamentos'
      and column_name in ('localizacao_snapshot', 'ponto_id_snapshot', 'gerente_snapshot')
  ) then raise exception 'Snapshot de campanha congelou contexto operacional mutavel.'; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'equipamentos_patrimonio_legados'
      and column_name = 'public_id'
  ) then raise exception 'Legado recebeu public_id operacional.'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'equipamentos_patrimonio'
      and column_name = 'public_id' and data_type = 'text'
  ) then raise exception 'public_id canonico nao usa token textual compacto.'; end if;
end;
$$;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'admin@local.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'operador@local.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'gerente@local.invalid'),
  ('10000000-0000-0000-0000-000000000004', 'consulta@local.invalid'),
  ('10000000-0000-0000-0000-000000000005', 'semperfil@local.invalid'),
  ('10000000-0000-0000-0000-000000000006', 'gerente-sem-identidade@local.invalid');

-- A baseline historica reproduz o trigger real de criacao de perfil. Remove-se
-- deliberadamente esta linha para manter o caso de teste "usuario sem perfil".
delete from public.perfis
where user_id = '10000000-0000-0000-0000-000000000005';

insert into public.perfis (user_id, nome, perfil, gerente_nome, login_nome, rotas_permitidas) values
  ('10000000-0000-0000-0000-000000000001', 'Admin Local', 'administrador', '', 'admin.local', '{}'),
  ('10000000-0000-0000-0000-000000000002', 'Operador Local', 'operador', '', 'operador.local', '{}'),
  ('10000000-0000-0000-0000-000000000003', 'Gerente Local', 'gerente', 'Gerente Rota A', 'gerente.local', array['Gerente Rota A']),
  ('10000000-0000-0000-0000-000000000004', 'Consulta Local', 'consulta', '', 'consulta.local', '{}'),
  ('10000000-0000-0000-0000-000000000006', null, 'gerente', '', null, array['Gerente Rota A'])
on conflict (user_id) do update set
  nome = excluded.nome,
  perfil = excluded.perfil,
  gerente_nome = excluded.gerente_nome,
  login_nome = excluded.login_nome,
  rotas_permitidas = excluded.rotas_permitidas;

insert into public.pontos (id, nome_fantasia, gerente) overriding system value values
  (501, 'Ponto Rota A', 'Gerente Rota A'),
  (502, 'Ponto Fora', 'Gerente Fora');

select set_config('stockon.patrimonio_rpc', 'permitido', true);
select set_config('stockon.patrimonio_legado_manutencao', 'permitido', true);
insert into public.equipamentos (
  id, nome, categoria, quantidade, localizacao, patrimonio, status, minimo,
  observacao, responsavel, data_cadastro, gerente_responsavel
) overriding system value values
  (1001, 'Terminal com legado', 'Terminais', 1, '', 'LEG-TERM-001', 'Disponível', 1, '', '', '2026-09-01', ''),
  (1002, 'Televisao da campanha', 'Televisões', 1, '', '', 'Disponível', 1, '', '', '2026-09-01', ''),
  (1003, 'Maquina com legado', 'Máquina de Brindes', 1, '', 'BRIND-ANT-01', 'Disponível', 1, '', '', '2026-09-01', ''),
  (1004, 'Totem orfao', 'Totens', 1, '', '', 'Disponível', 1, '', '', '2026-09-01', ''),
  (1005, 'Tablet da rota', 'Tablets', 1, 'Ponto Rota A', '', 'Em rota', 1, '', 'Gerente Rota A', '2026-09-01', 'Gerente Rota A'),
  (1006, 'Impressora removivel', 'Impressoras', 1, '', '', 'Disponível', 1, '', '', '2026-09-01', ''),
  (1007, 'Carregador reserva', 'Carregadores', 1, '', '', 'Disponível', 1, '', '', '2026-09-01', ''),
  (1008, 'Televisao com localizacao orfa', 'Televisões', 1, 'Ponto Fantasma', '', 'Em rota', 1, '', '', '2026-09-01', '');
select set_config('stockon.patrimonio_rpc', '', true);
select set_config('stockon.patrimonio_legado_manutencao', '', true);

create or replace function private.patrimonio_teste_falhar_pos_nextval()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if current_setting('patrimonio.teste_falhar_numero', true) <> ''
     and new.numero = current_setting('patrimonio.teste_falhar_numero', true)::bigint then
    raise exception 'falha patrimonial injetada apos nextval' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger zz_patrimonio_teste_falha_pos_nextval
before insert on public.equipamentos_patrimonio
for each row execute function private.patrimonio_teste_falhar_pos_nextval();

create or replace function private.patrimonio_teste_estado_sequencia_np()
returns table (ultimo bigint, chamada boolean)
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select s.last_value, s.is_called
  from public.patrimonio_np_seq s;
$$;

revoke all on function private.patrimonio_teste_estado_sequencia_np()
  from public, anon, authenticated, service_role;
grant execute on function private.patrimonio_teste_estado_sequencia_np()
  to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_admin constant uuid := '10000000-0000-0000-0000-000000000001';
  v_operador constant uuid := '10000000-0000-0000-0000-000000000002';
  v_gerente constant uuid := '10000000-0000-0000-0000-000000000003';
  v_consulta constant uuid := '10000000-0000-0000-0000-000000000004';
  v_sem_perfil constant uuid := '10000000-0000-0000-0000-000000000005';
  v_gerente_sem_identidade constant uuid := '10000000-0000-0000-0000-000000000006';
  v_campanha uuid;
  v_campanha_repetida uuid;
  v_lote_1 uuid;
  v_lote_2 uuid;
  v_lote_3 uuid;
  v_lote_excesso uuid;
  v_lote_cancelado uuid;
  v_resultado jsonb;
  v_resultado_repetido jsonb;
  v_pat_1 text;
  v_pat_2 text;
  v_pat_3 text;
  v_pat_4 text;
  v_pat_5 text;
  v_equip_novo_1 bigint;
  v_equip_novo_2 bigint;
  v_equip_novo_final bigint;
  v_seq_antes bigint;
  v_seq_depois bigint;
  v_falha_numero bigint;
  v_legado_1 bigint;
  v_legado_maquina bigint;
  v_item uuid;
  v_item_deletado uuid;
begin
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  v_seq_antes := (select ultimo from private.patrimonio_teste_estado_sequencia_np());
  v_legado_1 := public.patrimonio_importar_legado(
    1001, 'LEG-TERM-001', '20000000-0000-0000-0000-000000000001'
  );
  if public.patrimonio_importar_legado(
    1001, 'LEG-TERM-001', '20000000-0000-0000-0000-000000000001'
  ) <> v_legado_1 then raise exception 'Importacao legada nao foi idempotente.'; end if;
  v_legado_maquina := public.patrimonio_importar_legado(
    1003, 'BRIND-ANT-01', '20000000-0000-0000-0000-000000000002'
  );
  v_seq_depois := (select ultimo from private.patrimonio_teste_estado_sequencia_np());
  if v_seq_depois <> v_seq_antes
     or (select chamada from private.patrimonio_teste_estado_sequencia_np()) then
    raise exception 'Legado consumiu sequencia NP.';
  end if;
  if exists (
    select 1 from public.equipamentos_patrimonio ep where ep.equipamento_id in (1001, 1003)
  ) then raise exception 'Legado vazou para tabela canonica NP.'; end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio_legados
    where id = v_legado_maquina and equipamento_id = 1003 and codigo = 'BRIND-ANT-01'
  ) then raise exception 'Legado da categoria nao patrimoniavel nao foi preservado.'; end if;

  delete from public.equipamentos where id = 1003;
  if not exists (
    select 1 from public.equipamentos_patrimonio_legados
    where id = v_legado_maquina and equipamento_id is null and equipamento_id_snapshot = 1003
  ) then raise exception 'ON DELETE SET NULL nao preservou legado.'; end if;

  v_campanha := public.patrimonio_criar_campanha(
    'Implantacao local controlada', '20000000-0000-0000-0000-000000000010'
  );
  v_campanha_repetida := public.patrimonio_criar_campanha(
    'Implantacao local controlada', '20000000-0000-0000-0000-000000000010'
  );
  if v_campanha_repetida <> v_campanha then raise exception 'Campanha nao foi idempotente.'; end if;
  if (select quantidade_snapshot from public.patrimonio_campanhas where id = v_campanha) <> 7
     or (select count(*) from public.patrimonio_campanha_equipamentos where campanha_id = v_campanha) <> 7 then
    raise exception 'Snapshot nao incluiu exatamente os sete patrimoniaveis existentes.';
  end if;
  if exists (
    select 1 from public.patrimonio_campanha_equipamentos ce
    where ce.campanha_id = v_campanha and ce.equipamento_id_snapshot = 1003
  ) then raise exception 'Maquina de Brindes entrou na campanha.'; end if;
  if not exists (
    select 1 from public.patrimonio_campanha_equipamentos ce
    where ce.campanha_id = v_campanha and ce.equipamento_id_snapshot in (1001, 1004)
  ) then raise exception 'Legado patrimoniavel ou equipamento em estoque ficou fora da campanha.'; end if;
  if not exists (
    select 1 from public.patrimonio_campanha_equipamentos ce
    where ce.campanha_id = v_campanha and ce.equipamento_id_snapshot = 1008
  ) then raise exception 'Equipamento com localizacao orfa foi removido da meta da campanha.'; end if;

  update public.equipamentos set localizacao = 'Ponto Fora', status = 'Em rota' where id = 1001;
  if (select quantidade_snapshot from public.patrimonio_campanhas where id = v_campanha) <> 7 then
    raise exception 'Mudanca operacional alterou meta da campanha.';
  end if;
  select id into v_item_deletado from public.patrimonio_campanha_equipamentos
  where campanha_id = v_campanha and equipamento_id_snapshot = 1006;
  delete from public.equipamentos where id = 1006;
  if not exists (
    select 1 from public.patrimonio_campanha_equipamentos
    where id = v_item_deletado and equipamento_id is null and equipamento_id_snapshot = 1006
  ) then raise exception 'Snapshot nao sobreviveu ao DELETE anterior ao vinculo.'; end if;

  begin
    perform public.patrimonio_preparar_lote(
      v_campanha, 8, '{"tipo":"estoque"}'::jsonb,
      'Excesso deve exigir confirmacao', false,
      '20000000-0000-0000-0000-000000000018'
    );
    raise exception 'Lote excedente foi preparado sem confirmacao explicita.';
  exception when sqlstate '22023' then null; end;
  v_lote_excesso := public.patrimonio_preparar_lote(
    v_campanha, 8, '{"tipo":"estoque"}'::jsonb,
    'Excesso confirmado para auditoria', true,
    '20000000-0000-0000-0000-000000000019'
  );
  if not exists (
    select 1 from public.patrimonio_lotes l
    where l.id = v_lote_excesso
      and l.saldo_pendente_no_preparo = 7
      and l.demanda_contexto_no_preparo = 3
      and l.quantidade_excedente = 1
      and l.quantidade_excedente_contexto = 5
      and l.excesso_confirmado
      and l.excesso_contexto_confirmado
  ) then raise exception 'Aviso/confirmacao de excesso nao ficou auditavel no lote.'; end if;
  perform public.patrimonio_cancelar_lote(
    v_lote_excesso, 'Lote excedente criado apenas para validar confirmacao',
    '20000000-0000-0000-0000-000000000017'
  );

  v_lote_1 := public.patrimonio_preparar_lote(
    v_campanha, 3, '{"tipo":"estoque"}'::jsonb,
    'Primeiro recorte local', false,
    '20000000-0000-0000-0000-000000000020'
  );
  v_resultado := public.patrimonio_gerar_lote(
    v_lote_1, '20000000-0000-0000-0000-000000000021'
  );
  v_resultado_repetido := public.patrimonio_gerar_lote(
    v_lote_1, '20000000-0000-0000-0000-000000000021'
  );
  if v_resultado_repetido <> v_resultado
     or jsonb_array_length(v_resultado -> 'etiquetas') <> 3 then
    raise exception 'Geracao livre nao retornou lista real/idempotente.';
  end if;
  if (select count(*) from public.equipamentos_patrimonio where lote_origem_id = v_lote_1 and situacao = 'disponivel' and equipamento_id is null) <> 3 then
    raise exception 'Etiquetas nao nasceram livres.';
  end if;
  if (select patrimonio from public.equipamentos where id = 1001) <> 'LEG-TERM-001' then
    raise exception 'Geracao sobrescreveu referencia legada.';
  end if;
  begin
    perform public.patrimonio_gerar_lote(v_lote_1, '20000000-0000-0000-0000-000000000020');
    raise exception 'Chave reutilizada com operacao diferente foi aceita.';
  exception when sqlstate '22023' then null; end;

  select v_resultado -> 'etiquetas' -> 0 ->> 'public_id',
         v_resultado -> 'etiquetas' -> 1 ->> 'public_id',
         v_resultado -> 'etiquetas' -> 2 ->> 'public_id'
  into v_pat_1, v_pat_2, v_pat_3;
  if exists (
    select 1
    from public.equipamentos_patrimonio ep
    where ep.lote_origem_id = v_lote_1
      and (char_length(ep.public_id) <> 22 or ep.public_id !~ '^[A-Za-z0-9_-]{22}$')
  ) or (select count(distinct ep.public_id) from public.equipamentos_patrimonio ep where ep.lote_origem_id = v_lote_1) <> 3 then
    raise exception 'Tokens public_id nao sao opacos, URL-safe, compactos e unicos.';
  end if;

  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  begin
    perform public.patrimonio_vincular_etiqueta(
      v_pat_1, 1001,
      jsonb_build_object('status', 'Disponível', 'localizacao', ''),
      '20000000-0000-0000-0000-000000000029'
    );
    raise exception 'Vinculo aceitou posicao operacional divergente.';
  exception when sqlstate '40001' then null; end;
  perform public.patrimonio_vincular_etiqueta(
    v_pat_1, 1001,
    jsonb_build_object(
      'status', (select coalesce(e.status, '') from public.equipamentos e where e.id = 1001),
      'localizacao', (select coalesce(e.localizacao, '') from public.equipamentos e where e.id = 1001)
    ),
    '20000000-0000-0000-0000-000000000030'
  );
  perform public.patrimonio_aplicar_etiqueta(v_pat_1, '20000000-0000-0000-0000-000000000031');
  begin
    perform public.patrimonio_conferir_etiqueta(
      v_pat_1, 1002, v_pat_1, 'qr',
      '20000000-0000-0000-0000-000000000032'
    );
    raise exception 'Conferencia aceitou equipamento divergente.';
  exception when sqlstate '23514' then null; end;
  begin
    perform public.patrimonio_conferir_etiqueta(
      v_pat_1, 1001, 'NP-999999', 'codigo',
      '20000000-0000-0000-0000-000000000038'
    );
    raise exception 'Conferencia aceitou segunda leitura divergente.';
  exception when sqlstate '23514' then null; end;
  perform public.patrimonio_conferir_etiqueta(
    v_pat_1, 1001, v_pat_1, 'qr',
    '20000000-0000-0000-0000-000000000033'
  );
  if not exists (
    select 1 from public.equipamentos_patrimonio ep
    join public.equipamentos_patrimonio_legados lg on lg.equipamento_id_snapshot = ep.equipamento_id
    where ep.public_id = v_pat_1 and ep.situacao = 'conferido' and lg.codigo = 'LEG-TERM-001'
  ) then raise exception 'NP atual e referencia anterior nao coexistem.'; end if;

  perform public.patrimonio_vincular_etiqueta(
    v_pat_2, 1002,
    jsonb_build_object(
      'status', (select coalesce(e.status, '') from public.equipamentos e where e.id = 1002),
      'localizacao', (select coalesce(e.localizacao, '') from public.equipamentos e where e.id = 1002)
    ),
    '20000000-0000-0000-0000-000000000034'
  );
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.patrimonio_anular(v_pat_2, 'Etiqueta fisica danificada', '20000000-0000-0000-0000-000000000035');
  perform public.patrimonio_anular(v_pat_3, 'Etiqueta livre danificada', '20000000-0000-0000-0000-000000000036');
  perform public.patrimonio_concluir_lote(v_lote_1, '20000000-0000-0000-0000-000000000037');

  v_lote_2 := public.patrimonio_preparar_lote(
    v_campanha, 1, '{"tipo":"estoque"}'::jsonb,
    'Teste de correcao', false,
    '20000000-0000-0000-0000-000000000040'
  );
  v_resultado := public.patrimonio_gerar_lote(v_lote_2, '20000000-0000-0000-0000-000000000041');
  v_pat_4 := v_resultado -> 'etiquetas' -> 0 ->> 'public_id';
  perform public.patrimonio_vincular_etiqueta(
    v_pat_4, 1004,
    jsonb_build_object(
      'status', (select coalesce(e.status, '') from public.equipamentos e where e.id = 1004),
      'localizacao', (select coalesce(e.localizacao, '') from public.equipamentos e where e.id = 1004)
    ),
    '20000000-0000-0000-0000-000000000042'
  );
  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  perform public.patrimonio_aplicar_etiqueta(v_pat_4, '20000000-0000-0000-0000-000000000039');
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.patrimonio_corrigir_vinculo(v_pat_4, 1005, 'Selecao inicial incorreta', '20000000-0000-0000-0000-000000000043');
  if not exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.public_id = v_pat_4
      and ep.equipamento_id = 1005
      and ep.situacao = 'vinculado'
      and ep.aplicado_em is null
      and ep.aplicado_por_user_id is null
      and ep.aplicado_por_nome_snapshot is null
      and ep.aplicado_por_perfil_snapshot is null
      and ep.conferido_em is null
      and ep.conferido_por_user_id is null
      and ep.conferido_por_nome_snapshot is null
      and ep.conferido_por_perfil_snapshot is null
  ) then raise exception 'Correcao de vinculo nao reiniciou aplicacao/conferencia.'; end if;
  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  perform public.patrimonio_aplicar_etiqueta(v_pat_4, '20000000-0000-0000-0000-000000000044');
  perform public.patrimonio_conferir_etiqueta(
    v_pat_4, 1005,
    right(regexp_replace((select ep.codigo from public.equipamentos_patrimonio ep where ep.public_id = v_pat_4), '[^0-9]', '', 'g'), 4),
    'sufixo_4', '20000000-0000-0000-0000-000000000045'
  );
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.patrimonio_concluir_lote(v_lote_2, '20000000-0000-0000-0000-000000000046');
  begin
    delete from public.equipamentos where id = 1005;
    raise exception 'DELETE de equipamento vinculado foi aceito.';
  exception when foreign_key_violation then null; end;

  v_lote_3 := public.patrimonio_preparar_lote(
    v_campanha, 1, '{"tipo":"estoque"}'::jsonb,
    'Estoque livre para teste RLS', false,
    '20000000-0000-0000-0000-000000000050'
  );
  v_resultado := public.patrimonio_gerar_lote(v_lote_3, '20000000-0000-0000-0000-000000000051');
  v_pat_5 := v_resultado -> 'etiquetas' -> 0 ->> 'public_id';
  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  begin
    perform public.patrimonio_vincular_etiqueta(
      v_pat_5, 1008,
      jsonb_build_object('status', 'Em rota', 'localizacao', 'Ponto Fantasma'),
      '20000000-0000-0000-0000-000000000049'
    );
    raise exception 'Vinculo aceitou equipamento com localizacao orfa.';
  exception when sqlstate '23514' then null; end;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  if (select count(*) from public.patrimonio_resolver_public_id(v_pat_5)) <> 1 then
    raise exception 'Deep link admin nao resolveu etiqueta livre.';
  end if;

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  if exists (select 1 from public.equipamentos_patrimonio where public_id = v_pat_5)
     or exists (select 1 from public.patrimonio_lotes)
     or exists (select 1 from public.patrimonio_campanhas) then
    raise exception 'Gerente visualizou estoque livre ou administracao de campanha/lote.';
  end if;
  if not exists (
    select 1 from public.patrimonio_resolver_public_id(v_pat_5) r
    where r.public_id = v_pat_5 and r.codigo is not null and r.situacao = 'disponivel'
  ) then raise exception 'Gerente nao recebeu estado neutro da etiqueta livre escaneada.'; end if;
  if exists (
    select 1 from public.patrimonio_resolver_public_id(v_pat_5) r
    where r.origem is not null
       or r.equipamento_id is not null
       or r.equipamento_nome is not null
       or r.equipamento_categoria is not null
       or r.equipamento_status is not null
       or r.equipamento_localizacao is not null
       or r.lote_codigo is not null
       or r.campanha_codigo is not null
       or r.referencias_anteriores <> '[]'::jsonb
  ) then raise exception 'Estado neutro da etiqueta livre divulgou contexto protegido.'; end if;
  if exists (select 1 from public.patrimonio_resolver_public_id(v_pat_1)) then
    raise exception 'Gerente resolveu NP vinculado fora do seu escopo.';
  end if;
  if not exists (select 1 from public.patrimonio_resolver_public_id(v_pat_4) where equipamento_id = 1005) then
    raise exception 'Gerente nao resolveu NP vinculado dentro do escopo.';
  end if;
  begin
    perform public.patrimonio_aplicar_etiqueta(v_pat_5, gen_random_uuid());
    raise exception 'Gerente executou aplicacao patrimonial.';
  exception when sqlstate '42501' then null; end;

  perform set_config('request.jwt.claim.sub', v_gerente_sem_identidade::text, true);
  if exists (select 1 from public.equipamentos_patrimonio) then
    raise exception 'Gerente sem identidade operacional recebeu escopo patrimonial.';
  end if;
  begin
    perform public.patrimonio_cadastrar_equipamentos(
      jsonb_build_object(
        'nome', 'Cadastro por gerente sem identidade', 'categoria', 'Máquina de Brindes',
        'status', 'Disponível', 'minimo', 5, 'observacao', '',
        'localizacao', '', 'responsavel', '', 'data_cadastro', '2026-09-01',
        'gerente_responsavel', '', 'transferencia_status', ''
      ),
      1,
      '20000000-0000-0000-0000-000000000054'
    );
    raise exception 'Gerente sem identidade operacional cadastrou equipamento.';
  exception when sqlstate '42501' then null; end;

  perform set_config('request.jwt.claim.sub', v_consulta::text, true);
  if exists (select 1 from public.equipamentos_patrimonio)
     or exists (select 1 from public.patrimonio_eventos) then
    raise exception 'Perfil consulta recebeu dados patrimoniais fora do contrato atual.';
  end if;
  perform set_config('request.jwt.claim.sub', v_sem_perfil::text, true);
  if exists (select 1 from public.equipamentos_patrimonio) then
    raise exception 'Usuario sem perfil recebeu dados patrimoniais.';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.patrimonio_anular(v_pat_5, 'Etiqueta reservada para teste encerrada', '20000000-0000-0000-0000-000000000052');
  perform public.patrimonio_concluir_lote(v_lote_3, '20000000-0000-0000-0000-000000000053');

  select id into v_item from public.patrimonio_campanha_equipamentos
  where campanha_id = v_campanha and equipamento_id_snapshot = 1002;
  perform public.patrimonio_resolver_item_campanha_excecao(v_item, 'outro', 'Etiqueta anulada antes da conferencia', '20000000-0000-0000-0000-000000000060');
  select id into v_item from public.patrimonio_campanha_equipamentos
  where campanha_id = v_campanha and equipamento_id_snapshot = 1004;
  perform public.patrimonio_resolver_item_campanha_excecao(v_item, 'outro', 'Vinculo corrigido para outro equipamento', '20000000-0000-0000-0000-000000000061');
  perform public.patrimonio_resolver_item_campanha_excecao(v_item_deletado, 'equipamento_excluido', 'Equipamento excluido antes do vinculo', '20000000-0000-0000-0000-000000000062');
  select id into v_item from public.patrimonio_campanha_equipamentos
  where campanha_id = v_campanha and equipamento_id_snapshot = 1007;
  perform public.patrimonio_resolver_item_campanha_excecao(v_item, 'outro', 'Fora do recorte fisico do piloto', '20000000-0000-0000-0000-000000000063');
  select id into v_item from public.patrimonio_campanha_equipamentos
  where campanha_id = v_campanha and equipamento_id_snapshot = 1008;
  perform public.patrimonio_resolver_item_campanha_excecao(v_item, 'inelegivel', 'Localizacao orfa exige revisao logistica', '20000000-0000-0000-0000-000000000066');
  perform public.patrimonio_concluir_campanha(v_campanha, '20000000-0000-0000-0000-000000000064');
  if (select situacao from public.patrimonio_campanhas where id = v_campanha) <> 'concluida' then
    raise exception 'Campanha resolvida nao foi concluida.';
  end if;

  begin
    v_lote_cancelado := public.patrimonio_preparar_lote(
      v_campanha, 1, '{"tipo":"estoque"}'::jsonb,
      'Nao deve preparar em campanha concluida', false,
      '20000000-0000-0000-0000-000000000065'
    );
    raise exception 'Lote foi preparado em campanha concluida: %', v_lote_cancelado;
  exception when sqlstate '55000' then null;
  end;
end;
$$;

-- O bloco anterior encerra ao testar campanha concluida. Os cenarios de cadastro
-- futuro continuam em um novo bloco, preservando a mesma transacao local.
do $$
declare
  v_admin constant uuid := '10000000-0000-0000-0000-000000000001';
  v_resultado jsonb;
  v_repetido jsonb;
  v_machine jsonb;
  v_equip_1 bigint;
  v_equip_2 bigint;
  v_equip_direto bigint;
  v_seq_antes bigint;
  v_seq_machine bigint;
  v_falha_numero bigint;
  v_numero_final bigint;
begin
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  v_resultado := public.patrimonio_cadastrar_equipamentos(
    jsonb_build_object(
      'nome', 'Terminal novo atomico', 'categoria', 'Terminais',
      'status', 'Disponível', 'minimo', 5, 'observacao', '',
      'localizacao', '', 'responsavel', '', 'data_cadastro', '2026-09-01',
      'gerente_responsavel', '', 'transferencia_status', ''
    ),
    2,
    '30000000-0000-0000-0000-000000000001'
  );
  v_repetido := public.patrimonio_cadastrar_equipamentos(
    jsonb_build_object(
      'nome', 'Terminal novo atomico', 'categoria', 'Terminais',
      'status', 'Disponível', 'minimo', 5, 'observacao', '',
      'localizacao', '', 'responsavel', '', 'data_cadastro', '2026-09-01',
      'gerente_responsavel', '', 'transferencia_status', ''
    ),
    2,
    '30000000-0000-0000-0000-000000000001'
  );
  if v_repetido <> v_resultado or jsonb_array_length(v_resultado -> 'itens') <> 2 then
    raise exception 'Cadastro futuro nao foi atomico/idempotente.';
  end if;
  v_equip_1 := (v_resultado -> 'itens' -> 0 ->> 'equipamento_id')::bigint;
  v_equip_2 := (v_resultado -> 'itens' -> 1 ->> 'equipamento_id')::bigint;
  if (select count(*) from public.equipamentos_patrimonio
      where equipamento_id in (v_equip_1, v_equip_2)
        and origem = 'cadastro' and situacao = 'vinculado'
        and lote_origem_id is null and campanha_item_id is null) <> 2 then
    raise exception 'Cadastro futuro nao criou dois NPs ja vinculados.';
  end if;
  if exists (select 1 from public.equipamentos where id in (v_equip_1, v_equip_2) and patrimonio <> '') then
    raise exception 'Cadastro futuro escreveu NP no campo legado.';
  end if;

  v_seq_antes := (select ultimo from private.patrimonio_teste_estado_sequencia_np());
  v_machine := public.patrimonio_cadastrar_equipamentos(
    jsonb_build_object(
      'nome', 'Maquina nova sem NP', 'categoria', 'Máquina de Brindes',
      'status', 'Disponível', 'minimo', 5, 'observacao', '',
      'localizacao', '', 'responsavel', '', 'data_cadastro', '2026-09-01',
      'gerente_responsavel', '', 'transferencia_status', ''
    ),
    1,
    '30000000-0000-0000-0000-000000000002'
  );
  v_seq_machine := (select ultimo from private.patrimonio_teste_estado_sequencia_np());
  if v_seq_machine <> v_seq_antes
     or (v_machine -> 'itens' -> 0 ->> 'codigo') is not null then
    raise exception 'Maquina de Brindes consumiu NP.';
  end if;

  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'Cadastro real preservado sem NP automatico', 'Terminais', 1,
    'Disponível', 5, '', '', '', '', '2026-09-01', ''
  ) returning id into v_equip_direto;
  if exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.equipamento_id = v_equip_direto
  ) then raise exception 'Cadastro real atual ativou NP automaticamente antes da fase autorizada.'; end if;

  v_falha_numero := (select ultimo + 2 from private.patrimonio_teste_estado_sequencia_np());
  perform set_config('patrimonio.teste_falhar_numero', v_falha_numero::text, true);
  begin
    perform public.patrimonio_cadastrar_equipamentos(
      jsonb_build_object(
        'nome', 'Cadastro com falha injetada', 'categoria', 'Televisões',
        'status', 'Disponível', 'minimo', 5, 'observacao', '',
        'localizacao', '', 'responsavel', '', 'data_cadastro', '2026-09-01',
        'gerente_responsavel', '', 'transferencia_status', ''
      ),
      2,
      '30000000-0000-0000-0000-000000000003'
    );
    raise exception 'Falha pos-nextval nao foi disparada.';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'falha patrimonial injetada apos nextval' then raise; end if;
  end;
  perform set_config('patrimonio.teste_falhar_numero', '', true);
  if (select ultimo from private.patrimonio_teste_estado_sequencia_np()) <> v_falha_numero
     or exists (select 1 from public.equipamentos where nome = 'Cadastro com falha injetada')
     or exists (select 1 from public.equipamentos_patrimonio where numero in (v_falha_numero - 1, v_falha_numero)) then
    raise exception 'Rollback pos-nextval nao foi atomico ou reutilizou sequencia.';
  end if;

  v_resultado := public.patrimonio_cadastrar_equipamentos(
    jsonb_build_object(
      'nome', 'Cadastro apos lacuna', 'categoria', 'PDV Touchscreen',
      'status', 'Disponível', 'minimo', 5, 'observacao', '',
      'localizacao', '', 'responsavel', '', 'data_cadastro', '2026-09-01',
      'gerente_responsavel', '', 'transferencia_status', ''
    ),
    1,
    '30000000-0000-0000-0000-000000000004'
  );
  v_numero_final := (select numero from public.equipamentos_patrimonio
    where public_id = (v_resultado -> 'itens' -> 0 ->> 'public_id'));
  if v_numero_final <= v_falha_numero then raise exception 'Numero consumido em rollback foi reutilizado.'; end if;

  begin
    update public.equipamentos set patrimonio = 'NP-FALSO' where id = v_equip_1;
    raise exception 'Campo legado foi alterado livremente.';
  exception when sqlstate '42501' then null; end;
  begin
    delete from public.equipamentos_patrimonio where equipamento_id = v_equip_1;
    raise exception 'DELETE canonico foi aceito.';
  exception when insufficient_privilege then null; end;
  begin
    update public.patrimonio_eventos set detalhes = '{"adulterado":true}' where patrimonio_id is not null;
    raise exception 'UPDATE de evento append-only foi aceito.';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;

drop function private.patrimonio_teste_estado_sequencia_np();

do $$
declare
  v_role text;
  v_table text;
  v_sequence text;
  v_function text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_table in array array[
      'public.patrimonio_campanhas',
      'public.patrimonio_campanha_equipamentos',
      'public.patrimonio_lotes',
      'public.equipamentos_patrimonio',
      'public.equipamentos_patrimonio_legados',
      'public.patrimonio_operacoes_idempotentes',
      'public.patrimonio_eventos'
    ] loop
      if has_table_privilege(v_role, v_table, 'INSERT')
         or has_table_privilege(v_role, v_table, 'UPDATE')
         or has_table_privilege(v_role, v_table, 'DELETE') then
        raise exception 'Escrita direta concedida em % para %.', v_table, v_role;
      end if;
    end loop;
  end loop;
  foreach v_sequence in array array[
    'public.patrimonio_np_seq', 'public.patrimonio_lote_seq',
    'public.equipamentos_patrimonio_id_seq',
    'public.equipamentos_patrimonio_legados_id_seq',
    'public.patrimonio_eventos_id_seq'
  ] loop
    if has_sequence_privilege('authenticated', v_sequence, 'USAGE')
       or has_sequence_privilege('anon', v_sequence, 'USAGE') then
      raise exception 'Sequencia % foi exposta.', v_sequence;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.patrimonio_operacoes_idempotentes', 'SELECT')
     or has_column_privilege('authenticated', 'public.patrimonio_eventos', 'idempotencia', 'SELECT') then
    raise exception 'Metadados internos de idempotencia foram expostos.';
  end if;
  foreach v_function in array array[
    'public.patrimonio_criar_campanha(text,uuid)',
    'public.patrimonio_preparar_lote(uuid,integer,jsonb,text,boolean,uuid)',
    'public.patrimonio_gerar_lote(uuid,uuid)',
    'public.patrimonio_cadastrar_equipamentos(jsonb,integer,uuid)',
    'public.patrimonio_vincular_etiqueta(text,bigint,jsonb,uuid)',
    'public.patrimonio_aplicar_etiqueta(text,uuid)',
    'public.patrimonio_conferir_etiqueta(text,bigint,text,text,uuid)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'RPC % exposta a anon.', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'RPC % indisponivel a authenticated.', v_function;
    end if;
  end loop;
  if has_function_privilege(
    'authenticated',
    'public.patrimonio_preparar_lote(uuid,integer,text,boolean,uuid)',
    'EXECUTE'
  ) then raise exception 'Assinatura antiga de preparo permaneceu exposta.'; end if;
  if has_function_privilege(
    'authenticated',
    'private.patrimonio_registrar_evento(text,uuid,uuid,uuid,bigint,bigint,bigint,text,text,text,jsonb,uuid)',
    'EXECUTE'
  ) then raise exception 'Helper privado de eventos foi exposto.'; end if;
end;
$$;

set local role anon;
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.patrimonio_resolver_public_id(repeat('A', 22));
    raise exception 'Anonimo executou lookup patrimonial.';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

drop trigger zz_patrimonio_teste_falha_pos_nextval on public.equipamentos_patrimonio;
drop function private.patrimonio_teste_falhar_pos_nextval();

rollback;
