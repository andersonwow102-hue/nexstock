-- Executar somente em uma instancia Supabase local descartavel, depois das
-- migrations. O teste inteiro termina em rollback e nao toca dados remotos.

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('21000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equip-admin@example.invalid', '', now(), now(), now()),
  ('21000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equip-operador@example.invalid', '', now(), now(), now()),
  ('21000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equip-gerente@example.invalid', '', now(), now(), now()),
  ('21000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equip-outro@example.invalid', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.perfis (user_id, nome, perfil, gerente_nome)
values
  ('21000000-0000-0000-0000-000000000001', 'Anderson Costa', 'administrador', ''),
  ('21000000-0000-0000-0000-000000000002', 'Operador Local', 'operador', ''),
  ('21000000-0000-0000-0000-000000000003', 'Alex Gestor', 'gerente', 'Alex'),
  ('21000000-0000-0000-0000-000000000004', 'Outro Usuario', 'administrador', '')
on conflict (user_id) do update set
  nome = excluded.nome,
  perfil = excluded.perfil,
  gerente_nome = excluded.gerente_nome;

insert into public.equipamentos (
  nome, categoria, quantidade, status, minimo, observacao, localizacao,
  responsavel, patrimonio, data_cadastro, gerente_responsavel
)
values (
  'EQUIPAMENTO TESTE AUTORIA', 'Terminais', 1, 'Disponível', 1, '', '',
  'Alex', 'AUTORIA-LOCAL-001', current_date::text, 'Alex'
)
returning id \gset equip_

select set_config('app.equipamento_autoria_id', :'equip_id', true);

-- Administrador: tentativa explicita de falsificacao deve ser sobrescrita.
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
insert into public.historico_equipamentos (
  tipo, item_id, item_nome, categoria, qtd_antes, qtd_depois,
  responsavel, observacao, data,
  executado_por_user_id, executado_por_nome_snapshot, executado_por_perfil_snapshot
)
values (
  'cadastro', :equip_id, 'EQUIPAMENTO TESTE AUTORIA', 'Terminais', 0, 1,
  'Alex', 'Equipamento cadastrado', now()::text,
  '21000000-0000-0000-0000-000000000004', 'Nome Falsificado', 'gerente'
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.historico_equipamentos
    where item_id = current_setting('app.equipamento_autoria_id')::bigint and tipo = 'cadastro'
      and executado_por_user_id = '21000000-0000-0000-0000-000000000001'
      and executado_por_nome_snapshot = 'Anderson Costa'
      and executado_por_perfil_snapshot = 'administrador'
  ) then
    raise exception 'Administrador nao recebeu autoria propria ou falsificacao nao foi bloqueada.';
  end if;
end;
$$;

-- A alteracao posterior do perfil nao reescreve o snapshot ja persistido.
update public.perfis
set nome = 'Administrador Renomeado'
where user_id = '21000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.historico_equipamentos
    where item_id = current_setting('app.equipamento_autoria_id')::bigint and tipo = 'cadastro'
      and executado_por_nome_snapshot = 'Anderson Costa'
  ) then
    raise exception 'Alteracao do perfil reescreveu o snapshot historico.';
  end if;
end;
$$;

-- Operador: snapshot proprio.
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
set local role authenticated;
insert into public.historico_equipamentos (
  tipo, item_id, item_nome, categoria, qtd_antes, qtd_depois, responsavel, observacao, data
)
values ('edicao', :equip_id, 'EQUIPAMENTO TESTE AUTORIA', 'Terminais', 1, 1, 'Alex', 'Dados atualizados', now()::text);
reset role;

do $$
begin
  if not exists (
    select 1 from public.historico_equipamentos
    where item_id = current_setting('app.equipamento_autoria_id')::bigint and tipo = 'edicao'
      and executado_por_user_id = '21000000-0000-0000-0000-000000000002'
      and executado_por_nome_snapshot = 'Operador Local'
      and executado_por_perfil_snapshot = 'operador'
  ) then
    raise exception 'Operador nao recebeu snapshot correto.';
  end if;
end;
$$;

-- Gerente: evento permitido no equipamento pertencente ao proprio escopo.
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000003', true);
set local role authenticated;
insert into public.historico_equipamentos (
  tipo, item_id, item_nome, categoria, qtd_antes, qtd_depois, responsavel, observacao, data
)
values ('recebimento_gerente', :equip_id, 'EQUIPAMENTO TESTE AUTORIA', 'Terminais', 1, 1, 'Alex', 'Equipamento recebido por Alex', now()::text);

do $$
begin
  begin
    insert into public.historico_equipamentos (
      tipo, item_id, item_nome, categoria, qtd_antes, qtd_depois, responsavel, observacao, data
    ) values ('exclusao', current_setting('app.equipamento_autoria_id')::bigint, 'EQUIPAMENTO TESTE AUTORIA', 'Terminais', 1, 0, 'Alex', 'Tentativa fora do escopo', now()::text);
    raise exception 'Gerente conseguiu gravar tipo proibido.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- A autoria nova nao interfere no identificador proprio da RPC de conserto.
select public.comunicar_conserto_gerente(
  :equip_id,
  'Falha ficticia para teste local',
  now()
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.historico_equipamentos
    where item_id = current_setting('app.equipamento_autoria_id')::bigint and tipo = 'recebimento_gerente'
      and executado_por_user_id = '21000000-0000-0000-0000-000000000003'
      and executado_por_nome_snapshot = 'Alex Gestor'
      and executado_por_perfil_snapshot = 'gerente'
  ) then
    raise exception 'Gerente autorizado nao recebeu autoria propria.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.consertos_equipamentos
    where equipamento_id = current_setting('app.equipamento_autoria_id')::bigint
      and conserto_solicitado_por = '21000000-0000-0000-0000-000000000003'
      and conserto_defeito = 'Falha ficticia para teste local'
  ) then
    raise exception 'RPC comunicar_conserto_gerente perdeu o executor proprio.';
  end if;
end;
$$;

-- A exclusao posterior da conta remove somente o ID; snapshots permanecem.
delete from auth.users where id = '21000000-0000-0000-0000-000000000002';

do $$
begin
  if not exists (
    select 1 from public.historico_equipamentos
    where item_id = current_setting('app.equipamento_autoria_id')::bigint and tipo = 'edicao'
      and executado_por_user_id is null
      and executado_por_nome_snapshot = 'Operador Local'
      and executado_por_perfil_snapshot = 'operador'
  ) then
    raise exception 'Exclusao da conta apagou o snapshot historico.';
  end if;
end;
$$;

-- Linha legada sem identidade continua valida e nao recebe autoria inventada.
select set_config('request.jwt.claim.sub', '', true);
insert into public.historico_equipamentos (
  tipo, item_id, item_nome, categoria, qtd_antes, qtd_depois, responsavel, observacao, data
)
values ('envio_gerente', :equip_id, 'EQUIPAMENTO TESTE AUTORIA', 'Terminais', 1, 1, 'Alex', 'Enviado para gerente: Alex', now()::text);

do $$
begin
  if not exists (
    select 1 from public.historico_equipamentos
    where item_id = current_setting('app.equipamento_autoria_id')::bigint and tipo = 'envio_gerente'
      and executado_por_user_id is null
      and executado_por_nome_snapshot is null
      and executado_por_perfil_snapshot is null
  ) then
    raise exception 'Registro legado recebeu autoria inventada.';
  end if;
end;
$$;

rollback;
