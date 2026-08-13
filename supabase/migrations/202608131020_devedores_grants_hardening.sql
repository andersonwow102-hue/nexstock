begin;

revoke all on public.devedores_modalidades from public, anon, authenticated;
revoke all on public.devedores_relatorios from public, anon, authenticated;
revoke all on public.devedores_dividas from public, anon, authenticated;
revoke all on public.devedores_historico from public, anon, authenticated;

grant select on public.devedores_modalidades to authenticated;
grant select on public.devedores_relatorios to authenticated;
grant select on public.devedores_dividas to authenticated;
grant select on public.devedores_historico to authenticated;

revoke all on sequence public.devedores_modalidades_id_seq from public, anon, authenticated;
revoke all on sequence public.devedores_relatorios_id_seq from public, anon, authenticated;
revoke all on sequence public.devedores_dividas_id_seq from public, anon, authenticated;
revoke all on sequence public.devedores_historico_id_seq from public, anon, authenticated;

revoke all on function public.devedores_cadastrar_relatorio_divida(text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text) from public, anon;
revoke all on function public.devedores_corrigir_relatorio_gerente(bigint,bigint,text,text,text,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.devedores_corrigir_fase1_admin(bigint,bigint,bigint,text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text,text) from public, anon;

grant execute on function public.devedores_cadastrar_relatorio_divida(text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text) to authenticated;
grant execute on function public.devedores_corrigir_relatorio_gerente(bigint,bigint,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.devedores_corrigir_fase1_admin(bigint,bigint,bigint,text,text,text,text,text,text,text,text,text,text,text,numeric,bigint,date,text,text) to authenticated;

commit;
