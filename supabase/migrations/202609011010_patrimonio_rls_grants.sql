begin;

alter table public.equipamento_categorias enable row level security;
alter table public.patrimonio_lotes enable row level security;
alter table public.patrimonio_lote_equipamentos enable row level security;
alter table public.equipamentos_patrimonio enable row level security;
alter table public.patrimonio_eventos enable row level security;

create or replace function private.patrimonio_gerente_pode_ver_equipamento(
  p_equipamento_id bigint
)
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
              select 1
              from public.perfis p
              where p.user_id = auth.uid()
                and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
            )
          )
        )
    );
$$;

revoke all on function private.patrimonio_gerente_pode_ver_equipamento(bigint)
  from public, anon;
grant execute on function private.patrimonio_gerente_pode_ver_equipamento(bigint)
  to authenticated, service_role;

create or replace function private.patrimonio_gerente_pode_ver_lote(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    p_lote_id is not null
    and auth.uid() is not null
    and private.perfil_atual() = 'gerente'
    and exists (
      select 1
      from public.patrimonio_lote_equipamentos le
      where le.lote_id = p_lote_id
        and le.equipamento_id is not null
    )
    and not exists (
      select 1
      from public.patrimonio_lote_equipamentos le
      where le.lote_id = p_lote_id
        and le.equipamento_id is not null
        and not private.patrimonio_gerente_pode_ver_equipamento(le.equipamento_id)
    );
$$;

revoke all on function private.patrimonio_gerente_pode_ver_lote(uuid)
  from public, anon;
grant execute on function private.patrimonio_gerente_pode_ver_lote(uuid)
  to authenticated, service_role;

create policy equipamento_categorias_ler
on public.equipamento_categorias for select to authenticated
using (
  auth.uid() is not null
  and private.perfil_atual() in ('administrador', 'operador', 'gerente')
);

create policy patrimonio_lotes_ler
on public.patrimonio_lotes for select to authenticated
using (
  auth.uid() is not null
  and (
    private.perfil_atual() in ('administrador', 'operador')
    or (
      private.perfil_atual() = 'gerente'
      and private.patrimonio_gerente_pode_ver_lote(id)
    )
  )
);

create policy patrimonio_lote_equipamentos_ler
on public.patrimonio_lote_equipamentos for select to authenticated
using (
  auth.uid() is not null
  and (
    private.perfil_atual() in ('administrador', 'operador')
    or (
      private.perfil_atual() = 'gerente'
      and private.patrimonio_gerente_pode_ver_equipamento(equipamento_id)
    )
  )
);

create policy equipamentos_patrimonio_ler
on public.equipamentos_patrimonio for select to authenticated
using (
  auth.uid() is not null
  and (
    private.perfil_atual() in ('administrador', 'operador')
    or (
      private.perfil_atual() = 'gerente'
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
      and (
        (
          equipamento_id is not null
          and private.patrimonio_gerente_pode_ver_equipamento(equipamento_id)
        )
        or (
          equipamento_id is null
          and lote_id is not null
          and private.patrimonio_gerente_pode_ver_lote(lote_id)
        )
      )
    )
  )
);

revoke all on table public.equipamento_categorias from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_lotes from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_lote_equipamentos from public, anon, authenticated, service_role;
revoke all on table public.equipamentos_patrimonio from public, anon, authenticated, service_role;
revoke all on table public.patrimonio_eventos from public, anon, authenticated, service_role;

revoke all on sequence public.patrimonio_np_seq from public, anon, authenticated, service_role;
revoke all on sequence public.patrimonio_lote_seq from public, anon, authenticated, service_role;
revoke all on sequence public.equipamentos_patrimonio_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.patrimonio_eventos_id_seq from public, anon, authenticated, service_role;

grant select on table public.equipamento_categorias to authenticated, service_role;
grant select on table public.patrimonio_lotes to authenticated, service_role;
grant select on table public.patrimonio_lote_equipamentos to authenticated, service_role;
grant select on table public.equipamentos_patrimonio to authenticated, service_role;

grant select (
  id, public_id, evento, lote_id, patrimonio_id, equipamento_id,
  estado_anterior, estado_posterior, motivo, detalhes,
  autor_user_id, autor_nome_snapshot, autor_perfil_snapshot, criado_em
) on table public.patrimonio_eventos to authenticated;
grant select on table public.patrimonio_eventos to service_role;

revoke all on function public.patrimonio_preparar_lote(bigint[], uuid) from public, anon;
revoke all on function public.patrimonio_gerar_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_importar_legado(bigint, text, uuid) from public, anon;
revoke all on function public.patrimonio_emitir_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_iniciar_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_aplicar_etiqueta(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_conferir_etiqueta(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_reimprimir_etiqueta(uuid, text, uuid) from public, anon;
revoke all on function public.patrimonio_baixar(uuid, text, uuid) from public, anon;
revoke all on function public.patrimonio_anular(uuid, text, uuid) from public, anon;
revoke all on function public.patrimonio_concluir_lote(uuid, uuid) from public, anon;
revoke all on function public.patrimonio_cancelar_lote(uuid, text, uuid) from public, anon;

grant execute on function public.patrimonio_preparar_lote(bigint[], uuid) to authenticated, service_role;
grant execute on function public.patrimonio_gerar_lote(uuid, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_importar_legado(bigint, text, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_emitir_lote(uuid, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_iniciar_lote(uuid, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_aplicar_etiqueta(uuid, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_conferir_etiqueta(uuid, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_reimprimir_etiqueta(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_baixar(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_anular(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_concluir_lote(uuid, uuid) to authenticated, service_role;
grant execute on function public.patrimonio_cancelar_lote(uuid, text, uuid) to authenticated, service_role;

commit;
