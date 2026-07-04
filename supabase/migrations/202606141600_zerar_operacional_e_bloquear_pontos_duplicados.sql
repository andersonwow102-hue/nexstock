begin;

do $$
declare
  tabelas text;
begin
  select string_agg(format('public.%I', table_name), ', ')
    into tabelas
  from information_schema.tables
  where table_schema = 'public'
    and table_name = any(array[
      'historico_equipamentos',
      'historico_pontos',
      'despesas_mensais',
      'fechamentos_rotas',
      'pix_envios',
      'mensagens_internas',
      'equipamentos',
      'pontos'
    ]);

  if tabelas is not null then
    execute 'truncate table ' || tabelas || ' restart identity cascade';
  end if;
end $$;

drop index if exists public.pontos_nome_fantasia_unico_normalizado;

create unique index pontos_nome_fantasia_unico_normalizado
  on public.pontos (lower(btrim(nome_fantasia)));

commit;
