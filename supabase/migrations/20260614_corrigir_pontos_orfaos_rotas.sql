-- Corrige dados de teste antigos criados antes da separacao entre gerente e rota.
-- 1) Converte pontos com nome de gerente antigo para a rota principal.
-- 2) Recria pontos que equipamentos de gerente ainda referenciam, mas que nao existem mais.

update public.pontos
set gerente = 'Alex'
where lower(gerente) in ('alex sg', 'alex');

update public.pontos
set gerente = 'Central/Uibai'
where lower(gerente) = 'maynarden';

insert into public.pontos (
  nome_fantasia,
  nome_dono,
  telefone,
  gerente,
  modalidades,
  possui_despesa,
  valor_despesa,
  observacao
)
select
  upper(trim(e.localizacao)) as nome_fantasia,
  'NAO INFORMADO' as nome_dono,
  '(00) 00000-0000' as telefone,
  case
    when lower(e.gerente_responsavel) = 'yago' then 'Lapão'
    when lower(e.gerente_responsavel) = 'maynarden' then 'Central/Uibai'
    when lower(e.gerente_responsavel) = 'vitor' then 'América Dourada'
    when lower(e.gerente_responsavel) = 'eliana' then 'Eliana'
    when lower(e.gerente_responsavel) = 'queixo' then 'Queixo'
    when lower(e.gerente_responsavel) = 'wene' then 'Wene'
    when lower(e.gerente_responsavel) = 'joão luis' then 'João Luis'
    when lower(e.gerente_responsavel) = 'beu' then 'Beu'
    else 'Alex'
  end as gerente,
  array['Viapix']::text[] as modalidades,
  'nao' as possui_despesa,
  0 as valor_despesa,
  'Ponto recriado automaticamente para corrigir equipamento vinculado sem ponto.' as observacao
from public.equipamentos e
where coalesce(trim(e.localizacao), '') <> ''
  and coalesce(trim(e.gerente_responsavel), '') <> ''
  and not exists (
    select 1
    from public.pontos p
    where lower(trim(p.nome_fantasia)) = lower(trim(e.localizacao))
  )
group by upper(trim(e.localizacao)), lower(e.gerente_responsavel);

-- Quando o equipamento esta atribuido a um gerente, mas aponta para um ponto de outra rota,
-- ele volta para o estoque do gerente para nao aparecer como vinculo fantasma.
update public.equipamentos e
set localizacao = '',
    status = 'Disponível'
where coalesce(trim(e.localizacao), '') <> ''
  and lower(coalesce(e.gerente_responsavel, '')) = 'yago'
  and exists (
    select 1
    from public.pontos p
    where lower(trim(p.nome_fantasia)) = lower(trim(e.localizacao))
      and p.gerente not in ('Lapão', 'Mirorós', 'Ibititá')
  );
