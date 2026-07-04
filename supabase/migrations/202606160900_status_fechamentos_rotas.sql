alter table public.fechamentos_rotas
  add column if not exists enviado_em timestamptz,
  add column if not exists finalizado_em timestamptz,
  add column if not exists finalizado_por uuid references auth.users(id);

update public.fechamentos_rotas
set enviado_em = coalesce(enviado_em, atualizado_em, now())
where enviado_em is null;

drop policy if exists fechamentos_rotas_gerente_select on public.fechamentos_rotas;
create policy fechamentos_rotas_gerente_select
on public.fechamentos_rotas for select
to authenticated
using (
  public.perfil_atual() = 'administrador'
  or exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and p.perfil = 'gerente'
      and (
        lower(coalesce(p.gerente_nome, '')) = lower(fechamentos_rotas.gerente)
        or lower(coalesce(p.nome, '')) = lower(fechamentos_rotas.gerente)
        or lower(coalesce(p.login_nome, '')) = lower(fechamentos_rotas.gerente)
      )
  )
);
