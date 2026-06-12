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

select 'limpeza_seed_rotas_teste_ok' as status;

commit;
