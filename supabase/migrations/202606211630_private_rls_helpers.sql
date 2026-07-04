begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.perfil_atual() set schema private;
alter function public.gerente_atual() set schema private;

revoke all on function private.perfil_atual() from public, anon;
revoke all on function private.gerente_atual() from public, anon;
grant execute on function private.perfil_atual() to authenticated, service_role;
grant execute on function private.gerente_atual() to authenticated, service_role;

commit;
