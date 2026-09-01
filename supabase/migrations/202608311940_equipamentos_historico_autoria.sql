begin;

alter table public.historico_equipamentos
  add column if not exists executado_por_user_id uuid,
  add column if not exists executado_por_nome_snapshot text,
  add column if not exists executado_por_perfil_snapshot text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'historico_equipamentos_executor_fkey'
      and conrelid = 'public.historico_equipamentos'::regclass
  ) then
    alter table public.historico_equipamentos
      add constraint historico_equipamentos_executor_fkey
      foreign key (executado_por_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists historico_equipamentos_executor_idx
  on public.historico_equipamentos (executado_por_user_id)
  where executado_por_user_id is not null;

comment on column public.historico_equipamentos.executado_por_user_id is
  'Identificador autenticado que executou o evento. Preenchido pelo backend.';
comment on column public.historico_equipamentos.executado_por_nome_snapshot is
  'Nome exibivel do executor no momento do evento. Nao e reescrito.';
comment on column public.historico_equipamentos.executado_por_perfil_snapshot is
  'Perfil do executor no momento do evento. Nao e reescrito.';

create or replace function private.historico_equipamentos_definir_autoria()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_nome text;
  v_perfil text;
begin
  -- O backend e a unica fonte de verdade. Qualquer autoria enviada pelo
  -- cliente e descartada antes da avaliacao das policies de INSERT.
  new.executado_por_user_id := null;
  new.executado_por_nome_snapshot := null;
  new.executado_por_perfil_snapshot := null;

  if v_user_id is null then
    return new;
  end if;

  select
    coalesce(
      nullif(btrim(p.nome), ''),
      nullif(btrim(p.login_nome), ''),
      nullif(btrim(p.gerente_nome), ''),
      p.perfil
    ),
    p.perfil
  into v_nome, v_perfil
  from public.perfis p
  where p.user_id = v_user_id
  limit 1;

  if v_nome is null or v_perfil is null then
    return new;
  end if;

  new.executado_por_user_id := v_user_id;
  new.executado_por_nome_snapshot := v_nome;
  new.executado_por_perfil_snapshot := v_perfil;
  return new;
end;
$$;

revoke all on function private.historico_equipamentos_definir_autoria() from public, anon, authenticated;

drop trigger if exists historico_equipamentos_definir_autoria
  on public.historico_equipamentos;
create trigger historico_equipamentos_definir_autoria
before insert on public.historico_equipamentos
for each row execute function private.historico_equipamentos_definir_autoria();

-- Mantem os mesmos perfis e o mesmo escopo operacional. A verificacao de
-- autoria ocorre depois do trigger BEFORE INSERT, impedindo falsificacao.
drop policy if exists historico_equip_escrever on public.historico_equipamentos;
create policy historico_equip_escrever
on public.historico_equipamentos
for insert
to authenticated
with check (
  private.perfil_atual() in ('administrador', 'operador')
  and executado_por_user_id = auth.uid()
);

drop policy if exists historico_equip_gerente_criar on public.historico_equipamentos;
create policy historico_equip_gerente_criar
on public.historico_equipamentos
for insert
to authenticated
with check (
  private.perfil_atual() = 'gerente'
  and tipo in (
    'cadastro', 'edicao', 'entrada', 'saida', 'conserto', 'retorno',
    'defeito', 'disponivel', 'baixa', 'ponto', 'envio_gerente',
    'recebimento_gerente'
  )
  and item_id in (select id from public.equipamentos)
  and executado_por_user_id = auth.uid()
);

commit;
