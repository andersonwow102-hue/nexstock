begin;

create view public.devedores_parcelas_resumo
with (security_invoker = true)
as
select
  p.id,
  p.negociacao_id,
  p.divida_id,
  p.numero,
  p.valor,
  p.vencimento,
  coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric)::numeric(14,2) as valor_pago,
  greatest(p.valor - coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric), 0::numeric)::numeric(14,2) as saldo,
  case
    when coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric) >= p.valor then 'paga'
    when coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric) > 0 then 'parcialmente_paga'
    when p.vencimento < current_date then 'vencida'
    else 'pendente'
  end as situacao
from public.devedores_parcelas p
left join public.devedores_pagamentos pg on pg.parcela_id = p.id
left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
group by p.id;

create view public.devedores_dividas_resumo
with (security_invoker = true)
as
select
  d.id as divida_id,
  d.relatorio_id,
  d.gerente_responsavel_id,
  d.valor_original,
  n.id as negociacao_id,
  n.forma_pagamento,
  n.valor_negociado,
  coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric)::numeric(14,2) as total_pago,
  case
    when n.id is null then d.valor_original
    else greatest(n.valor_negociado - coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric), 0::numeric)
  end::numeric(14,2) as saldo_restante,
  case
    when n.id is null then 0::numeric
    else round(least(coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric) / n.valor_negociado * 100, 100), 2)
  end::numeric(7,2) as evolucao_percentual,
  case
    when n.id is null then 'aberta'
    when coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric) >= n.valor_negociado then 'quitada'
    when (n.forma_pagamento = 'vista' and n.data_prevista_quitacao < current_date)
      or exists (
        select 1 from public.devedores_parcelas px
        where px.negociacao_id = n.id
          and px.vencimento < current_date
          and coalesce((
            select sum(pgx.valor)
            from public.devedores_pagamentos pgx
            left join public.devedores_pagamentos_estornos ex on ex.pagamento_id = pgx.id
            where pgx.parcela_id = px.id and ex.id is null
          ), 0) < px.valor
      ) then 'vencida'
    when coalesce(sum(pg.valor) filter (where e.id is null), 0::numeric) > 0 then 'parcialmente_paga'
    else 'negociada'
  end as situacao
from public.devedores_dividas d
left join public.devedores_negociacoes n on n.divida_id = d.id and n.situacao = 'ativa'
left join public.devedores_pagamentos pg on pg.negociacao_id = n.id
left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
group by d.id, n.id;

comment on view public.devedores_dividas_resumo is
  'Estado financeiro derivado e isolado; nao produz lancamentos em outros modulos.';

commit;
