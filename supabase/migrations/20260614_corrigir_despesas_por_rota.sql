begin;

drop policy if exists despesas_ler on public.despesas_mensais;
drop policy if exists despesas_escrever on public.despesas_mensais;
drop policy if exists despesas_gerente_criar on public.despesas_mensais;
drop policy if exists despesas_gerente_alterar on public.despesas_mensais;
drop policy if exists despesas_gerente_remover on public.despesas_mensais;

create policy despesas_ler
on public.despesas_mensais
for select
to authenticated
using (
  public.perfil_atual() <> 'gerente'
  or exists (
    select 1
    from public.pontos pt
    join public.perfis p on p.user_id = auth.uid()
    where pt.id = public.despesas_mensais.ponto_id
      and pt.gerente = any(
        case
          when coalesce(array_length(p.rotas_permitidas, 1), 0) > 0 then p.rotas_permitidas
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'alex' then array['Alex']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'maynarden' then array['Central/Uibai','Jussara']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'yago' then array['Lapão','Mirorós','Ibititá']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'vitor' then array['América Dourada']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'eliana' then array['Eliana']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'queixo' then array['Queixo']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'wene' then array['Wene']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'joão luis' then array['João Luis']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'beu' then array['Beu']
          else array[]::text[]
        end
      )
  )
);

create policy despesas_escrever
on public.despesas_mensais
for all
to authenticated
using (
  public.perfil_atual() = any(array['administrador','operador'])
  or exists (
    select 1
    from public.pontos pt
    join public.perfis p on p.user_id = auth.uid()
    where public.perfil_atual() = 'gerente'
      and pt.id = public.despesas_mensais.ponto_id
      and pt.gerente = any(
        case
          when coalesce(array_length(p.rotas_permitidas, 1), 0) > 0 then p.rotas_permitidas
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'alex' then array['Alex']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'maynarden' then array['Central/Uibai','Jussara']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'yago' then array['Lapão','Mirorós','Ibititá']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'vitor' then array['América Dourada']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'eliana' then array['Eliana']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'queixo' then array['Queixo']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'wene' then array['Wene']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'joão luis' then array['João Luis']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'beu' then array['Beu']
          else array[]::text[]
        end
      )
  )
)
with check (
  public.perfil_atual() = any(array['administrador','operador'])
  or exists (
    select 1
    from public.pontos pt
    join public.perfis p on p.user_id = auth.uid()
    where public.perfil_atual() = 'gerente'
      and pt.id = public.despesas_mensais.ponto_id
      and pt.gerente = any(
        case
          when coalesce(array_length(p.rotas_permitidas, 1), 0) > 0 then p.rotas_permitidas
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'alex' then array['Alex']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'maynarden' then array['Central/Uibai','Jussara']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'yago' then array['Lapão','Mirorós','Ibititá']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'vitor' then array['América Dourada']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'eliana' then array['Eliana']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'queixo' then array['Queixo']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'wene' then array['Wene']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'joão luis' then array['João Luis']
          when lower(coalesce(p.gerente_nome, p.nome, '')) = 'beu' then array['Beu']
          else array[]::text[]
        end
      )
  )
);

commit;
