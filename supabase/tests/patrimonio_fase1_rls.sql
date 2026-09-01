-- Executar somente em Supabase local descartavel, com psql -v ON_ERROR_STOP=1.
-- Requer schema operacional atual ou bootstrap_patrimonio_local.sql seguido das
-- migrations 202609010900 a 202609011010.
--
-- Todos os equipamentos/codigos abaixo sao ficticios e a transacao termina em
-- rollback. nextval(), porem, nao e transacional: descarte/recrie o banco local
-- depois do roteiro. Nunca execute este teste em projeto remoto.

begin;

do $$
declare
  v_total integer;
  v_called boolean;
  v_last bigint;
begin
  select count(*) into v_total from public.equipamento_categorias;
  if v_total <> 9 then raise exception 'Catalogo nao possui exatamente nove categorias.'; end if;
  if not exists (
    select 1 from public.equipamento_categorias
    where nome = 'Máquina de Brindes' and not patrimoniavel
  ) then raise exception 'Maquina de Brindes nao esta explicitamente bloqueada.'; end if;

  select last_value, is_called into v_last, v_called from public.patrimonio_np_seq;
  if v_last <> 1 or v_called then
    raise exception 'Teste exige sequencia local virgem em 1; banco descartavel deve ser recriado.';
  end if;
  select last_value, is_called into v_last, v_called from public.patrimonio_lote_seq;
  if v_last <> 1 or v_called then
    raise exception 'Teste exige sequencia local de lotes virgem em 1; banco descartavel deve ser recriado.';
  end if;

  if exists (select 1 from public.equipamentos_patrimonio)
     or exists (select 1 from public.patrimonio_lotes) then
    raise exception 'As migrations fizeram backfill/importacao ou o banco local nao esta limpo.';
  end if;
end;
$$;

do $$
declare
  v_admin uuid := '61000000-0000-0000-0000-000000000001';
  v_operador uuid := '61000000-0000-0000-0000-000000000002';
  v_gerente uuid := '61000000-0000-0000-0000-000000000003';
  v_consulta uuid := '61000000-0000-0000-0000-000000000004';
  v_sem_perfil uuid := '61000000-0000-0000-0000-000000000005';
  v_gerente_outro uuid := '61000000-0000-0000-0000-000000000006';
  v_equip_1 bigint;
  v_equip_2 bigint;
  v_equip_maquina bigint;
  v_equip_desconhecido bigint;
  v_equip_sem_ponto bigint;
  v_equip_legado bigint;
  v_equip_legado_maquina bigint;
  v_equip_legado_np bigint;
  v_equip_legado_vazio bigint;
  v_equip_conserto bigint;
  v_equip_deletavel bigint;
  v_equip_concorrente bigint;
  v_equip_reserva bigint;
  v_equip_falha_1 bigint;
  v_equip_falha_2 bigint;
  v_lote uuid;
  v_lote_repetido uuid;
  v_lote_novo uuid;
  v_lote_terceiro uuid;
  v_lote_concorrente_a uuid;
  v_lote_concorrente_b uuid;
  v_lote_conserto uuid;
  v_lote_deletavel uuid;
  v_lote_falha uuid;
  v_pat_1 uuid;
  v_pat_2 uuid;
  v_pat_novo uuid;
  v_pat_terceiro uuid;
  v_pat_concorrente uuid;
  v_pat_legado uuid;
  v_pat_legado_maquina uuid;
  v_codigo text;
  v_count bigint;
  v_last bigint;
  v_called boolean;
  v_gap bigint;
  v_lotes_antes bigint;
  v_public_id_duplicado uuid;
  v_tabela_leitura text;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patrimonio-admin@example.invalid', '', now(), now(), now()),
    (v_operador, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patrimonio-operador@example.invalid', '', now(), now(), now()),
    (v_gerente, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patrimonio-gerente@example.invalid', '', now(), now(), now()),
    (v_consulta, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patrimonio-consulta@example.invalid', '', now(), now(), now()),
    (v_sem_perfil, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patrimonio-sem-perfil@example.invalid', '', now(), now(), now()),
    (v_gerente_outro, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'patrimonio-gerente-outro@example.invalid', '', now(), now(), now())
  on conflict (id) do nothing;

  delete from public.perfis where user_id = v_sem_perfil;
  insert into public.perfis (user_id, nome, perfil, gerente_nome, rotas_permitidas)
  values
    (v_admin, 'Administrador Patrimonio', 'administrador', '', '{}'),
    (v_operador, 'Operador Patrimonio', 'operador', '', '{}'),
    (v_gerente, 'Gerente Patrimonio', 'gerente', 'Rota Patrimonio', array['Rota Patrimonio']),
    (v_consulta, 'Consulta Patrimonio', 'consulta', '', '{}'),
    (v_gerente_outro, 'Outro Gerente', 'gerente', 'Outro Gerente', '{}')
  on conflict (user_id) do update set
    nome = excluded.nome,
    perfil = excluded.perfil,
    gerente_nome = excluded.gerente_nome,
    rotas_permitidas = excluded.rotas_permitidas;

  insert into public.pontos (nome_fantasia, gerente)
  values ('PONTO PATRIMONIO VALIDO', 'Rota Patrimonio');

  -- O GUC apenas prepara fixtures como proprietario. Um usuario autenticado nao
  -- consegue falsifica-lo porque o trigger tambem exige o papel proprietario.
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TERMINAL PATRIMONIO 01', 'Terminais', 1, 'Disponível', 1, '', '', '', '', current_date::text, 'Outro Gerente'
  ) returning id into v_equip_1;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TV PATRIMONIO 02', 'Televisões', 1, 'Em rota', 1, '', 'PONTO PATRIMONIO VALIDO', '', '', current_date::text, ''
  ) returning id into v_equip_2;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'BRINDE PATRIMONIO', 'Máquina de Brindes', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
  ) returning id into v_equip_maquina;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'DESCONHECIDO PATRIMONIO', 'Categoria Fantasma', 1, 'Disponível', 1, '', '', '', 'UNKNOWN-LEGACY', current_date::text, ''
  ) returning id into v_equip_desconhecido;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TABLET SEM PONTO', 'Tablets', 1, 'Em rota', 1, '', 'PONTO QUE NAO EXISTE', '', '', current_date::text, ''
  ) returning id into v_equip_sem_ponto;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'IMPRESSORA LEGADA LOCAL', 'Impressoras', 1, 'Disponível', 1, '', '', '', 'LEGACY-LOCAL-001', current_date::text, ''
  ) returning id into v_equip_legado;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'BRINDE LEGADO MIXED', 'Máquina de Brindes', 1, 'Em rota', 1, '', 'PONTO LEGADO INEXISTENTE', '', 'MiXeD-Legacy-77', current_date::text, ''
  ) returning id into v_equip_legado_maquina;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TABLET LEGADO NP RESERVADO', 'Tablets', 1, 'Disponível', 1, '', '', '', 'NP-123456', current_date::text, ''
  ) returning id into v_equip_legado_np;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TABLET LEGADO SEM ESPELHO', 'Tablets', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
  ) returning id into v_equip_legado_vazio;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TABLET EM CONSERTO', 'Tablets', 1, 'Em conserto', 1, '', 'Em conserto', '', '', current_date::text, ''
  ) returning id into v_equip_conserto;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TOTEM PREPARADO DELETAVEL', 'Totens', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
  ) returning id into v_equip_deletavel;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TABLET CONCORRENCIA LOCAL', 'Tablets', 1, 'Disponível', 1, '', '', '', '', current_date::text, 'Rota Patrimonio'
  ) returning id into v_equip_concorrente;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TOTEM RESERVA LOCAL', 'Totens', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
  ) returning id into v_equip_reserva;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  v_lote := public.patrimonio_preparar_lote(
    array[v_equip_1, v_equip_2],
    '71000000-0000-0000-0000-000000000001'
  );
  v_lote_repetido := public.patrimonio_preparar_lote(
    array[v_equip_1, v_equip_2],
    '71000000-0000-0000-0000-000000000001'
  );
  if v_lote_repetido is distinct from v_lote then
    raise exception 'Preparacao nao foi idempotente.';
  end if;
  if not exists (
    select 1
    from public.patrimonio_lotes
    where id = v_lote and numero = 1
      and codigo = 'PAT-' || to_char(current_date, 'YYYYMM') || '-0001'
      and origem = 'novo'
  ) then raise exception 'Primeiro lote nao recebeu codigo/origem locais esperados.'; end if;
  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_1],
      '71000000-0000-0000-0000-000000000001'
    );
    raise exception 'Chave de preparacao foi aceita com payload diferente.';
  exception when invalid_parameter_value then null;
  end;

  reset role;
  update public.equipamentos set categoria = 'Máquina de Brindes' where id = v_equip_2;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  begin
    perform public.patrimonio_gerar_lote(v_lote, '71000000-0000-0000-0000-000000000002');
    raise exception 'Geracao aceitou lote cuja categoria mudou.';
  exception when check_violation then null;
  end;
  reset role;

  select last_value, is_called into v_last, v_called from public.patrimonio_np_seq;
  if v_last <> 1 or v_called then
    raise exception 'Falha de validacao consumiu numero NP.';
  end if;
  if exists (select 1 from public.equipamentos_patrimonio where lote_id = v_lote)
     or exists (
       select 1 from public.equipamentos
       where id in (v_equip_1, v_equip_2) and nullif(btrim(patrimonio), '') is not null
     ) then raise exception 'Geracao invalida deixou efeito parcial.';
  end if;
  if (select situacao from public.patrimonio_lotes where id = v_lote) <> 'preparado' then
    raise exception 'Geracao invalida alterou o lote.';
  end if;

  update public.equipamentos set categoria = 'Televisões' where id = v_equip_2;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  if public.patrimonio_gerar_lote(v_lote, '71000000-0000-0000-0000-000000000002') is distinct from v_lote then
    raise exception 'Geracao retornou lote incorreto.';
  end if;
  if public.patrimonio_gerar_lote(v_lote, '71000000-0000-0000-0000-000000000002') is distinct from v_lote then
    raise exception 'Geracao repetida nao foi idempotente.';
  end if;

  select public_id into v_pat_1 from public.equipamentos_patrimonio where equipamento_id = v_equip_1 and situacao = 'gerado';
  select public_id into v_pat_2 from public.equipamentos_patrimonio where equipamento_id = v_equip_2 and situacao = 'gerado';
  select codigo into v_codigo from public.equipamentos_patrimonio where public_id = v_pat_1;
  if v_codigo <> 'NP-000001' then raise exception 'Primeiro codigo nao foi NP-000001: %.', v_codigo; end if;
  select codigo into v_codigo from public.equipamentos_patrimonio where public_id = v_pat_2;
  if v_codigo <> 'NP-000002' then raise exception 'Segundo codigo inesperado: %.', v_codigo; end if;
  if (select count(*) from public.equipamentos_patrimonio where lote_id = v_lote) <> 2 then
    raise exception 'Geracao idempotente duplicou registros.';
  end if;
  if (select count(*) from public.patrimonio_eventos where lote_id = v_lote and evento = 'patrimonio_gerado') <> 2 then
    raise exception 'Geracao nao registrou um evento patrimonio_gerado por ativo.';
  end if;
  if not exists (
    select 1 from public.patrimonio_lotes
    where id = v_lote
      and gerado_em is not null
      and gerado_por_user_id = v_admin
      and gerado_por_nome_snapshot = 'Administrador Patrimonio'
      and gerado_por_perfil_snapshot = 'administrador'
  ) then raise exception 'Autoria de geracao do lote nao foi persistida.'; end if;
  if (select patrimonio from public.equipamentos where id = v_equip_1) is distinct from 'NP-000001'
     or (select patrimonio from public.equipamentos where id = v_equip_2) is distinct from 'NP-000002' then
    raise exception 'Espelhos do lote nao foram atualizados integralmente pela RPC.';
  end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.public_id = v_pat_1
      and ep.equipamento_nome_snapshot = 'TERMINAL PATRIMONIO 01'
      and ep.categoria_codigo_snapshot = 'terminais'
      and ep.categoria_nome_snapshot = 'Terminais'
      and ep.localizacao_snapshot = '' and ep.ponto_id_snapshot is null
      and ep.criado_por_user_id = v_admin
      and ep.criado_por_nome_snapshot = 'Administrador Patrimonio'
      and ep.criado_por_perfil_snapshot = 'administrador'
  ) then raise exception 'Snapshot canonico do primeiro patrimonio esta incompleto.'; end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio ep
    where ep.public_id = v_pat_2
      and ep.equipamento_nome_snapshot = 'TV PATRIMONIO 02'
      and ep.categoria_codigo_snapshot = 'televisoes'
      and ep.categoria_nome_snapshot = 'Televisões'
      and ep.localizacao_snapshot = 'PONTO PATRIMONIO VALIDO'
      and ep.ponto_id_snapshot = (
        select id from public.pontos where nome_fantasia = 'PONTO PATRIMONIO VALIDO'
      )
      and ep.criado_por_user_id = v_admin
      and ep.criado_por_nome_snapshot = 'Administrador Patrimonio'
      and ep.criado_por_perfil_snapshot = 'administrador'
  ) then raise exception 'Snapshot canonico do segundo patrimonio esta incompleto.'; end if;

  perform public.patrimonio_emitir_lote(v_lote, '71000000-0000-0000-0000-000000000003');
  perform public.patrimonio_iniciar_lote(v_lote, '71000000-0000-0000-0000-000000000004');
  if not exists (
    select 1 from public.patrimonio_lotes
    where id = v_lote
      and emitido_em is not null and emitido_por_user_id = v_admin
      and emitido_por_nome_snapshot = 'Administrador Patrimonio'
      and emitido_por_perfil_snapshot = 'administrador'
      and iniciado_em is not null and iniciado_por_user_id = v_admin
      and iniciado_por_nome_snapshot = 'Administrador Patrimonio'
      and iniciado_por_perfil_snapshot = 'administrador'
  ) then raise exception 'Autoria de emissao/inicio do lote nao foi persistida.'; end if;
  if not exists (
    select 1 from public.patrimonio_eventos
    where lote_id = v_lote and evento = 'etiquetas_emitidas'
  ) then raise exception 'Evento etiquetas_emitidas ausente.'; end if;

  -- Mesmo conhecendo o GUC, o papel autenticado nao e o proprietario e nao
  -- consegue falsificar o espelho nem as tabelas canonicas.
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  begin
    update public.equipamentos set patrimonio = 'SPOOF-001' where id = v_equip_1;
    raise exception 'Administrador alterou espelho diretamente.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.equipamentos_patrimonio set codigo = 'SPOOF-002' where public_id = v_pat_1;
    raise exception 'Administrador atualizou registro canonico diretamente.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.patrimonio_eventos (
      evento, lote_id, estado_posterior, detalhes, idempotencia, idempotencia_payload,
      autor_user_id, autor_nome_snapshot, autor_perfil_snapshot
    ) values (
      'lote_iniciado', v_lote, 'em_aplicacao', '{}', gen_random_uuid(), '{}',
      v_gerente, 'Autoria Falsa', 'gerente'
    );
    raise exception 'Administrador falsificou evento diretamente.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.patrimonio_registrar_evento(
      'lote_iniciado', v_lote, null, 'emitido', 'em_aplicacao', null, '{}',
      gen_random_uuid(), jsonb_build_object('lote_id', v_lote)
    );
    raise exception 'Administrador executou helper privado.';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  select count(*) into v_count from public.equipamentos_patrimonio where lote_id = v_lote;
  if v_count <> 1 then raise exception 'Gerente nao respeitou o escopo patrimonial: % itens.', v_count; end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio where public_id = v_pat_2
  ) or exists (
    select 1 from public.equipamentos_patrimonio where public_id = v_pat_1
  ) then raise exception 'Gerente nao recebeu apenas o equipamento da rota permitida.'; end if;
  if (select count(*) from public.patrimonio_lotes where id = v_lote) <> 0 then
    raise exception 'Gerente visualizou metadados agregados de lote compartilhado.';
  end if;
  if (select count(*) from public.patrimonio_lote_equipamentos where lote_id = v_lote) <> 1 then
    raise exception 'Gerente visualizou item de lote fora do proprio escopo.';
  end if;
  if exists (
    select 1 from public.patrimonio_eventos where lote_id = v_lote and equipamento_id = v_equip_1
  ) or not exists (
    select 1 from public.patrimonio_eventos where lote_id = v_lote and equipamento_id = v_equip_2
  ) then raise exception 'RLS de eventos do gerente vazou item de outra rota.'; end if;
  if exists (
    select 1 from public.patrimonio_eventos where lote_id = v_lote and equipamento_id is null
  ) then raise exception 'Gerente visualizou evento agregado de lote compartilhado.'; end if;
  begin
    perform public.patrimonio_aplicar_etiqueta(v_pat_1, '71000000-0000-0000-0000-000000000005');
    raise exception 'Gerente aplicou etiqueta.';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_gerente_outro::text, true);
  set local role authenticated;
  select count(*) into v_count from public.equipamentos_patrimonio where lote_id = v_lote;
  if v_count <> 1
     or not exists (select 1 from public.equipamentos_patrimonio where public_id = v_pat_1)
     or exists (select 1 from public.equipamentos_patrimonio where public_id = v_pat_2) then
    raise exception 'Segundo gerente nao ficou isolado no proprio equipamento.';
  end if;
  if exists (select 1 from public.patrimonio_lotes where id = v_lote)
     or exists (
       select 1 from public.patrimonio_eventos
       where lote_id = v_lote and equipamento_id is null
     ) then raise exception 'Segundo gerente recebeu agregado de lote compartilhado.'; end if;
  if (select count(*) from public.patrimonio_lote_equipamentos where lote_id = v_lote) <> 1 then
    raise exception 'Segundo gerente visualizou item fora do proprio escopo.';
  end if;
  begin
    perform public.patrimonio_conferir_etiqueta(v_pat_1, gen_random_uuid());
    raise exception 'Segundo gerente executou RPC de mutacao.';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_operador::text, true);
  set local role authenticated;
  select count(*) into v_count from public.patrimonio_eventos where lote_id = v_lote;
  if v_count < 4 then raise exception 'Operador nao recebeu consulta dos eventos.'; end if;
  begin
    perform public.patrimonio_preparar_lote(array[v_equip_reserva], gen_random_uuid());
    raise exception 'Operador preparou lote.';
  exception when insufficient_privilege then null;
  end;
  perform public.patrimonio_aplicar_etiqueta(v_pat_1, '71000000-0000-0000-0000-000000000006');
  perform public.patrimonio_conferir_etiqueta(v_pat_1, '71000000-0000-0000-0000-000000000007');
  perform public.patrimonio_aplicar_etiqueta(v_pat_2, '71000000-0000-0000-0000-000000000008');
  perform public.patrimonio_conferir_etiqueta(v_pat_2, '71000000-0000-0000-0000-000000000009');
  if not exists (
    select 1 from public.patrimonio_eventos
    where patrimonio_id = (select id from public.equipamentos_patrimonio where public_id = v_pat_1)
      and evento = 'etiqueta_aplicada'
      and autor_user_id = v_operador
      and autor_nome_snapshot = 'Operador Patrimonio'
      and autor_perfil_snapshot = 'operador'
  ) then raise exception 'Autoria backend do operador nao foi persistida.'; end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio
    where public_id = v_pat_1
      and aplicado_em is not null and aplicado_por_user_id = v_operador
      and aplicado_por_nome_snapshot = 'Operador Patrimonio'
      and aplicado_por_perfil_snapshot = 'operador'
      and conferido_em is not null and conferido_por_user_id = v_operador
      and conferido_por_nome_snapshot = 'Operador Patrimonio'
      and conferido_por_perfil_snapshot = 'operador'
  ) then raise exception 'Snapshots de aplicacao/conferencia nao foram persistidos.'; end if;
  if not exists (
    select 1 from public.patrimonio_eventos
    where patrimonio_id = (select id from public.equipamentos_patrimonio where public_id = v_pat_1)
      and evento = 'conferido'
  ) then raise exception 'Evento conferido ausente.'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  perform public.patrimonio_reimprimir_etiqueta(
    v_pat_1, 'Etiqueta danificada no teste local',
    '71000000-0000-0000-0000-000000000010'
  );
  perform public.patrimonio_reimprimir_etiqueta(
    v_pat_1, 'Etiqueta danificada no teste local',
    '71000000-0000-0000-0000-000000000010'
  );
  if (select reimpressoes from public.equipamentos_patrimonio where public_id = v_pat_1) <> 1 then
    raise exception 'Reimpressao idempotente incrementou mais de uma vez.';
  end if;
  if (select count(*) from public.patrimonio_eventos
      where patrimonio_id = (select id from public.equipamentos_patrimonio where public_id = v_pat_1)
        and evento = 'reimpressao') <> 1 then
    raise exception 'Evento de reimpressao idempotente ausente ou duplicado.';
  end if;
  perform public.patrimonio_concluir_lote(v_lote, '71000000-0000-0000-0000-000000000011');
  if not exists (
    select 1 from public.patrimonio_lotes
    where id = v_lote and concluido_em is not null
      and concluido_por_user_id = v_admin
      and concluido_por_nome_snapshot = 'Administrador Patrimonio'
      and concluido_por_perfil_snapshot = 'administrador'
  ) then raise exception 'Autoria de conclusao do lote nao foi persistida.'; end if;
  perform public.patrimonio_baixar(
    v_pat_1, 'Baixa ficticia para testar novo tombamento',
    '71000000-0000-0000-0000-000000000012'
  );
  if nullif(btrim((select patrimonio from public.equipamentos where id = v_equip_1)), '') is not null then
    raise exception 'Baixa nao limpou o espelho.';
  end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio
    where public_id = v_pat_1 and situacao = 'baixado'
      and baixado_em is not null and baixado_por_user_id = v_admin
      and baixado_por_nome_snapshot = 'Administrador Patrimonio'
      and baixado_por_perfil_snapshot = 'administrador'
      and motivo_baixa = 'Baixa ficticia para testar novo tombamento'
  ) then raise exception 'Snapshot/motivo de baixa nao foi persistido.'; end if;
  if not exists (
    select 1 from public.patrimonio_eventos
    where patrimonio_id = (select id from public.equipamentos_patrimonio where public_id = v_pat_1)
      and evento = 'baixado'
  ) then raise exception 'Evento baixado ausente.'; end if;
  reset role;

  -- Simula uma reserva perdida/rollback de outra transacao. A lacuna 3 nao
  -- pode ser preenchida, e a proxima RPC deve produzir 4.
  v_gap := nextval('public.patrimonio_np_seq');
  if v_gap <> 3 then raise exception 'Lacuna local esperada em 3, recebida %.', v_gap; end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  v_lote_novo := public.patrimonio_preparar_lote(
    array[v_equip_1], '71000000-0000-0000-0000-000000000013'
  );
  perform public.patrimonio_gerar_lote(v_lote_novo, '71000000-0000-0000-0000-000000000014');
  select public_id, codigo into v_pat_novo, v_codigo
  from public.equipamentos_patrimonio
  where lote_id = v_lote_novo;
  if v_codigo <> 'NP-000004' then raise exception 'Geracao reutilizou lacuna: %.', v_codigo; end if;
  if exists (select 1 from public.equipamentos_patrimonio where codigo = 'NP-000003') then
    raise exception 'Codigo de lacuna foi criado.';
  end if;
  perform public.patrimonio_cancelar_lote(
    v_lote_novo, 'Cancelamento ficticio do segundo lote',
    '71000000-0000-0000-0000-000000000015'
  );
  if not exists (
    select 1 from public.patrimonio_lotes
    where id = v_lote_novo and situacao = 'cancelado'
      and cancelado_em is not null and cancelado_por_user_id = v_admin
      and cancelado_por_nome_snapshot = 'Administrador Patrimonio'
      and cancelado_por_perfil_snapshot = 'administrador'
      and motivo_cancelamento = 'Cancelamento ficticio do segundo lote'
  ) then raise exception 'Autoria/motivo de cancelamento nao foi persistido.'; end if;
  if (select count(*) from public.patrimonio_eventos
      where lote_id = v_lote_novo and evento = 'anulado'
        and estado_anterior = 'gerado' and estado_posterior = 'anulado') <> 1
     or (select count(*) from public.patrimonio_eventos
         where lote_id = v_lote_novo and evento = 'lote_cancelado') <> 1 then
    raise exception 'Cancelamento nao registrou eventos anulado por ativo e do lote.';
  end if;
  perform public.patrimonio_cancelar_lote(
    v_lote_novo, 'Cancelamento ficticio do segundo lote',
    '71000000-0000-0000-0000-000000000015'
  );

  v_lote_terceiro := public.patrimonio_preparar_lote(
    array[v_equip_1], '71000000-0000-0000-0000-000000000016'
  );
  perform public.patrimonio_gerar_lote(v_lote_terceiro, '71000000-0000-0000-0000-000000000017');
  select public_id, codigo into v_pat_terceiro, v_codigo
  from public.equipamentos_patrimonio where lote_id = v_lote_terceiro;
  if v_codigo <> 'NP-000005' then raise exception 'Codigo anulado foi reutilizado: %.', v_codigo; end if;
  perform public.patrimonio_anular(
    v_pat_terceiro, 'Anulacao ficticia para testar permanencia',
    '71000000-0000-0000-0000-000000000018'
  );
  if not exists (
    select 1 from public.equipamentos_patrimonio
    where public_id = v_pat_terceiro and situacao = 'anulado'
      and anulado_em is not null and anulado_por_user_id = v_admin
      and anulado_por_nome_snapshot = 'Administrador Patrimonio'
      and anulado_por_perfil_snapshot = 'administrador'
      and motivo_anulacao = 'Anulacao ficticia para testar permanencia'
  ) then raise exception 'Snapshot/motivo de anulacao nao foi persistido.'; end if;
  if not exists (
    select 1 from public.patrimonio_eventos
    where patrimonio_id = (select id from public.equipamentos_patrimonio where public_id = v_pat_terceiro)
      and evento = 'anulado'
  ) then raise exception 'Evento anulado ausente.'; end if;

  -- Dois lotes podem ser preparados antes da disputa. A trava do equipamento
  -- e o indice parcial fazem apenas um deles gerar; o perdedor nao consome NP.
  v_lote_concorrente_a := public.patrimonio_preparar_lote(
    array[v_equip_concorrente], '71000000-0000-0000-0000-000000000019'
  );
  v_lote_concorrente_b := public.patrimonio_preparar_lote(
    array[v_equip_concorrente], '71000000-0000-0000-0000-000000000020'
  );
  perform public.patrimonio_gerar_lote(v_lote_concorrente_a, '71000000-0000-0000-0000-000000000021');
  select public_id, codigo into v_pat_concorrente, v_codigo
  from public.equipamentos_patrimonio where lote_id = v_lote_concorrente_a;
  if v_codigo <> 'NP-000006' then raise exception 'Codigo concorrente inesperado: %.', v_codigo; end if;
  begin
    perform public.patrimonio_gerar_lote(v_lote_concorrente_b, '71000000-0000-0000-0000-000000000022');
    raise exception 'Segundo lote gerou patrimonio ativo para o mesmo equipamento.';
  exception when unique_violation then null;
  end;
  reset role;
  select last_value into v_last from public.patrimonio_np_seq;
  if v_last <> 6 then raise exception 'Lote perdedor consumiu numero antes da validacao.'; end if;

  perform set_config('request.jwt.claim.sub', v_gerente::text, true);
  set local role authenticated;
  if (select count(*) from public.patrimonio_lotes
      where id in (v_lote_concorrente_a, v_lote_concorrente_b)) <> 2
     or not exists (
       select 1 from public.patrimonio_eventos
       where lote_id = v_lote_concorrente_a and equipamento_id is null
     ) then
    raise exception 'Gerente nao visualizou agregado cujo lote inteiro esta no proprio escopo.';
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub', v_gerente_outro::text, true);
  set local role authenticated;
  if exists (
    select 1 from public.patrimonio_lotes
    where id in (v_lote_concorrente_a, v_lote_concorrente_b)
  ) then raise exception 'Segundo gerente visualizou lote integralmente alheio.'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_maquina], '71000000-0000-0000-0000-000000000023'
    );
    raise exception 'Maquina de Brindes entrou em lote.';
  exception when check_violation then null;
  end;
  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_desconhecido], '71000000-0000-0000-0000-000000000024'
    );
    raise exception 'Categoria desconhecida entrou em lote.';
  exception when check_violation then null;
  end;
  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_sem_ponto], '71000000-0000-0000-0000-000000000025'
    );
    raise exception 'Localizacao sem ponto entrou em lote.';
  exception when check_violation then null;
  end;
  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_legado], '71000000-0000-0000-0000-000000000026'
    );
    raise exception 'Espelho legado nao importado entrou em lote novo.';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_reserva, v_equip_maquina], '71000000-0000-0000-0000-000000000027'
    );
    raise exception 'Preparacao parcialmente invalida foi aceita.';
  exception when check_violation then null;
  end;
  begin
    perform public.patrimonio_preparar_lote(
      array[v_equip_reserva, v_equip_reserva], '71000000-0000-0000-0000-000000000028'
    );
    raise exception 'Equipamento repetido foi aceito no lote.';
  exception when invalid_parameter_value then null;
  end;

  v_lote_conserto := public.patrimonio_preparar_lote(
    array[v_equip_conserto], '71000000-0000-0000-0000-000000000030'
  );
  if not exists (
    select 1
    from public.patrimonio_lote_equipamentos
    where lote_id = v_lote_conserto
      and equipamento_id = v_equip_conserto
      and localizacao_snapshot = 'Em conserto'
      and ponto_id_snapshot is null
  ) then raise exception 'Equipamento em conserto foi bloqueado como ponto orfao.'; end if;
  perform public.patrimonio_cancelar_lote(
    v_lote_conserto, 'Cancelamento do lote de equipamento em conserto',
    '71000000-0000-0000-0000-000000000031'
  );

  v_lote_deletavel := public.patrimonio_preparar_lote(
    array[v_equip_deletavel], '71000000-0000-0000-0000-000000000032'
  );
  delete from public.equipamentos where id = v_equip_deletavel;
  if not exists (
    select 1
    from public.patrimonio_lote_equipamentos
    where lote_id = v_lote_deletavel
      and equipamento_id is null
      and equipamento_nome_snapshot = 'TOTEM PREPARADO DELETAVEL'
      and categoria_codigo_snapshot = 'totens'
  ) then raise exception 'DELETE preparado nao preservou item/snapshot com FK nula.'; end if;
  if not exists (select 1 from public.patrimonio_lotes where id = v_lote_deletavel) then
    raise exception 'DELETE de equipamento removeu o lote permanente.';
  end if;
  perform public.patrimonio_cancelar_lote(
    v_lote_deletavel, 'Cancelamento apos exclusao do equipamento preparado',
    '71000000-0000-0000-0000-000000000033'
  );
  if (select situacao from public.patrimonio_lotes where id = v_lote_deletavel) <> 'cancelado' then
    raise exception 'Lote com equipamento excluido nao permaneceu cancelavel.';
  end if;

  select count(*) into v_lotes_antes from public.patrimonio_lotes;
  if exists (
    select 1 from public.patrimonio_lote_equipamentos
    where lote_id not in (select id from public.patrimonio_lotes)
  ) then raise exception 'Preparacao invalida deixou itens orfaos.'; end if;

  v_pat_legado := public.patrimonio_importar_legado(
    v_equip_legado, '  LEGACY-LOCAL-001  ',
    '71000000-0000-0000-0000-000000000029'
  );
  if public.patrimonio_importar_legado(
    v_equip_legado, 'LEGACY-LOCAL-001',
    '71000000-0000-0000-0000-000000000029'
  ) is distinct from v_pat_legado then raise exception 'Importacao legada nao foi idempotente.'; end if;
  if not exists (
    select 1 from public.equipamentos_patrimonio
    where public_id = v_pat_legado and origem = 'legado'
      and numero is null and codigo = 'LEGACY-LOCAL-001' and situacao = 'legado'
      and aplicado_em is null and aplicado_por_user_id is null
      and aplicado_por_nome_snapshot is null and aplicado_por_perfil_snapshot is null
      and conferido_em is null and conferido_por_user_id is null
      and conferido_por_nome_snapshot is null and conferido_por_perfil_snapshot is null
  ) then raise exception 'Importacao legada nao preservou numero nulo/codigo.'; end if;
  if not exists (
    select 1 from public.patrimonio_eventos pe
    join public.equipamentos_patrimonio ep on ep.id = pe.patrimonio_id
    where ep.public_id = v_pat_legado and pe.evento = 'legado_importado'
      and pe.estado_anterior is null and pe.estado_posterior = 'legado'
  ) then raise exception 'Evento legado_importado nao registrou estado explicito.'; end if;

  begin
    perform public.patrimonio_importar_legado(
      v_equip_legado_maquina, 'mixed-legacy-77',
      '71000000-0000-0000-0000-000000000034'
    );
    raise exception 'Importacao legada aceitou diferenca de caixa no espelho.';
  exception when invalid_parameter_value then null;
  end;
  v_pat_legado_maquina := public.patrimonio_importar_legado(
    v_equip_legado_maquina, '  MiXeD-Legacy-77  ',
    '71000000-0000-0000-0000-000000000035'
  );
  if not exists (
    select 1 from public.equipamentos_patrimonio
    where public_id = v_pat_legado_maquina
      and codigo = 'MiXeD-Legacy-77'
      and categoria_nome_snapshot = 'Máquina de Brindes'
      and origem = 'legado' and situacao = 'legado'
      and ponto_id_snapshot is null
      and aplicado_em is null and conferido_em is null
  ) then raise exception 'Legado de Maquina de Brindes nao preservou codigo mixed-case/estado.'; end if;

  begin
    perform public.patrimonio_importar_legado(
      v_equip_legado_np, 'NP-123456',
      '71000000-0000-0000-0000-000000000036'
    );
    raise exception 'Importacao legada aceitou padrao NP reservado.';
  exception when invalid_parameter_value then
    if sqlerrm not like 'O padrao NP-000001 e reservado%' then raise; end if;
  end;
  begin
    perform public.patrimonio_importar_legado(
      v_equip_legado_np, 'np-123456',
      '71000000-0000-0000-0000-000000000042'
    );
    raise exception 'Importacao legada aceitou namespace NP em minusculas.';
  exception when invalid_parameter_value then
    if sqlerrm not like 'O padrao NP-000001 e reservado%' then raise; end if;
  end;
  begin
    perform public.patrimonio_importar_legado(
      v_equip_legado_vazio, 'LEGACY-WITHOUT-MIRROR',
      '71000000-0000-0000-0000-000000000037'
    );
    raise exception 'Importacao legada aceitou equipamento sem espelho atual.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.patrimonio_importar_legado(
      v_equip_desconhecido, 'UNKNOWN-LEGACY',
      '71000000-0000-0000-0000-000000000038'
    );
    raise exception 'Importacao legada aceitou categoria desconhecida.';
  exception when check_violation then null;
  end;
  reset role;
  if (select last_value from public.patrimonio_np_seq) <> 6 then
    raise exception 'Importacao legada consumiu a sequencia NP.';
  end if;

  -- Injeta uma falha real depois do segundo nextval(). Linhas canonicas,
  -- espelhos e eventos devem voltar atomicamente; os numeros 7 e 8, por serem
  -- de sequence PostgreSQL, permanecem como lacunas e nunca sao reutilizados.
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TERMINAL FALHA POS NEXTVAL 01', 'Terminais', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
  ) returning id into v_equip_falha_1;
  insert into public.equipamentos (
    nome, categoria, quantidade, status, minimo, observacao, localizacao,
    responsavel, patrimonio, data_cadastro, gerente_responsavel
  ) values (
    'TERMINAL FALHA POS NEXTVAL 02', 'Terminais', 1, 'Disponível', 1, '', '', '', '', current_date::text, ''
  ) returning id into v_equip_falha_2;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  v_lote_falha := public.patrimonio_preparar_lote(
    array[v_equip_falha_1, v_equip_falha_2],
    '71000000-0000-0000-0000-000000000039'
  );
  reset role;

  execute $ddl$
    create function private.patrimonio_teste_falhar_pos_nextval()
    returns trigger
    language plpgsql
    as $body$
    begin
      if new.nome = 'TERMINAL FALHA POS NEXTVAL 02'
         and nullif(btrim(coalesce(new.patrimonio, '')), '') is not null then
        raise exception 'falha patrimonial injetada apos nextval' using errcode = 'P0001';
      end if;
      return new;
    end;
    $body$
  $ddl$;
  execute 'create trigger zz_patrimonio_teste_falha_pos_nextval
    before update of patrimonio on public.equipamentos
    for each row execute function private.patrimonio_teste_falhar_pos_nextval()';

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  begin
    perform public.patrimonio_gerar_lote(
      v_lote_falha, '71000000-0000-0000-0000-000000000040'
    );
    raise exception 'Geracao instrumentada nao falhou.';
  exception when raise_exception then
    if sqlerrm is distinct from 'falha patrimonial injetada apos nextval' then
      raise;
    end if;
  end;
  reset role;

  execute 'drop trigger zz_patrimonio_teste_falha_pos_nextval on public.equipamentos';
  execute 'drop function private.patrimonio_teste_falhar_pos_nextval()';

  if exists (
    select 1 from public.equipamentos_patrimonio where lote_id = v_lote_falha
  ) or exists (
    select 1 from public.equipamentos
    where id in (v_equip_falha_1, v_equip_falha_2)
      and nullif(btrim(coalesce(patrimonio, '')), '') is not null
  ) or exists (
    select 1 from public.patrimonio_eventos
    where lote_id = v_lote_falha and evento in ('patrimonio_gerado', 'lote_gerado')
  ) then
    raise exception 'Falha pos-nextval deixou efeito patrimonial parcial.';
  end if;
  if (select situacao from public.patrimonio_lotes where id = v_lote_falha) <> 'preparado' then
    raise exception 'Falha pos-nextval alterou o estado do lote.';
  end if;
  if (select last_value from public.patrimonio_np_seq) <> 8 then
    raise exception 'Falha pos-nextval nao preservou as duas lacunas esperadas.';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  perform public.patrimonio_gerar_lote(
    v_lote_falha, '71000000-0000-0000-0000-000000000041'
  );
  if (select array_agg(codigo order by numero)
      from public.equipamentos_patrimonio where lote_id = v_lote_falha)
     is distinct from array['NP-000009', 'NP-000010']::text[] then
    raise exception 'Geracao reutilizou numeros consumidos pela falha pos-nextval.';
  end if;
  reset role;

  -- Constraints de unicidade e de um ativo por equipamento sao exercitadas
  -- como proprietario, sob o mesmo contexto interno usado pelas RPCs.
  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  select public_id into v_public_id_duplicado
  from public.equipamentos_patrimonio where public_id = v_pat_2;
  begin
    insert into public.equipamentos_patrimonio (
      public_id, codigo, numero, equipamento_id, lote_id, origem, situacao,
      equipamento_nome_snapshot, categoria_codigo_snapshot, categoria_nome_snapshot,
      localizacao_snapshot, criado_por_user_id, criado_por_nome_snapshot,
      criado_por_perfil_snapshot
    ) values (
      v_public_id_duplicado, 'LEGACY-DUP-PUBLIC', null, v_equip_reserva, null, 'legado', 'legado',
      'TOTEM RESERVA LOCAL', 'totens', 'Totens', '', v_admin, 'Administrador Patrimonio',
      'administrador'
    );
    raise exception 'public_id duplicado foi aceito.';
  exception when unique_violation then null;
  end;

  begin
    insert into public.patrimonio_eventos (
      evento, lote_id, patrimonio_id, equipamento_id,
      estado_anterior, estado_posterior, motivo, detalhes,
      idempotencia, idempotencia_payload,
      autor_user_id, autor_nome_snapshot, autor_perfil_snapshot
    ) values (
      'reimpressao', v_lote_novo,
      (select id from public.equipamentos_patrimonio where public_id = v_pat_2),
      v_equip_2, 'conferido', 'conferido', 'Alvo incoerente ficticio', '{}',
      gen_random_uuid(), '{}', v_admin, 'Administrador Patrimonio', 'administrador'
    );
    raise exception 'Evento aceitou lote diferente do patrimonio canonico.';
  exception when check_violation then null;
  end;
  begin
    insert into public.equipamentos_patrimonio (
      codigo, numero, equipamento_id, lote_id, origem, situacao,
      equipamento_nome_snapshot, categoria_codigo_snapshot, categoria_nome_snapshot,
      localizacao_snapshot, criado_por_user_id, criado_por_nome_snapshot,
      criado_por_perfil_snapshot
    ) values (
      'NP-000002', null, v_equip_reserva, null, 'legado', 'legado',
      'TOTEM RESERVA LOCAL', 'totens', 'Totens', '', v_admin, 'Administrador Patrimonio',
      'administrador'
    );
    raise exception 'codigo duplicado foi aceito.';
  exception when unique_violation then null;
  end;
  begin
    insert into public.equipamentos_patrimonio (
      codigo, numero, equipamento_id, lote_id, origem, situacao,
      equipamento_nome_snapshot, categoria_codigo_snapshot, categoria_nome_snapshot,
      localizacao_snapshot, criado_por_user_id, criado_por_nome_snapshot,
      criado_por_perfil_snapshot
    ) values (
      'LEGACY-ATIVO-DUP', null, v_equip_2, null, 'legado', 'legado',
      'TV PATRIMONIO 02', 'televisoes', 'Televisões', '', v_admin, 'Administrador Patrimonio',
      'administrador'
    );
    raise exception 'Segundo patrimonio ativo foi aceito para o equipamento.';
  exception when unique_violation then null;
  end;

  begin
    delete from public.equipamentos where id = v_equip_1;
    raise exception 'Equipamento referenciado foi excluido.';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.equipamentos_patrimonio where public_id = v_pat_1;
    raise exception 'Registro canonico permanente foi excluido.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.patrimonio_eventos set detalhes = '{"adulterado":true}' where lote_id = v_lote;
    raise exception 'Evento append-only foi atualizado.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.patrimonio_eventos where lote_id = v_lote;
    raise exception 'Evento append-only foi excluido.';
  exception when insufficient_privilege then null;
  end;

  -- Consulta permanece sem leitura patrimonial para nao ampliar a policy vigente
  -- de equipamentos; os grants existem, mas a RLS deliberadamente retorna zero
  -- em todas as tabelas da Fase 1.
  perform set_config('request.jwt.claim.sub', v_consulta::text, true);
  set local role authenticated;
  foreach v_tabela_leitura in array array[
    'equipamento_categorias', 'patrimonio_lotes', 'patrimonio_lote_equipamentos',
    'equipamentos_patrimonio', 'patrimonio_eventos'
  ] loop
    execute format('select count(*) from public.%I', v_tabela_leitura) into v_count;
    if v_count <> 0 then
      raise exception 'Perfil consulta visualizou dados em %.', v_tabela_leitura;
    end if;
  end loop;
  begin
    perform public.patrimonio_aplicar_etiqueta(v_pat_2, gen_random_uuid());
    raise exception 'Perfil consulta executou RPC.';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_sem_perfil::text, true);
  set local role authenticated;
  foreach v_tabela_leitura in array array[
    'equipamento_categorias', 'patrimonio_lotes', 'patrimonio_lote_equipamentos',
    'equipamentos_patrimonio', 'patrimonio_eventos'
  ] loop
    execute format('select count(*) from public.%I', v_tabela_leitura) into v_count;
    if v_count <> 0 then
      raise exception 'Usuario sem perfil visualizou dados em %.', v_tabela_leitura;
    end if;
  end loop;
  reset role;

  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  foreach v_tabela_leitura in array array[
    'equipamento_categorias', 'patrimonio_lotes', 'patrimonio_lote_equipamentos',
    'equipamentos_patrimonio', 'patrimonio_eventos'
  ] loop
    begin
      execute format('select count(*) from public.%I', v_tabela_leitura) into v_count;
      raise exception 'Anonimo consultou %.', v_tabela_leitura;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.patrimonio_preparar_lote(array[v_equip_reserva], gen_random_uuid());
    raise exception 'Anonimo executou RPC.';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

do $$
declare
  v_tabela text;
  v_funcao text;
  v_papel text;
  v_privilegio text;
  v_sequencia text;
  v_owner oid;
begin
  foreach v_tabela in array array[
    'public.equipamento_categorias',
    'public.patrimonio_lotes',
    'public.patrimonio_lote_equipamentos',
    'public.equipamentos_patrimonio',
    'public.patrimonio_eventos'
  ] loop
    foreach v_papel in array array['authenticated', 'anon', 'service_role'] loop
      if has_table_privilege(v_papel, v_tabela, 'INSERT')
         or has_table_privilege(v_papel, v_tabela, 'UPDATE')
         or has_table_privilege(v_papel, v_tabela, 'DELETE') then
        raise exception 'Escrita direta concedida em % para %.', v_tabela, v_papel;
      end if;
    end loop;
  end loop;

  foreach v_sequencia in array array[
    'public.patrimonio_np_seq',
    'public.patrimonio_lote_seq',
    'public.equipamentos_patrimonio_id_seq',
    'public.patrimonio_eventos_id_seq'
  ] loop
    foreach v_papel in array array['authenticated', 'anon', 'service_role'] loop
      foreach v_privilegio in array array['USAGE', 'SELECT', 'UPDATE'] loop
        if has_sequence_privilege(v_papel, v_sequencia, v_privilegio) then
          raise exception 'Sequencia % expoe % para %.', v_sequencia, v_privilegio, v_papel;
        end if;
      end loop;
    end loop;
  end loop;
  if has_column_privilege('authenticated', 'public.patrimonio_eventos', 'idempotencia', 'SELECT')
     or has_column_privilege('authenticated', 'public.patrimonio_eventos', 'idempotencia_payload', 'SELECT') then
    raise exception 'Metadados internos de idempotencia foram expostos.';
  end if;

  foreach v_funcao in array array[
    'public.patrimonio_preparar_lote(bigint[],uuid)',
    'public.patrimonio_gerar_lote(uuid,uuid)',
    'public.patrimonio_importar_legado(bigint,text,uuid)',
    'public.patrimonio_emitir_lote(uuid,uuid)',
    'public.patrimonio_iniciar_lote(uuid,uuid)',
    'public.patrimonio_aplicar_etiqueta(uuid,uuid)',
    'public.patrimonio_conferir_etiqueta(uuid,uuid)',
    'public.patrimonio_reimprimir_etiqueta(uuid,text,uuid)',
    'public.patrimonio_baixar(uuid,text,uuid)',
    'public.patrimonio_anular(uuid,text,uuid)',
    'public.patrimonio_concluir_lote(uuid,uuid)',
    'public.patrimonio_cancelar_lote(uuid,text,uuid)'
  ] loop
    if has_function_privilege('anon', v_funcao, 'EXECUTE') then
      raise exception 'RPC % exposta a anon.', v_funcao;
    end if;
    if not has_function_privilege('authenticated', v_funcao, 'EXECUTE') then
      raise exception 'RPC % indisponivel ao papel autenticado.', v_funcao;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'private.patrimonio_registrar_evento(text,uuid,bigint,text,text,text,jsonb,uuid,jsonb)',
    'EXECUTE'
  ) then raise exception 'Helper privado de eventos esta exposto.'; end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.equipamentos_patrimonio'::regclass
      and c.conname = 'equipamentos_patrimonio_codigo_key' and c.contype = 'u'
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.equipamentos_patrimonio'::regclass
      and c.conname = 'equipamentos_patrimonio_public_id_key' and c.contype = 'u'
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.equipamentos_patrimonio'::regclass
      and c.conname = 'equipamentos_patrimonio_numero_key' and c.contype = 'u'
  ) then raise exception 'Unicidade de codigo/public_id/numero incompleta.'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'equipamentos_patrimonio_equipamento_ativo_uidx'
      and indexdef ilike '%where%situacao%'
  ) then raise exception 'Indice de um patrimonio ativo por equipamento ausente.'; end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.patrimonio_lotes'::regclass
      and c.conname = 'patrimonio_lotes_codigo_key' and c.contype = 'u'
  ) then raise exception 'Unicidade do codigo de lote ausente.'; end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.equipamentos_patrimonio'::regclass
      and c.confrelid = 'public.equipamentos'::regclass
      and c.contype = 'f' and c.confdeltype = 'r'
  ) then raise exception 'FK canonica equipamento-patrimonio nao usa ON DELETE RESTRICT.'; end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.patrimonio_lote_equipamentos'::regclass
      and c.confrelid = 'public.equipamentos'::regclass
      and c.contype = 'f' and c.confdeltype = 'n'
  ) then raise exception 'FK de item preparado nao usa ON DELETE SET NULL.'; end if;

  select c.relowner into v_owner
  from pg_class c
  where c.oid = any(array[
    'public.equipamentos'::regclass,
    'public.patrimonio_lotes'::regclass,
    'public.patrimonio_lote_equipamentos'::regclass,
    'public.equipamentos_patrimonio'::regclass,
    'public.patrimonio_eventos'::regclass
  ])
  limit 1;
  if (select count(distinct c.relowner)
      from pg_class c
      where c.oid = any(array[
        'public.equipamentos'::regclass,
        'public.patrimonio_lotes'::regclass,
        'public.patrimonio_lote_equipamentos'::regclass,
        'public.equipamentos_patrimonio'::regclass,
        'public.patrimonio_eventos'::regclass
      ])) <> 1
     or exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef
         and n.nspname in ('public', 'private')
         and p.proname like 'patrimonio_%'
         and p.proowner <> v_owner
     ) then
    raise exception 'Owner invariant quebrada entre tabelas e funcoes SECURITY DEFINER.';
  end if;
end;
$$;

rollback;
