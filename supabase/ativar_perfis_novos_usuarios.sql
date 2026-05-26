-- Execute uma vez no SQL Editor apos setup_profissional.sql.
-- Novos usuarios entram como consulta ate um administrador alterar o perfil.

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (user_id, nome, perfil)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'consulta')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists criar_perfil_ao_cadastrar_usuario on auth.users;
create trigger criar_perfil_ao_cadastrar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();
