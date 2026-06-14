-- Permite que perfis gerente lancem despesas mensais apenas para pontos das suas rotas.
-- Administrador e operador continuam atendidos pela politica despesas_escrever existente.

drop policy if exists despesas_gerente_criar on public.despesas_mensais;
create policy despesas_gerente_criar
on public.despesas_mensais
for insert
to authenticated
with check (
  public.perfil_atual() = 'gerente'
  and exists (
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

drop policy if exists pontos_gerente_atualizar_resumo_despesa on public.pontos;
create policy pontos_gerente_atualizar_resumo_despesa
on public.pontos
for update
to authenticated
using (
  public.perfil_atual() = 'gerente'
  and exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and public.pontos.gerente = any(
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
  public.perfil_atual() = 'gerente'
  and exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and public.pontos.gerente = any(
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

drop policy if exists despesas_gerente_alterar on public.despesas_mensais;
create policy despesas_gerente_alterar
on public.despesas_mensais
for update
to authenticated
using (
  public.perfil_atual() = 'gerente'
  and exists (
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
)
with check (
  public.perfil_atual() = 'gerente'
  and exists (
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

drop policy if exists despesas_gerente_remover on public.despesas_mensais;
create policy despesas_gerente_remover
on public.despesas_mensais
for delete
to authenticated
using (
  public.perfil_atual() = 'gerente'
  and exists (
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
