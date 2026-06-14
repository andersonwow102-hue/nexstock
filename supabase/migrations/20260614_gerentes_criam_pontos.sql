-- Permite que perfis gerente criem pontos apenas nas rotas liberadas para o seu login.
-- Administrador e operador continuam com as permissões já existentes.

drop policy if exists pontos_gerente_criar on public.pontos;
create policy pontos_gerente_criar
on public.pontos
for insert
to authenticated
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

drop policy if exists historico_pontos_gerente_criar on public.historico_pontos;
create policy historico_pontos_gerente_criar
on public.historico_pontos
for insert
to authenticated
with check (
  public.perfil_atual() = 'gerente'
  and exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and public.historico_pontos.gerente = any(
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
