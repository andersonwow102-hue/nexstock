-- AE Esportiva foi cadastrada por engano como modalidade separada.
-- Play Bet representa essa modalidade no sistema.

update public.pontos
set modalidades = (
  select array_agg(distinct case when modalidade = 'AE Esportiva' then 'Play Bet' else modalidade end)
  from unnest(modalidades) as modalidade
)
where modalidades @> array['AE Esportiva']::text[];

delete from public.ponto_modalidade_acessos ae
where ae.modalidade = 'AE Esportiva'
  and exists (
    select 1
    from public.ponto_modalidade_acessos pb
    where pb.ponto_id = ae.ponto_id
      and pb.modalidade = 'Play Bet'
  );

update public.ponto_modalidade_acessos
set modalidade = 'Play Bet'
where modalidade = 'AE Esportiva';

delete from public.gerente_modalidade_acessos ae
where ae.modalidade = 'AE Esportiva'
  and exists (
    select 1
    from public.gerente_modalidade_acessos pb
    where pb.gerente = ae.gerente
      and pb.modalidade = 'Play Bet'
  );

update public.gerente_modalidade_acessos
set modalidade = 'Play Bet'
where modalidade = 'AE Esportiva';

delete from public.modalidade_apps ae
where ae.modalidade = 'AE Esportiva'
  and exists (
    select 1
    from public.modalidade_apps pb
    where pb.modalidade = 'Play Bet'
  );

update public.modalidade_apps
set modalidade = 'Play Bet'
where modalidade = 'AE Esportiva';

update public.solicitacoes_modalidade
set modalidade = 'Play Bet'
where modalidade = 'AE Esportiva';

update public.fechamentos_rotas
set modalidade = 'Play Bet'
where modalidade = 'AE Esportiva';
