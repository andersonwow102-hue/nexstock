-- Etapas financeiras do conserto: operador solicita pagamento e admin confirma.

alter table public.consertos_equipamentos
  add column if not exists conserto_forma_pagamento text,
  add column if not exists conserto_retirada_em date,
  add column if not exists conserto_pagamento_status text,
  add column if not exists conserto_pagamento_solicitado_em timestamptz,
  add column if not exists conserto_pagamento_solicitado_por uuid references auth.users(id),
  add column if not exists conserto_pagamento_confirmado_em timestamptz,
  add column if not exists conserto_pagamento_confirmado_por uuid references auth.users(id);

update public.consertos_equipamentos
set conserto_pagamento_status = case
  when conserto_pagamento_confirmado_em is not null then 'pago'
  when coalesce(conserto_valor, 0) > 0 or coalesce(conserto_pix, '') <> '' or coalesce(conserto_nota_arquivo, '') <> '' then 'solicitado'
  when coalesce(conserto_defeito, '') <> '' then 'comunicado'
  else null
end
where conserto_pagamento_status is null;

alter table public.consertos_equipamentos
  drop constraint if exists conserto_pagamento_status_check,
  add constraint conserto_pagamento_status_check
    check (
      conserto_pagamento_status is null
      or conserto_pagamento_status in ('comunicado', 'solicitado', 'pago')
    );

drop policy if exists consertos_equipamentos_gerente_comunicar on public.consertos_equipamentos;
create policy consertos_equipamentos_gerente_comunicar
on public.consertos_equipamentos
for insert to authenticated
with check (
  private.perfil_atual() = 'gerente'
  and coalesce(conserto_defeito, '') <> ''
  and coalesce(conserto_assistencia, '') = ''
  and conserto_previsao is null
  and coalesce(conserto_pix, '') = ''
  and coalesce(conserto_valor, 0) = 0
  and coalesce(conserto_nota_nome, '') = ''
  and coalesce(conserto_nota_arquivo, '') = ''
  and coalesce(conserto_forma_pagamento, '') = ''
  and conserto_retirada_em is null
  and coalesce(conserto_pagamento_status, 'comunicado') = 'comunicado'
  and conserto_pagamento_solicitado_em is null
  and conserto_pagamento_solicitado_por is null
  and conserto_pagamento_confirmado_em is null
  and conserto_pagamento_confirmado_por is null
  and (conserto_solicitado_por is null or conserto_solicitado_por = auth.uid())
  and exists (
    select 1
    from public.equipamentos e
    where e.id = public.consertos_equipamentos.equipamento_id
  )
);

drop policy if exists consertos_equipamentos_gerente_atualizar_comunicado on public.consertos_equipamentos;
create policy consertos_equipamentos_gerente_atualizar_comunicado
on public.consertos_equipamentos
for update to authenticated
using (
  private.perfil_atual() = 'gerente'
  and exists (
    select 1
    from public.equipamentos e
    where e.id = public.consertos_equipamentos.equipamento_id
  )
)
with check (
  private.perfil_atual() = 'gerente'
  and coalesce(conserto_defeito, '') <> ''
  and coalesce(conserto_assistencia, '') = ''
  and conserto_previsao is null
  and coalesce(conserto_pix, '') = ''
  and coalesce(conserto_valor, 0) = 0
  and coalesce(conserto_nota_nome, '') = ''
  and coalesce(conserto_nota_arquivo, '') = ''
  and coalesce(conserto_forma_pagamento, '') = ''
  and conserto_retirada_em is null
  and coalesce(conserto_pagamento_status, 'comunicado') = 'comunicado'
  and conserto_pagamento_solicitado_em is null
  and conserto_pagamento_solicitado_por is null
  and conserto_pagamento_confirmado_em is null
  and conserto_pagamento_confirmado_por is null
  and (conserto_solicitado_por is null or conserto_solicitado_por = auth.uid())
  and exists (
    select 1
    from public.equipamentos e
    where e.id = public.consertos_equipamentos.equipamento_id
  )
);

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
    conserto_pagamento_status,
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
    'comunicado',
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
    conserto_forma_pagamento = null,
    conserto_retirada_em = null,
    conserto_pagamento_status = 'comunicado',
    conserto_pagamento_solicitado_em = null,
    conserto_pagamento_solicitado_por = null,
    conserto_pagamento_confirmado_em = null,
    conserto_pagamento_confirmado_por = null,
    conserto_solicitado_em = excluded.conserto_solicitado_em,
    conserto_solicitado_por = auth.uid(),
    atualizado_em = now();
end;
$$;

revoke all on function public.comunicar_conserto_gerente(bigint, text, timestamptz) from public, anon;
grant execute on function public.comunicar_conserto_gerente(bigint, text, timestamptz) to authenticated, service_role;
