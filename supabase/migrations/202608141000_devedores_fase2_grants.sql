begin;

revoke all on table public.devedores_negociacoes from public, anon, authenticated;
revoke all on table public.devedores_parcelas from public, anon, authenticated;
revoke all on table public.devedores_pagamentos from public, anon, authenticated;
revoke all on table public.devedores_pagamentos_estornos from public, anon, authenticated;
revoke all on table public.devedores_parcelas_resumo from public, anon, authenticated;
revoke all on table public.devedores_dividas_resumo from public, anon, authenticated;

grant select on table public.devedores_negociacoes to authenticated;
grant select on table public.devedores_parcelas to authenticated;
grant select on table public.devedores_pagamentos to authenticated;
grant select on table public.devedores_pagamentos_estornos to authenticated;
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
