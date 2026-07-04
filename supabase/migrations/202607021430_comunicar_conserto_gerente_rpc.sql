-- Caminho controlado para gerente comunicar conserto.
-- Evita upsert direto na tabela protegida e grava somente o defeito comunicado.

create or replace function public.comunicar_conserto_gerente(
  p_equipamento_id bigint,
  p_defeito text,
  p_solicitado_em timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or private.perfil_atual() <> 'gerente' then
    raise exception 'Acesso negado para comunicar conserto.' using errcode = '42501';
  end if;

  if p_equipamento_id is null then
    raise exception 'Equipamento não informado.' using errcode = '22023';
  end if;

  if coalesce(trim(p_defeito), '') = '' then
    raise exception 'Informe o defeito identificado.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.equipamentos e
    where e.id = p_equipamento_id
  ) then
    raise exception 'Equipamento não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.consertos_equipamentos (
    equipamento_id,
    conserto_defeito,
    conserto_assistencia,
    conserto_previsao,
    conserto_pix,
    conserto_valor,
    conserto_nota_nome,
    conserto_nota_arquivo,
    conserto_solicitado_em,
    conserto_solicitado_por,
    atualizado_em
  )
  values (
    p_equipamento_id,
    public.normalize_text(trim(p_defeito)),
    null,
    null,
    null,
    0,
    null,
    null,
    coalesce(p_solicitado_em, now()),
    auth.uid(),
    now()
  )
  on conflict (equipamento_id) do update set
    conserto_defeito = excluded.conserto_defeito,
    conserto_assistencia = null,
    conserto_previsao = null,
    conserto_pix = null,
    conserto_valor = 0,
    conserto_nota_nome = null,
    conserto_nota_arquivo = null,
    conserto_solicitado_em = excluded.conserto_solicitado_em,
    conserto_solicitado_por = auth.uid(),
    atualizado_em = now();
end;
$$;

revoke all on function public.comunicar_conserto_gerente(bigint, text, timestamptz) from public, anon;
grant execute on function public.comunicar_conserto_gerente(bigint, text, timestamptz) to authenticated, service_role;
