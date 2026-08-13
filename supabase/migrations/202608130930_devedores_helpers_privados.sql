begin;

create or replace function private.devedores_identidade_atual()
returns table (
  user_id uuid,
  perfil text,
  gerente_nome text,
  usuario_nome text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    p.user_id,
    p.perfil,
    coalesce(nullif(btrim(p.gerente_nome), ''), nullif(btrim(p.nome), ''), nullif(btrim(p.login_nome), ''), 'Gerente'),
    coalesce(nullif(btrim(p.nome), ''), nullif(btrim(p.login_nome), ''), nullif(btrim(p.gerente_nome), ''), p.perfil)
  from public.perfis p
  where p.user_id = auth.uid()
  limit 1;
$$;

revoke all on function private.devedores_identidade_atual() from public, anon;
grant execute on function private.devedores_identidade_atual() to authenticated, service_role;

commit;
