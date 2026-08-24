begin;

alter table public.devedores_relatorios
  add column excluido_em timestamptz,
  add column excluido_por uuid references auth.users(id) on delete restrict,
  add column excluido_por_nome_snapshot text,
  add column motivo_exclusao text,
  add constraint devedores_relatorios_exclusao_consistente_check check (
    (excluido_em is null and excluido_por is null and excluido_por_nome_snapshot is null and motivo_exclusao is null)
    or
    (excluido_em is not null and excluido_por is not null
      and char_length(btrim(excluido_por_nome_snapshot)) between 1 and 200
      and char_length(btrim(motivo_exclusao)) between 5 and 1000)
  );

create index devedores_relatorios_operacionais_idx
  on public.devedores_relatorios (atualizado_em desc) where excluido_em is null;

create or replace function private.devedores_divida_excluida(p_divida_id bigint)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select coalesce((select r.excluido_em is not null
    from public.devedores_dividas d join public.devedores_relatorios r on r.id = d.relatorio_id
    where d.id = p_divida_id), false);
$$;
revoke all on function private.devedores_divida_excluida(bigint) from public, anon, authenticated;
grant execute on function private.devedores_divida_excluida(bigint) to service_role;

create or replace function private.devedores_bloquear_registro_excluido()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_divida_id bigint; v_excluido boolean;
begin
  if tg_table_name = 'devedores_relatorios' then
    if tg_op <> 'INSERT' and old.excluido_em is not null then
      raise exception 'Devedor excluido administrativamente e bloqueado para alteracoes.' using errcode = '55000';
    end if;
    return new;
  end if;
  if tg_table_name = 'devedores_dividas' then
    select r.excluido_em is not null into v_excluido from public.devedores_relatorios r
    where r.id = coalesce(new.relatorio_id, old.relatorio_id);
  else
    v_divida_id := coalesce(new.divida_id, old.divida_id);
    v_excluido := private.devedores_divida_excluida(v_divida_id);
  end if;
  if coalesce(v_excluido, false) then
    raise exception 'Devedor excluido administrativamente e bloqueado para operacoes.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.devedores_bloquear_registro_excluido() from public, anon, authenticated;

create trigger devedores_relatorios_bloquear_excluido before update or delete on public.devedores_relatorios for each row execute function private.devedores_bloquear_registro_excluido();
create trigger devedores_dividas_bloquear_excluido before insert or update or delete on public.devedores_dividas for each row execute function private.devedores_bloquear_registro_excluido();
create trigger devedores_negociacoes_bloquear_excluido before insert or update or delete on public.devedores_negociacoes for each row execute function private.devedores_bloquear_registro_excluido();
create trigger devedores_parcelas_bloquear_excluido before insert or update or delete on public.devedores_parcelas for each row execute function private.devedores_bloquear_registro_excluido();
create trigger devedores_pagamentos_bloquear_excluido before insert or update or delete on public.devedores_pagamentos for each row execute function private.devedores_bloquear_registro_excluido();
create trigger devedores_estornos_bloquear_excluido before insert or update or delete on public.devedores_pagamentos_estornos for each row execute function private.devedores_bloquear_registro_excluido();

drop policy devedores_relatorios_ler on public.devedores_relatorios;
create policy devedores_relatorios_ler on public.devedores_relatorios for select to authenticated using (
  exists (select 1 from public.perfis p where p.user_id = auth.uid() and (
    p.perfil = 'administrador' or (excluido_em is null and p.perfil in ('operador','consulta'))
    or (excluido_em is null and p.perfil = 'gerente' and gerente_responsavel_id = p.user_id))));

drop policy devedores_dividas_ler on public.devedores_dividas;
create policy devedores_dividas_ler on public.devedores_dividas for select to authenticated using (
  exists (select 1 from public.perfis p join public.devedores_relatorios r on r.id = devedores_dividas.relatorio_id
    where p.user_id = auth.uid() and (p.perfil = 'administrador'
      or (r.excluido_em is null and p.perfil in ('operador','consulta'))
      or (r.excluido_em is null and p.perfil = 'gerente' and gerente_responsavel_id = p.user_id))));

drop policy devedores_historico_ler on public.devedores_historico;
create policy devedores_historico_ler on public.devedores_historico for select to authenticated using (
  exists (select 1 from public.perfis p join public.devedores_dividas d on d.id = devedores_historico.divida_id
    join public.devedores_relatorios r on r.id = d.relatorio_id where p.user_id = auth.uid() and (
      p.perfil = 'administrador' or (r.excluido_em is null and p.perfil in ('operador','consulta'))
      or (r.excluido_em is null and p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id))));

drop policy devedores_negociacoes_ler on public.devedores_negociacoes;
create policy devedores_negociacoes_ler on public.devedores_negociacoes for select to authenticated using (exists (
  select 1 from public.perfis p join public.devedores_dividas d on d.id = devedores_negociacoes.divida_id
  join public.devedores_relatorios r on r.id = d.relatorio_id where p.user_id = auth.uid() and (
    p.perfil = 'administrador' or (r.excluido_em is null and p.perfil in ('operador','consulta'))
    or (r.excluido_em is null and p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id))));

drop policy devedores_parcelas_ler on public.devedores_parcelas;
create policy devedores_parcelas_ler on public.devedores_parcelas for select to authenticated using (exists (
  select 1 from public.perfis p join public.devedores_dividas d on d.id = devedores_parcelas.divida_id
  join public.devedores_relatorios r on r.id = d.relatorio_id where p.user_id = auth.uid() and (
    p.perfil = 'administrador' or (r.excluido_em is null and p.perfil in ('operador','consulta'))
    or (r.excluido_em is null and p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id))));

drop policy devedores_pagamentos_ler on public.devedores_pagamentos;
create policy devedores_pagamentos_ler on public.devedores_pagamentos for select to authenticated using (exists (
  select 1 from public.perfis p join public.devedores_dividas d on d.id = devedores_pagamentos.divida_id
  join public.devedores_relatorios r on r.id = d.relatorio_id where p.user_id = auth.uid() and (
    p.perfil = 'administrador' or (r.excluido_em is null and p.perfil in ('operador','consulta'))
    or (r.excluido_em is null and p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id))));

drop policy devedores_pagamentos_estornos_ler on public.devedores_pagamentos_estornos;
create policy devedores_pagamentos_estornos_ler on public.devedores_pagamentos_estornos for select to authenticated using (exists (
  select 1 from public.perfis p join public.devedores_dividas d on d.id = devedores_pagamentos_estornos.divida_id
  join public.devedores_relatorios r on r.id = d.relatorio_id where p.user_id = auth.uid() and (
    p.perfil = 'administrador' or (r.excluido_em is null and p.perfil in ('operador','consulta'))
    or (r.excluido_em is null and p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id))));

create view public.devedores_dividas_resumo_administrativo with (security_invoker = true) as
select resumo.*, r.excluido_em, r.excluido_por, r.excluido_por_nome_snapshot, r.motivo_exclusao
from public.devedores_dividas_resumo resumo
join public.devedores_dividas d on d.id = resumo.divida_id
join public.devedores_relatorios r on r.id = d.relatorio_id;
revoke all on table public.devedores_dividas_resumo_administrativo from public, anon, authenticated;
grant select on table public.devedores_dividas_resumo_administrativo to authenticated;

create or replace function public.devedores_excluir_administrativamente(p_divida_id bigint, p_versao_esperada bigint, p_motivo text)
returns bigint language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record; v_relatorio_id bigint; v_relatorio public.devedores_relatorios%rowtype;
  v_divida public.devedores_dividas%rowtype; v_negociacao public.devedores_negociacoes%rowtype;
  v_total_pago numeric(14,2); v_saldo numeric(14,2); v_correlation_id uuid := gen_random_uuid(); v_anterior jsonb;
begin
  if auth.uid() is null then raise exception 'Acesso nao autenticado.' using errcode = '42501'; end if;
  select * into v_identidade from private.devedores_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode excluir devedor.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo,''))) not between 5 and 1000 then
    raise exception 'Motivo da exclusao deve possuir entre 5 e 1000 caracteres.' using errcode = '22023'; end if;
  select relatorio_id into v_relatorio_id from public.devedores_dividas where id = p_divida_id;
  if not found then raise exception 'Divida nao encontrada.' using errcode = 'P0002'; end if;
  select * into v_relatorio from public.devedores_relatorios where id = v_relatorio_id for update;
  select * into v_divida from public.devedores_dividas where id = p_divida_id and relatorio_id = v_relatorio_id for update;
  if not found then raise exception 'Divida nao encontrada.' using errcode = 'P0002'; end if;
  if v_relatorio.excluido_em is not null then raise exception 'Devedor ja excluido administrativamente.' using errcode = '23505'; end if;
  if v_divida.versao <> p_versao_esperada then raise exception 'Registro alterado por outro usuario. Atualize e tente novamente.' using errcode = '40001'; end if;
  select * into v_negociacao from public.devedores_negociacoes where divida_id = v_divida.id and situacao = 'ativa' for update;
  select coalesce(sum(pg.valor) filter (where e.id is null),0)::numeric(14,2) into v_total_pago
    from public.devedores_pagamentos pg left join public.devedores_pagamentos_estornos e on e.pagamento_id = pg.id
    where pg.divida_id = v_divida.id;
  v_saldo := greatest(coalesce(v_negociacao.valor_negociado,v_divida.valor_original)-v_total_pago,0);
  v_anterior := jsonb_build_object('relatorio_id',v_relatorio.id,'divida_id',v_divida.id,
    'situacao_anterior',case when v_saldo=0 then 'quitada' when v_total_pago>0 then 'parcialmente_paga' when v_negociacao.id is not null then 'negociada' else 'aberta' end,
    'valor_original',v_divida.valor_original,'valor_negociado',v_negociacao.valor_negociado,
    'total_pago',v_total_pago,'saldo_restante',v_saldo,'versao_divida',v_divida.versao,'versao_relatorio',v_relatorio.versao);
  update public.devedores_dividas set versao=versao+1,atualizado_por=auth.uid(),atualizado_em=now() where id=v_divida.id;
  insert into public.devedores_historico(relatorio_id,divida_id,entidade,entidade_id,acao,dados_anteriores,dados_novos,motivo,usuario_id,usuario_nome_snapshot,perfil_snapshot,correlation_id)
  values(v_relatorio.id,v_divida.id,'divida',v_divida.id,'exclusao_administrativa',v_anterior,
    jsonb_build_object('excluido',true,'operacional',false),btrim(p_motivo),auth.uid(),v_identidade.usuario_nome,v_identidade.perfil,v_correlation_id);
  update public.devedores_relatorios set excluido_em=now(),excluido_por=auth.uid(),
    excluido_por_nome_snapshot=v_identidade.usuario_nome,motivo_exclusao=btrim(p_motivo),
    versao=versao+1,atualizado_por=auth.uid(),atualizado_em=now() where id=v_relatorio.id;
  return v_divida.id;
end;
$$;
revoke all on function public.devedores_excluir_administrativamente(bigint,bigint,text) from public, anon;
grant execute on function public.devedores_excluir_administrativamente(bigint,bigint,text) to authenticated;

commit;
