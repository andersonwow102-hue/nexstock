begin;

revoke all on table public.devedores_negociacoes from public, anon, authenticated;
revoke all on table public.devedores_parcelas from public, anon, authenticated;
revoke all on table public.devedores_pagamentos from public, anon, authenticated;
revoke all on table public.devedores_pagamentos_estornos from public, anon, authenticated;
revoke all on table public.devedores_parcelas_resumo from public, anon, authenticated;
revoke all on table public.devedores_dividas_resumo from public, anon, authenticated;

revoke all on sequence public.devedores_negociacoes_id_seq from public, anon, authenticated;
revoke all on sequence public.devedores_parcelas_id_seq from public, anon, authenticated;
revoke all on sequence public.devedores_pagamentos_id_seq from public, anon, authenticated;
revoke all on sequence public.devedores_pagamentos_estornos_id_seq from public, anon, authenticated;

grant select (
  id, divida_id, negociacao_anterior_id, forma_pagamento, valor_negociado,
  data_prevista_quitacao, quantidade_parcelas, primeiro_vencimento, observacoes,
  situacao, motivo_substituicao, criado_por, criado_por_nome_snapshot,
  criado_por_perfil_snapshot, criado_em, substituida_por, substituida_em, versao
) on table public.devedores_negociacoes to authenticated;
grant select (id, negociacao_id, divida_id, numero, valor, vencimento, criado_em)
  on table public.devedores_parcelas to authenticated;
grant select (
  id, divida_id, negociacao_id, parcela_id, valor, data_pagamento, observacao,
  registrado_por, registrado_por_nome_snapshot, registrado_por_perfil_snapshot, registrado_em
) on table public.devedores_pagamentos to authenticated;
grant select (
  id, pagamento_id, divida_id, motivo, estornado_por,
  estornado_por_nome_snapshot, estornado_por_perfil_snapshot, estornado_em
) on table public.devedores_pagamentos_estornos to authenticated;
grant select on table public.devedores_parcelas_resumo to authenticated;
grant select on table public.devedores_dividas_resumo to authenticated;

revoke all on function public.devedores_criar_negociacao(bigint,bigint,text,numeric,date,integer,date,text,uuid)
  from public, anon;
revoke all on function public.devedores_substituir_negociacao(bigint,bigint,text,numeric,date,integer,date,text,text,uuid)
  from public, anon;
revoke all on function public.devedores_registrar_pagamento(bigint,bigint,bigint,numeric,date,text,uuid)
  from public, anon;
revoke all on function public.devedores_estornar_pagamento(bigint,bigint,text,uuid)
  from public, anon;
revoke all on function public.devedores_corrigir_negociacao_admin(bigint,bigint,text,numeric,date,integer,date,text,text,uuid)
  from public, anon;

grant execute on function public.devedores_criar_negociacao(bigint,bigint,text,numeric,date,integer,date,text,uuid)
  to authenticated;
grant execute on function public.devedores_substituir_negociacao(bigint,bigint,text,numeric,date,integer,date,text,text,uuid)
  to authenticated;
grant execute on function public.devedores_registrar_pagamento(bigint,bigint,bigint,numeric,date,text,uuid)
  to authenticated;
grant execute on function public.devedores_estornar_pagamento(bigint,bigint,text,uuid)
  to authenticated;
grant execute on function public.devedores_corrigir_negociacao_admin(bigint,bigint,text,numeric,date,integer,date,text,text,uuid)
  to authenticated;

commit;
