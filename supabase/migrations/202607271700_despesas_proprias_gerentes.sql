begin;

alter table public.despesas_mensais
  alter column ponto_id drop not null,
  add column if not exists gerente text,
  add column if not exists rota text;

alter table public.despesas_mensais
  drop constraint if exists despesas_mensais_origem_check;

alter table public.despesas_mensais
  add constraint despesas_mensais_origem_check check (
    (ponto_id is not null and gerente is null and rota is null)
    or
    (ponto_id is null and nullif(btrim(gerente), '') is not null and nullif(btrim(rota), '') is not null)
  );

create unique index if not exists despesas_mensais_gerente_competencia_descricao_uidx
  on public.despesas_mensais (lower(gerente), lower(rota), competencia, lower(descricao))
  where ponto_id is null;

drop policy if exists despesas_ler on public.despesas_mensais;
create policy despesas_ler
on public.despesas_mensais
for select
to authenticated
using (
  public.perfil_atual() = 'administrador'
  or exists (
    select 1
    from public.pontos pt
    join public.perfis p on p.user_id = auth.uid()
    where pt.id = public.despesas_mensais.ponto_id
      and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
  )
  or (
    ponto_id is null
    and public.perfil_atual() = 'gerente'
    and exists (
      select 1
      from public.perfis p
      where p.user_id = auth.uid()
        and lower(coalesce(p.gerente_nome, p.nome, '')) = lower(public.despesas_mensais.gerente)
        and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
  )
);

drop policy if exists despesas_gerente_criar on public.despesas_mensais;
create policy despesas_gerente_criar
on public.despesas_mensais
for insert
to authenticated
with check (
  public.perfil_atual() = 'gerente'
  and competencia = date_trunc('month', current_date)::date
  and extract(day from current_date) >= 10
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
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and lower(coalesce(p.gerente_nome, p.nome, '')) = lower(public.despesas_mensais.gerente)
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
);

drop policy if exists despesas_gerente_alterar on public.despesas_mensais;
create policy despesas_gerente_alterar
on public.despesas_mensais
for update
to authenticated
using (
  public.perfil_atual() = 'gerente'
  and competencia = date_trunc('month', current_date)::date
  and extract(day from current_date) >= 10
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
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and lower(coalesce(p.gerente_nome, p.nome, '')) = lower(public.despesas_mensais.gerente)
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
)
with check (
  public.perfil_atual() = 'gerente'
  and competencia = date_trunc('month', current_date)::date
  and extract(day from current_date) >= 10
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
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and lower(coalesce(p.gerente_nome, p.nome, '')) = lower(public.despesas_mensais.gerente)
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
);

drop policy if exists despesas_gerente_remover on public.despesas_mensais;
create policy despesas_gerente_remover
on public.despesas_mensais
for delete
to authenticated
using (
  public.perfil_atual() = 'gerente'
  and competencia = date_trunc('month', current_date)::date
  and extract(day from current_date) >= 10
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
      and exists (
        select 1
        from public.perfis p
        where p.user_id = auth.uid()
          and lower(coalesce(p.gerente_nome, p.nome, '')) = lower(public.despesas_mensais.gerente)
          and public.despesas_mensais.rota = any(coalesce(p.rotas_permitidas, array[]::text[]))
      )
    )
  )
);

commit;
