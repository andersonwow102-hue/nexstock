begin;

alter table public.equipamento_categorias enable row level security;
alter table public.patrimonio_campanhas enable row level security;
alter table public.patrimonio_campanha_equipamentos enable row level security;
alter table public.patrimonio_lotes enable row level security;
alter table public.equipamentos_patrimonio enable row level security;
alter table public.equipamentos_patrimonio_legados enable row level security;
alter table public.patrimonio_operacoes_idempotentes enable row level security;
alter table public.patrimonio_eventos enable row level security;

create or replace function private.patrimonio_gerente_pode_ver_equipamento(p_equipamento_id bigint)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    p_equipamento_id is not null
    and auth.uid() is not null
    and private.perfil_atual() = 'gerente'
    and nullif(btrim(coalesce(private.gerente_atual(), '')), '') is not null
    and exists (
      select 1
      from public.equipamentos e
      where e.id = p_equipamento_id
        and (
          e.gerente_responsavel = private.gerente_atual()
          or e.localizacao in (
            select pt.nome_fantasia
            from public.pontos pt
            where exists (
              select 1 from public.perfis p
              where p.user_id = auth.uid()
                and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
            )
          )
        )
    );
$$;

revoke all on function private.patrimonio_gerente_pode_ver_equipamento(bigint)
  from public, anon, authenticated, service_role;
grant execute on function private.patrimonio_gerente_pode_ver_equipamento(bigint)
  to authenticated, service_role;

create policy equipamento_categorias_ler
on public.equipamento_categorias for select to authenticated
using (
  auth.uid() is not null
  and private.perfil_atual() in ('administrador', 'operador', 'gerente', 'consulta')
);

create policy patrimonio_campanhas_ler
on public.patrimonio_campanhas for select to authenticated
using (
  auth.uid() is not null and private.perfil_atual() in ('administrador', 'operador')
);

create policy patrimonio_campanha_equipamentos_ler
on public.patrimonio_campanha_equipamentos for select to authenticated
using (
  auth.uid() is not null and private.perfil_atual() in ('administrador', 'operador')
);

create policy patrimonio_lotes_ler
on public.patrimonio_lotes for select to authenticated
using (
  auth.uid() is not null and private.perfil_atual() in ('administrador', 'operador')
);

create policy equipamentos_patrimonio_ler
on public.equipamentos_patrimonio for select to authenticated
using (
  auth.uid() is not null
  and (
    private.perfil_atual() in ('administrador', 'operador')
    or (
      private.perfil_atual() = 'gerente'
      and equipamento_id is not null
      and private.patrimonio_gerente_pode_ver_equipamento(equipamento_id)
    )
  )
);

create policy equipamentos_patrimonio_legados_ler
on public.equipamentos_patrimonio_legados for select to authenticated
using (
  auth.uid() is not null
  and (
    private.perfil_atual() in ('administrador', 'operador')
    or (
      private.perfil_atual() = 'gerente'
      and equipamento_id is not null
      and private.patrimonio_gerente_pode_ver_equipamento(equipamento_id)
    )
  )
);

create policy patrimonio_eventos_ler
on public.patrimonio_eventos for select to authenticated
using (
  auth.uid() is not null
  and (
    private.perfil_atual() in ('administrador', 'operador')
    or (
      private.perfil_atual() = 'gerente'
      and equipamento_id is not null
      and private.patrimonio_gerente_pode_ver_equipamento(equipamento_id)
    )
  )
);

create or replace view public.patrimonio_operacional_v
with (security_invoker = true)
as
select
  ep.public_id,
  ep.codigo,
  ep.numero,
  ep.situacao,
  ep.origem,
  ep.equipamento_id,
  e.nome as equipamento_nome,
  e.categoria as equipamento_categoria,
  e.status as equipamento_status,
  e.localizacao as equipamento_localizacao,
  ep.lote_origem_id,
  l.codigo as lote_codigo,
  l.campanha_id,
  c.codigo as campanha_codigo,
  ep.campanha_item_id,
  ep.vinculado_em,
  ep.aplicado_em,
  ep.conferido_em,
  ep.anulado_em,
  ep.baixado_em,
  ep.criado_em,
  coalesce((
    select jsonb_agg(
      jsonb_build_object('codigo', lg.codigo, 'fonte', lg.fonte)
      order by lg.importado_em, lg.id
    )
    from public.equipamentos_patrimonio_legados lg
    where lg.equipamento_id = ep.equipamento_id
  ), '[]'::jsonb) as referencias_anteriores
from public.equipamentos_patrimonio ep
left join public.equipamentos e on e.id = ep.equipamento_id
left join public.patrimonio_lotes l on l.id = ep.lote_origem_id
left join public.patrimonio_campanhas c on c.id = l.campanha_id;

create or replace view public.patrimonio_lotes_resumo_v
with (security_invoker = true)
as
select
  l.id,
  l.codigo,
  l.campanha_id,
  c.codigo as campanha_codigo,
  l.situacao,
  l.quantidade,
  l.contexto,
  l.saldo_pendente_no_preparo,
  l.quantidade_excedente,
  l.excesso_confirmado,
  l.impressoes,
  count(ep.id)::integer as geradas,
  count(ep.id) filter (where ep.situacao = 'disponivel')::integer as disponiveis,
  count(ep.id) filter (where ep.situacao = 'vinculado')::integer as vinculadas,
  count(ep.id) filter (where ep.situacao = 'aplicado')::integer as aplicadas,
  count(ep.id) filter (where ep.situacao = 'conferido')::integer as conferidas,
  count(ep.id) filter (where ep.situacao = 'anulado')::integer as anuladas,
  count(ep.id) filter (where ep.situacao = 'baixado')::integer as baixadas,
  l.preparado_em,
  l.gerado_em,
  l.concluido_em
from public.patrimonio_lotes l
join public.patrimonio_campanhas c on c.id = l.campanha_id
left join public.equipamentos_patrimonio ep on ep.lote_origem_id = l.id
group by l.id, c.codigo;

create or replace view public.patrimonio_campanhas_resumo_v
with (security_invoker = true)
as
select
  c.id,
  c.codigo,
  c.nome,
  c.situacao,
  c.data_corte,
  c.quantidade_snapshot,
  count(ce.id) filter (where ce.resolucao = 'pendente')::integer as pendentes,
  count(ce.id) filter (where ce.resolucao = 'conferido')::integer as conferidos,
  count(ce.id) filter (where ce.resolucao = 'excecao')::integer as excecoes,
  coalesce((
    select count(*)::integer
    from public.equipamentos_patrimonio ep
    join public.patrimonio_lotes l on l.id = ep.lote_origem_id
    where l.campanha_id = c.id and ep.situacao = 'disponivel'
  ), 0) as etiquetas_disponiveis,
  c.criado_em,
  c.concluido_em
from public.patrimonio_campanhas c
left join public.patrimonio_campanha_equipamentos ce on ce.campanha_id = c.id
group by c.id;

create or replace function public.patrimonio_resolver_public_id(p_public_id text)
returns table (
  public_id text,
  codigo text,
  situacao text,
  origem text,
  equipamento_id bigint,
  equipamento_nome text,
  equipamento_categoria text,
  equipamento_status text,
  equipamento_localizacao text,
  lote_codigo text,
  campanha_codigo text,
  referencias_anteriores jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_perfil text;
  v_patrimonio public.equipamentos_patrimonio%rowtype;
begin
  if auth.uid() is null or p_public_id is null
     or char_length(p_public_id) <> 22
     or p_public_id !~ '^[A-Za-z0-9_-]{22}$' then
    return;
  end if;

  v_perfil := private.perfil_atual();
  if v_perfil not in ('administrador', 'operador', 'gerente') then
    return;
  end if;

  select ep.* into v_patrimonio
  from public.equipamentos_patrimonio ep
  where ep.public_id = p_public_id;
  if not found then return; end if;

  if v_perfil in ('administrador', 'operador') then
    return query
    select
      ep.public_id, ep.codigo, ep.situacao, ep.origem, ep.equipamento_id,
      e.nome, e.categoria, e.status, e.localizacao,
      l.codigo, c.codigo,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('codigo', lg.codigo, 'fonte', lg.fonte)
          order by lg.importado_em, lg.id
        )
        from public.equipamentos_patrimonio_legados lg
        where lg.equipamento_id = ep.equipamento_id
      ), '[]'::jsonb)
    from public.equipamentos_patrimonio ep
    left join public.equipamentos e on e.id = ep.equipamento_id
    left join public.patrimonio_lotes l on l.id = ep.lote_origem_id
    left join public.patrimonio_campanhas c on c.id = l.campanha_id
    where ep.id = v_patrimonio.id;
    return;
  end if;

  if v_patrimonio.situacao = 'disponivel'
     and v_patrimonio.equipamento_id is null then
    return query select
      v_patrimonio.public_id,
      v_patrimonio.codigo,
      v_patrimonio.situacao,
      null::text,
      null::bigint,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      '[]'::jsonb;
    return;
  end if;

  if v_patrimonio.equipamento_id is not null
     and private.patrimonio_gerente_pode_ver_equipamento(v_patrimonio.equipamento_id) then
    return query
    select
      ep.public_id, ep.codigo, ep.situacao, ep.origem, ep.equipamento_id,
      e.nome, e.categoria, e.status, e.localizacao,
      null::text, null::text,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('codigo', lg.codigo, 'fonte', lg.fonte)
          order by lg.importado_em, lg.id
        )
        from public.equipamentos_patrimonio_legados lg
        where lg.equipamento_id = ep.equipamento_id
      ), '[]'::jsonb)
    from public.equipamentos_patrimonio ep
    join public.equipamentos e on e.id = ep.equipamento_id
    where ep.id = v_patrimonio.id;
  end if;
end;
$$;

revoke all on table public.equipamento_categorias from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_campanhas from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_campanha_equipamentos from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_lotes from public, anon, authenticated, service_role;
revoke all on table public.equipamentos_patrimonio from public, anon, authenticated, service_role;
revoke all on table public.equipamentos_patrimonio_legados from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_operacoes_idempotentes from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_eventos from public, anon, authenticated, service_role;

revoke all on sequence public.patrimonio_np_seq from public, anon, authenticated, service_role;
revoke all on sequence public.patrimonio_lote_seq from public, anon, authenticated, service_role;
revoke all on sequence public.equipamentos_patrimonio_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.equipamentos_patrimonio_legados_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.patrimonio_eventos_id_seq from public, anon, authenticated, service_role;

grant select on table public.equipamento_categorias to authenticated, service_role;
grant select on table public.patrimonio_campanhas to authenticated, service_role;
grant select on table public.patrimonio_campanha_equipamentos to authenticated, service_role;
grant select on table public.patrimonio_lotes to authenticated, service_role;
grant select on table public.equipamentos_patrimonio to authenticated, service_role;
grant select on table public.equipamentos_patrimonio_legados to authenticated, service_role;

grant select (
  id, evento_public_id, evento, campanha_id, campanha_item_id, lote_id,
  patrimonio_id, legado_id, equipamento_id, equipamento_id_snapshot,
  estado_anterior, estado_posterior, motivo, detalhes,
  autor_user_id, autor_nome_snapshot, autor_perfil_snapshot, criado_em
) on table public.patrimonio_eventos to authenticated;
grant select on table public.patrimonio_eventos to service_role;

revoke all on table public.patrimonio_operacional_v from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_lotes_resumo_v from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_campanhas_resumo_v from public, anon, authenticated, service_role;
grant select on table public.patrimonio_operacional_v to authenticated, service_role;
grant select on table public.patrimonio_lotes_resumo_v to authenticated, service_role;
grant select on table public.patrimonio_campanhas_resumo_v to authenticated, service_role;

revoke all on function public.patrimonio_resolver_public_id(text) from public, anon, authenticated, service_role;
grant execute on function public.patrimonio_resolver_public_id(text) to authenticated;

grant execute on function public.patrimonio_criar_campanha(text, uuid) to authenticated;
grant execute on function public.patrimonio_preparar_lote(uuid, integer, text, boolean, uuid) to authenticated;
grant execute on function public.patrimonio_gerar_lote(uuid, uuid) to authenticated;
grant execute on function public.patrimonio_registrar_impressao_lote(uuid, uuid) to authenticated;
grant execute on function public.patrimonio_importar_legado(bigint, text, uuid) to authenticated;
grant execute on function public.patrimonio_cadastrar_equipamentos(jsonb, integer, uuid) to authenticated;
grant execute on function public.patrimonio_vincular_etiqueta(text, bigint, jsonb, uuid) to authenticated;
grant execute on function public.patrimonio_corrigir_vinculo(text, bigint, text, uuid) to authenticated;
grant execute on function public.patrimonio_aplicar_etiqueta(text, uuid) to authenticated;
grant execute on function public.patrimonio_conferir_etiqueta(text, bigint, text, text, uuid) to authenticated;
grant execute on function public.patrimonio_reimprimir_etiqueta(text, text, uuid) to authenticated;
grant execute on function public.patrimonio_anular(text, text, uuid) to authenticated;
grant execute on function public.patrimonio_baixar(text, text, uuid) to authenticated;
grant execute on function public.patrimonio_resolver_item_campanha_excecao(uuid, text, text, uuid) to authenticated;
grant execute on function public.patrimonio_concluir_lote(uuid, uuid) to authenticated;
grant execute on function public.patrimonio_cancelar_lote(uuid, text, uuid) to authenticated;
grant execute on function public.patrimonio_concluir_campanha(uuid, uuid) to authenticated;
grant execute on function public.patrimonio_cancelar_campanha(uuid, text, uuid) to authenticated;

comment on function public.patrimonio_resolver_public_id(text) is
  'Lookup pontual autenticado por token opaco URL-safe de 22 caracteres. Administrador/operador recebem o dossie; gerente recebe somente estado neutro para etiqueta livre ou dossie do equipamento em seu escopo. Fora do escopo retorna vazio e o token nao funciona como credencial.';

commit;
