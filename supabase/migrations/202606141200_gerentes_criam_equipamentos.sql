-- Permite que perfis gerente cadastrem equipamentos apenas no próprio estoque.
-- Administrador e operador continuam controlados pela política equipamentos_escrever.

drop policy if exists equipamentos_gerente_criar on public.equipamentos;
create policy equipamentos_gerente_criar
on public.equipamentos
for insert
to authenticated
with check (
  public.perfil_atual() = 'gerente'
  and coalesce(transferencia_status, '') = 'recebido'
  and exists (
    select 1
    from public.perfis p
    where p.user_id = auth.uid()
      and lower(public.equipamentos.gerente_responsavel) = lower(coalesce(p.gerente_nome, p.nome, ''))
      and (
        coalesce(public.equipamentos.localizacao, '') = ''
        or exists (
          select 1
          from public.pontos pt
          where lower(pt.nome_fantasia) = lower(public.equipamentos.localizacao)
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
  )
);

drop policy if exists historico_equip_gerente_criar on public.historico_equipamentos;
create policy historico_equip_gerente_criar
on public.historico_equipamentos
for insert
to authenticated
with check (
  public.perfil_atual() = 'gerente'
  and tipo in ('cadastro', 'recebimento_gerente')
);
