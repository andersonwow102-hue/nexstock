begin;

update public.equipamentos e
set
  status = 'Disponível',
  localizacao = '',
  gerente_responsavel = '',
  transferencia_status = '',
  transferencia_enviada_em = null,
  transferencia_recebida_em = null
where coalesce(trim(e.localizacao), '') <> ''
  and not exists (
    select 1
    from public.pontos p
    where lower(trim(p.nome_fantasia)) = lower(trim(e.localizacao))
  );

create or replace function public.impedir_exclusao_ponto_com_equipamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.equipamentos e
    where coalesce(trim(e.localizacao), '') <> ''
      and lower(trim(e.localizacao)) = lower(trim(old.nome_fantasia))
  ) then
    raise exception 'Ponto possui equipamentos vinculados. Remaneje ou disponibilize os equipamentos antes de excluir.';
  end if;

  return old;
end;
$$;

drop trigger if exists impedir_exclusao_ponto_com_equipamentos on public.pontos;
create trigger impedir_exclusao_ponto_com_equipamentos
before delete on public.pontos
for each row
execute function public.impedir_exclusao_ponto_com_equipamentos();

commit;
