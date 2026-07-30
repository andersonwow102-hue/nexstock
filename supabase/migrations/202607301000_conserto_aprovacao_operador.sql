-- Todo ingresso em conserto exige aprovação do operador.
-- Gerentes podem apenas comunicar defeitos em equipamentos sob sua responsabilidade.

create or replace function private.validar_ingresso_conserto_operador()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.status = 'Em conserto'
     and (tg_op = 'INSERT' or old.status is distinct from 'Em conserto')
     and private.perfil_atual() is distinct from 'operador' then
    raise exception 'Somente o operador pode aprovar e encaminhar equipamentos para conserto.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists equipamentos_conserto_somente_operador on public.equipamentos;
create trigger equipamentos_conserto_somente_operador
before insert or update of status on public.equipamentos
for each row execute function private.validar_ingresso_conserto_operador();

create or replace function private.validar_comunicado_conserto_gerente()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if private.perfil_atual() = 'gerente'
     and not exists (
       select 1
       from public.equipamentos e
       where e.id = new.equipamento_id
         and lower(coalesce(e.gerente_responsavel, '')) = lower(coalesce(private.gerente_atual(), ''))
     ) then
    raise exception 'O gerente só pode comunicar defeito em equipamento sob sua responsabilidade.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists consertos_comunicado_gerente_escopo on public.consertos_equipamentos;
create trigger consertos_comunicado_gerente_escopo
before insert or update on public.consertos_equipamentos
for each row execute function private.validar_comunicado_conserto_gerente();
