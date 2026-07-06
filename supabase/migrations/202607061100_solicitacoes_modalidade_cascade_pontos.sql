begin;

delete from public.solicitacoes_modalidade s
where not exists (
  select 1
  from public.pontos p
  where p.id = s.ponto_id
);

alter table public.solicitacoes_modalidade
  drop constraint if exists solicitacoes_modalidade_ponto_id_fkey,
  add constraint solicitacoes_modalidade_ponto_id_fkey
    foreign key (ponto_id)
    references public.pontos(id)
    on delete cascade;

commit;
