drop policy if exists fechamentos_rotas_gerente_select on public.fechamentos_rotas;

create policy fechamentos_rotas_gerente_select
on public.fechamentos_rotas for select
to authenticated
using (
  private.perfil_atual() = 'administrador'
  or (
    fechamentos_rotas.enviado_em is not null
    and exists (
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
  )
);
