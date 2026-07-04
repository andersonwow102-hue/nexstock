-- Mantem o nome fantasia dos pontos em caixa alta e atualiza referencias locais.

do $$
declare
  registro record;
  nome_padrao text;
begin
  for registro in
    select id, nome_fantasia
    from public.pontos
    where nome_fantasia is not null
  loop
    nome_padrao := upper(regexp_replace(btrim(registro.nome_fantasia), '\s+', ' ', 'g'));

    if nome_padrao <> registro.nome_fantasia then
      update public.equipamentos
      set localizacao = nome_padrao
      where localizacao = registro.nome_fantasia;

      update public.historico_pontos
      set nome = nome_padrao
      where nome = registro.nome_fantasia;

      update public.solicitacoes_modalidade
      set ponto_nome = nome_padrao
      where ponto_id = registro.id;

      update public.pontos
      set nome_fantasia = nome_padrao
      where id = registro.id;
    end if;
  end loop;
end $$;

create or replace function public.pontos_nome_fantasia_uppercase()
returns trigger
language plpgsql
as $$
begin
  new.nome_fantasia := upper(regexp_replace(btrim(coalesce(new.nome_fantasia, '')), '\s+', ' ', 'g'));
  return new;
end;
$$;

drop trigger if exists pontos_nome_fantasia_uppercase on public.pontos;
create trigger pontos_nome_fantasia_uppercase
before insert or update of nome_fantasia on public.pontos
for each row
execute function public.pontos_nome_fantasia_uppercase();
