-- Gerente pode comunicar defeito para a administracao/operacao buscar o equipamento.
-- Dados fiscais do conserto continuam restritos ao operador/administrador.

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
    where e.id = public.consertos_equipamentos.equipamento_id
      and e.gerente_responsavel = private.gerente_atual()
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
    where e.id = public.consertos_equipamentos.equipamento_id
      and e.gerente_responsavel = private.gerente_atual()
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
    where e.id = public.consertos_equipamentos.equipamento_id
      and e.gerente_responsavel = private.gerente_atual()
  )
);
