begin;

create policy devedores_modalidades_ler
on public.devedores_modalidades for select to authenticated
using (private.perfil_atual() in ('gerente', 'operador', 'administrador', 'consulta'));

create policy devedores_relatorios_ler
on public.devedores_relatorios for select to authenticated
using (
  private.perfil_atual() in ('operador', 'administrador', 'consulta')
  or (private.perfil_atual() = 'gerente' and gerente_responsavel_id = auth.uid())
);

create policy devedores_dividas_ler
on public.devedores_dividas for select to authenticated
using (
  private.perfil_atual() in ('operador', 'administrador', 'consulta')
  or (private.perfil_atual() = 'gerente' and gerente_responsavel_id = auth.uid())
);

create policy devedores_historico_ler
on public.devedores_historico for select to authenticated
using (
  private.perfil_atual() in ('operador', 'administrador', 'consulta')
  or (
    private.perfil_atual() = 'gerente'
    and exists (
      select 1
      from public.devedores_dividas d
      where d.id = public.devedores_historico.divida_id
        and d.gerente_responsavel_id = auth.uid()
    )
  )
);

commit;
