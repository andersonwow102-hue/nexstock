begin;

create sequence public.patrimonio_np_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  maxvalue 999999
  cache 1
  no cycle
  owned by none;

create sequence public.patrimonio_lote_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  maxvalue 9999
  cache 1
  no cycle
  owned by none;

revoke all on sequence public.patrimonio_np_seq from public, anon, authenticated;
revoke all on sequence public.patrimonio_lote_seq from public, anon, authenticated;

comment on sequence public.patrimonio_np_seq is
  'Fonte exclusiva e nao ciclica dos numeros NP. Lacunas sao esperadas; numeros nunca sao reutilizados.';
comment on sequence public.patrimonio_lote_seq is
  'Fonte local e nao ciclica do sufixo dos codigos PAT-YYYYMM-0001. Nao concede uso direto aos clientes.';

commit;
