begin;

delete from public.despesas_mensais d
using public.pontos p
where d.ponto_id = p.id
  and p.nome_fantasia like 'TESTE ROTA - %';

delete from public.equipamentos
where patrimonio like 'TESTE-ROTA-%'
   or observacao = 'Equipamento teste criado para validar rota e vínculo com ponto.';

delete from public.historico_pontos
where nome like 'TESTE ROTA - %'
  and observacao = 'Ponto de teste criado para rodada completa de rotas.';

delete from public.pontos
where nome_fantasia like 'TESTE ROTA - %';

with rotas(gerente, rota, seq) as (
  values
    ('Alex', 'Alex', 1),
    ('Maynarden', 'Central/Uibai', 1),
    ('Maynarden', 'Jussara', 2),
    ('Yago', 'Lapão', 1),
    ('Yago', 'Mirorós', 2),
    ('Yago', 'Ibititá', 3),
    ('Vitor', 'América Dourada', 1),
    ('Eliana', 'Eliana', 1),
    ('Queixo', 'Queixo', 1),
    ('Wene', 'Wene', 1),
    ('João Luis', 'João Luis', 1),
    ('Beu', 'Beu', 1)
),
novos_pontos as (
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
    'TESTE ROTA - ' || gerente || ' - ' || rota || ' ' || seq,
    'RESPONSAVEL TESTE ' || gerente,
    '(74) 9' || lpad((10000000 + row_number() over ()::int)::text, 8, '0'),
    rota,
    array['VIAPIX','90 DA SORTE'],
    'sim',
    0,
    'Massa de teste criada pelo Codex para validar rotas, filtros e prestação de contas.'
  from rotas
  returning id, nome_fantasia, gerente
),
despesas_base as (
  select
    p.id as ponto_id,
    p.nome_fantasia,
    p.gerente,
    date_trunc('month', current_date)::date as competencia,
    d.descricao,
    d.valor
  from novos_pontos p
  cross join lateral (
    values
      ('Internet teste rota', 110.00),
      ('Aluguel teste rota', 350.00),
      ('Taxa local teste rota', 45.00)
  ) as d(descricao, valor)
),
novas_despesas as (
  insert into public.despesas_mensais (
    ponto_id,
    competencia,
    descricao,
    tipo,
    valor_previsto,
    valor_real,
    observacao
  )
  select
    ponto_id,
    competencia,
    descricao,
    'fixa',
    valor,
    case
      when descricao = 'Aluguel teste rota' and gerente in ('Central/Uibai','Beu','Alex') then valor + 80
      else valor
    end,
    'Despesa teste para validar fechamento por gerente/rota.'
  from despesas_base
  on conflict (ponto_id, competencia, descricao) do update
    set valor_previsto = excluded.valor_previsto,
        valor_real = excluded.valor_real,
        observacao = excluded.observacao
  returning ponto_id
),
totais as (
  select
    p.id,
    coalesce(sum(d.valor_real), 0) as total
  from novos_pontos p
  left join public.despesas_mensais d on d.ponto_id = p.id
  group by p.id
),
atualiza_pontos as (
  update public.pontos p
  set valor_despesa = t.total,
      possui_despesa = case when t.total > 0 then 'sim' else 'nao' end
  from totais t
  where p.id = t.id
  returning p.id
),
equipamentos_base as (
  select
    p.id,
    p.nome_fantasia,
    p.gerente,
    row_number() over (order by p.id) as rn
  from novos_pontos p
),
novos_equipamentos as (
  insert into public.equipamentos (
    nome,
    categoria,
    quantidade,
    status,
    minimo,
    observacao,
    localizacao,
    responsavel,
    patrimonio,
    data_cadastro,
    gerente_responsavel,
    transferencia_status
  )
  select
    case when rn % 3 = 0 then 'TERMINAL TESTE ROTA'
         when rn % 3 = 1 then 'TV TESTE ROTA'
         else 'PDV TOUCHSCREEN TESTE ROTA' end,
    case when rn % 3 = 0 then 'Terminais'
         when rn % 3 = 1 then 'Televisões'
         else 'PDV Touchscreen' end,
    1,
    'Em rota',
    5,
    'Equipamento teste criado para validar rota e vínculo com ponto.',
    nome_fantasia,
    gerente,
    'TESTE-ROTA-' || lpad(rn::text, 3, '0'),
    to_char(current_date, 'DD/MM/YYYY'),
    '',
    ''
  from equipamentos_base
  where not exists (
    select 1
    from public.equipamentos e
    where upper(trim(e.patrimonio)) = upper(trim('TESTE-ROTA-' || lpad(rn::text, 3, '0')))
  )
  returning id
),
historico as (
  insert into public.historico_pontos (tipo, nome, gerente, observacao, data)
  select
    'cadastro',
    nome_fantasia,
    gerente,
    'Ponto de teste criado para rodada completa de rotas.',
    to_char(now(), 'DD/MM/YYYY, HH24:MI')
  from novos_pontos
  returning id
)
select
  'seed_rotas_teste_ok' as status,
  (select count(*) from novos_pontos) as pontos_criados,
  (select count(*) from novas_despesas) as despesas_criadas_ou_atualizadas,
  (select count(*) from novos_equipamentos) as equipamentos_criados,
  (select count(*) from historico) as historicos_criados;

commit;
