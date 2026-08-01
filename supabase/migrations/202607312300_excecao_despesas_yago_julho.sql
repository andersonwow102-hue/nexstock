begin;

drop policy if exists despesas_yago_julho_criar on public.despesas_mensais;
create policy despesas_yago_julho_criar
on public.despesas_mensais
for insert
to authenticated
with check (
  private.perfil_atual() = 'gerente'
  and lower(private.gerente_atual()) = 'yago'
  and competencia = date '2026-07-01'
  and now() < timestamptz '2026-08-02 01:55:09+00'
  and (
    exists (
      select 1
      from public.pontos pt
      join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
    or (
      ponto_id is null
      and lower(public.despesas_mensais.gerente) = 'yago'
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
);

drop policy if exists despesas_yago_julho_alterar on public.despesas_mensais;
create policy despesas_yago_julho_alterar
on public.despesas_mensais
for update
to authenticated
using (
  private.perfil_atual() = 'gerente'
  and lower(private.gerente_atual()) = 'yago'
  and competencia = date '2026-07-01'
  and now() < timestamptz '2026-08-02 01:55:09+00'
  and (
    exists (
      select 1
      from public.pontos pt
      join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
    or (
      ponto_id is null
      and lower(public.despesas_mensais.gerente) = 'yago'
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
)
with check (
  private.perfil_atual() = 'gerente'
  and lower(private.gerente_atual()) = 'yago'
  and competencia = date '2026-07-01'
  and now() < timestamptz '2026-08-02 01:55:09+00'
  and (
    exists (
      select 1
      from public.pontos pt
      join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
    or (
      ponto_id is null
      and lower(public.despesas_mensais.gerente) = 'yago'
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
);

drop policy if exists despesas_yago_julho_remover on public.despesas_mensais;
create policy despesas_yago_julho_remover
on public.despesas_mensais
for delete
to authenticated
using (
  private.perfil_atual() = 'gerente'
  and lower(private.gerente_atual()) = 'yago'
  and competencia = date '2026-07-01'
  and now() < timestamptz '2026-08-02 01:55:09+00'
  and (
    exists (
      select 1
      from public.pontos pt
      join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
    or (
      ponto_id is null
      and lower(public.despesas_mensais.gerente) = 'yago'
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
);

commit;
