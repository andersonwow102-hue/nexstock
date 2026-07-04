begin;

create or replace function public.normalize_text(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
  acr text;
  acronyms text[] := array['PIX','CPF','CNPJ','FIFA','API','PDF','APK','TV','PDV','HQ','USB','GPS','URL'];
begin
  if p_text is null then
    return null;
  end if;

  v := replace(p_text, chr(160), ' ');
  v := replace(v, '“', '"');
  v := replace(v, '”', '"');
  v := replace(v, '„', '"');
  v := replace(v, '‘', '''');
  v := replace(v, '’', '''');
  v := replace(v, '‚', '''');
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  v := regexp_replace(v, '[[:space:]]+([,.;:!?])', '\1', 'g');

  if v ~* '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})' then
    return btrim(v);
  end if;

  v := regexp_replace(v, '([,;:])([^[:space:]])', '\1 \2', 'g');
  v := regexp_replace(v, '([.!?])([[:alpha:]])', '\1 \2', 'g');
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  v := btrim(v);

  if v = '' then
    return v;
  end if;

  if v = upper(v) and v ~ '[[:alpha:]]' and array_length(regexp_split_to_array(v, '[[:space:]]+'), 1) > 1 then
    foreach acr in array acronyms loop
      v := replace(v, acr, '§' || array_position(acronyms, acr)::text || '§');
    end loop;
    v := lower(v);
    foreach acr in array acronyms loop
      v := replace(v, '§' || array_position(acronyms, acr)::text || '§', acr);
    end loop;
  end if;

  v := regexp_replace(v, '\mvc\M', 'você', 'gi');
  v := regexp_replace(v, '\mvoce\M', 'você', 'gi');
  v := regexp_replace(v, '\mpra\M', 'para', 'gi');
  v := regexp_replace(v, '\mtambem\M', 'também', 'gi');
  v := regexp_replace(v, '\mnao\M', 'não', 'gi');

  return upper(substr(v, 1, 1)) || substr(v, 2);
end;
$$;

create or replace function public.normalize_text_fields_trigger()
returns trigger
language plpgsql
as $$
begin
  if TG_TABLE_NAME = 'equipamentos' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'consertos_equipamentos' then
    new.conserto_defeito := public.normalize_text(new.conserto_defeito);
  elsif TG_TABLE_NAME = 'pontos' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'gerente_modalidade_acessos' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'ponto_modalidade_acessos' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'historico_equipamentos' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'historico_pontos' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'despesas_mensais' then
    new.descricao := public.normalize_text(new.descricao);
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'solicitacoes_modalidade' then
    new.detalhe := public.normalize_text(new.detalhe);
  elsif TG_TABLE_NAME = 'mensagens_internas' then
    new.mensagem := public.normalize_text(new.mensagem);
  elsif TG_TABLE_NAME = 'pix_chaves' then
    new.observacao := public.normalize_text(new.observacao);
  elsif TG_TABLE_NAME = 'pix_envios' then
    new.mensagem := public.normalize_text(new.mensagem);
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_text_equipamentos on public.equipamentos;
create trigger normalize_text_equipamentos
before insert or update on public.equipamentos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_consertos_equipamentos on public.consertos_equipamentos;
create trigger normalize_text_consertos_equipamentos
before insert or update on public.consertos_equipamentos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_pontos on public.pontos;
create trigger normalize_text_pontos
before insert or update on public.pontos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_gerente_modalidade_acessos on public.gerente_modalidade_acessos;
create trigger normalize_text_gerente_modalidade_acessos
before insert or update on public.gerente_modalidade_acessos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_ponto_modalidade_acessos on public.ponto_modalidade_acessos;
create trigger normalize_text_ponto_modalidade_acessos
before insert or update on public.ponto_modalidade_acessos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_historico_equipamentos on public.historico_equipamentos;
create trigger normalize_text_historico_equipamentos
before insert or update on public.historico_equipamentos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_historico_pontos on public.historico_pontos;
create trigger normalize_text_historico_pontos
before insert or update on public.historico_pontos
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_despesas_mensais on public.despesas_mensais;
create trigger normalize_text_despesas_mensais
before insert or update on public.despesas_mensais
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_solicitacoes_modalidade on public.solicitacoes_modalidade;
create trigger normalize_text_solicitacoes_modalidade
before insert or update on public.solicitacoes_modalidade
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_mensagens_internas on public.mensagens_internas;
create trigger normalize_text_mensagens_internas
before insert or update on public.mensagens_internas
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_pix_chaves on public.pix_chaves;
create trigger normalize_text_pix_chaves
before insert or update on public.pix_chaves
for each row execute function public.normalize_text_fields_trigger();

drop trigger if exists normalize_text_pix_envios on public.pix_envios;
create trigger normalize_text_pix_envios
before insert or update on public.pix_envios
for each row execute function public.normalize_text_fields_trigger();

commit;
