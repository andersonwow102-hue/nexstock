-- Corrige o escopo do comunicado de conserto feito por gerente.
-- O gerente pode registrar apenas o defeito em equipamento sob sua responsabilidade.

drop policy if exists consertos_equipamentos_gerente_comunicar on public.consertos_equipamentos;
create policy consertos_equipamentos_gerente_comunicar
on public.consertos_equipamentos
for insert to authenticated
with check (
  private.perfil_atual() = 'gerente'
  and coalesce(conserto_defeito, '') <> ''
  and coalesce(conserto_assistencia, '') = ''
  and conserto_previsao is null
  and coalesce(conserto_pix, '') = ''
  and coalesce(conserto_valor, 0) = 0
  and coalesce(conserto_nota_nome, '') = ''
  and coalesce(conserto_nota_arquivo, '') = ''
  and exists (
    select 1
    from public.equipamentos e
    join public.perfis p on p.user_id = auth.uid()
    where e.id = public.consertos_equipamentos.equipamento_id
      and lower(coalesce(e.gerente_responsavel, '')) = lower(coalesce(p.gerente_nome, p.nome, ''))
  )
);

drop policy if exists consertos_equipamentos_gerente_atualizar_comunicado on public.consertos_equipamentos;
create policy consertos_equipamentos_gerente_atualizar_comunicado
on public.consertos_equipamentos
for update to authenticated
using (
  private.perfil_atual() = 'gerente'
  and exists (
    select 1
    from public.equipamentos e
    join public.perfis p on p.user_id = auth.uid()
    where e.id = public.consertos_equipamentos.equipamento_id
      and lower(coalesce(e.gerente_responsavel, '')) = lower(coalesce(p.gerente_nome, p.nome, ''))
  )
)
with check (
  private.perfil_atual() = 'gerente'
  and coalesce(conserto_defeito, '') <> ''
  and coalesce(conserto_assistencia, '') = ''
  and conserto_previsao is null
  and coalesce(conserto_pix, '') = ''
  and coalesce(conserto_valor, 0) = 0
  and coalesce(conserto_nota_nome, '') = ''
  and coalesce(conserto_nota_arquivo, '') = ''
  and exists (
    select 1
    from public.equipamentos e
    join public.perfis p on p.user_id = auth.uid()
    where e.id = public.consertos_equipamentos.equipamento_id
      and lower(coalesce(e.gerente_responsavel, '')) = lower(coalesce(p.gerente_nome, p.nome, ''))
  )
);
