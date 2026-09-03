begin;

do $$
begin
  if exists (select 1 from public.patrimonio_lotes) then
    raise exception 'A evolucao contextual exige patrimonio_lotes vazio; revise uma estrategia de backfill.';
  end if;
end;
$$;

alter table public.patrimonio_lotes
  add column nome_amigavel text not null,
  add column contexto_tipo text not null,
  add column contexto_referencia text,
  add column contexto_label text not null,
  add column demanda_contexto_no_preparo integer not null;

alter table public.patrimonio_lotes
  add constraint patrimonio_lotes_nome_amigavel_check check (
    nome_amigavel = btrim(nome_amigavel)
    and char_length(nome_amigavel) between 3 and 160
  ),
  add constraint patrimonio_lotes_contexto_estruturado_check check (
    contexto_tipo in ('estoque', 'rota', 'ponto', 'gerente')
    and contexto_label = btrim(contexto_label)
    and char_length(contexto_label) between 1 and 200
    and (
      (contexto_tipo = 'estoque' and contexto_referencia is null and contexto_label = 'Estoque interno')
      or
      (contexto_tipo <> 'estoque'
        and contexto_referencia = btrim(contexto_referencia)
        and char_length(contexto_referencia) between 1 and 200)
    )
    and contexto = contexto_label
  ),
  add constraint patrimonio_lotes_demanda_contexto_check check (
    demanda_contexto_no_preparo >= 0
  );

comment on column public.patrimonio_lotes.nome_amigavel is
  'Nome humano do lote. O codigo PAT permanece como identidade tecnica e auditavel.';
comment on column public.patrimonio_lotes.demanda_contexto_no_preparo is
  'Demanda pendente do contexto, calculada transacionalmente pelo backend no preparo.';

create or replace function private.patrimonio_demanda_contexto(
  p_campanha_id uuid,
  p_contexto jsonb
)
returns table (
  contexto_tipo text,
  contexto_referencia text,
  contexto_label text,
  demanda integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_tipo text := lower(btrim(coalesce(p_contexto ->> 'tipo', '')));
  v_referencia text := nullif(btrim(coalesce(p_contexto ->> 'referencia', '')), '');
  v_label text;
  v_demanda integer;
  v_reservadas integer;
  v_ponto_id bigint;
begin
  if p_contexto is null or jsonb_typeof(p_contexto) <> 'object'
     or v_tipo not in ('estoque', 'rota', 'ponto', 'gerente') then
    raise exception 'Contexto planejado invalido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_contexto) chave
    where chave not in ('tipo', 'referencia')
  ) then
    raise exception 'Contexto planejado contem campos nao reconhecidos.' using errcode = '22023';
  end if;

  if v_tipo = 'estoque' then
    if v_referencia is not null then
      raise exception 'Estoque interno nao aceita referencia.' using errcode = '22023';
    end if;
    v_label := 'Estoque interno';
  elsif v_referencia is null then
    raise exception 'O contexto % exige referencia.', v_tipo using errcode = '22023';
  elsif v_tipo = 'ponto' then
    if v_referencia !~ '^[0-9]+$' then
      raise exception 'Referencia de ponto invalida.' using errcode = '22023';
    end if;
    v_ponto_id := v_referencia::bigint;
    select p.nome_fantasia into v_label from public.pontos p where p.id = v_ponto_id;
    if not found then raise exception 'Ponto do contexto nao encontrado.' using errcode = 'P0002'; end if;
    v_referencia := v_ponto_id::text;
  elsif v_tipo = 'rota' then
    select min(p.gerente) into v_label
    from public.pontos p
    where lower(btrim(p.gerente)) = lower(v_referencia);
    if v_label is null then raise exception 'Rota do contexto nao encontrada.' using errcode = 'P0002'; end if;
    v_referencia := v_label;
  else
    select min(e.gerente_responsavel) into v_label
    from public.equipamentos e
    where lower(btrim(e.gerente_responsavel)) = lower(v_referencia)
      and nullif(btrim(e.gerente_responsavel), '') is not null;
    if v_label is null then raise exception 'Gerente do contexto nao encontrado.' using errcode = 'P0002'; end if;
    v_referencia := v_label;
  end if;

  select count(*)::integer into v_demanda
  from public.patrimonio_campanha_equipamentos ce
  join public.equipamentos e on e.id = ce.equipamento_id
  join public.equipamento_categorias cat
    on cat.ativo and cat.patrimoniavel
   and lower(btrim(cat.nome)) = lower(btrim(e.categoria))
  where ce.campanha_id = p_campanha_id
    and ce.resolucao = 'pendente'
    and not exists (
      select 1 from public.equipamentos_patrimonio ep
      where ep.equipamento_id = e.id
        and ep.situacao in ('disponivel', 'vinculado', 'aplicado', 'conferido')
    )
    and case v_tipo
      when 'estoque' then
        e.status = 'Disponível'
        and nullif(btrim(coalesce(e.localizacao, '')), '') is null
        and nullif(btrim(coalesce(e.gerente_responsavel, '')), '') is null
      when 'ponto' then
        exists (
          select 1 from public.pontos p
          where p.id = v_ponto_id
            and lower(btrim(p.nome_fantasia)) = lower(btrim(e.localizacao))
        )
      when 'rota' then
        exists (
          select 1 from public.pontos p
          where lower(btrim(p.gerente)) = lower(v_referencia)
            and lower(btrim(p.nome_fantasia)) = lower(btrim(e.localizacao))
        )
      when 'gerente' then
        nullif(btrim(coalesce(e.localizacao, '')), '') is null
        and lower(btrim(e.gerente_responsavel)) = lower(v_referencia)
      else false
    end;

  select coalesce(sum(l.quantidade), 0)::integer into v_reservadas
  from public.patrimonio_lotes l
  where l.campanha_id = p_campanha_id
    and l.contexto_tipo = v_tipo
    and l.contexto_referencia is not distinct from v_referencia
    and l.situacao = 'preparado';

  return query select v_tipo, v_referencia, v_label, greatest(v_demanda - v_reservadas, 0);
end;
$$;

revoke all on function private.patrimonio_demanda_contexto(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.patrimonio_preparar_lote(
  p_campanha_id uuid,
  p_quantidade integer,
  p_contexto jsonb,
  p_nome_amigavel text,
  p_confirmar_excesso boolean,
  p_idempotencia uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_identidade record;
  v_idempotencia record;
  v_contexto record;
  v_payload jsonb;
  v_resultado jsonb;
  v_campanha public.patrimonio_campanhas%rowtype;
  v_lote_id uuid := gen_random_uuid();
  v_numero bigint;
  v_codigo text;
  v_nome text := btrim(coalesce(p_nome_amigavel, ''));
  v_pendentes integer;
  v_reservadas integer;
  v_saldo_pendente integer;
  v_excesso integer;
begin
  if auth.uid() is null or p_idempotencia is null then
    raise exception 'Autenticacao e chave de idempotencia sao obrigatorias.' using errcode = '42501';
  end if;
  select * into v_identidade from private.patrimonio_identidade_atual();
  if v_identidade.user_id is null or v_identidade.perfil is distinct from 'administrador' then
    raise exception 'Somente administrador pode preparar lote patrimonial.' using errcode = '42501';
  end if;
  if p_campanha_id is null or p_quantidade is null or p_quantidade not between 1 and 500 then
    raise exception 'Campanha e quantidade entre 1 e 500 sao obrigatorias.' using errcode = '22023';
  end if;
  if char_length(v_nome) not between 3 and 160 then
    raise exception 'Nome amigavel do lote invalido.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(p_idempotencia::text));
  select * into v_campanha from public.patrimonio_campanhas c
  where c.id = p_campanha_id for update;
  if not found then raise exception 'Campanha nao encontrada.' using errcode = 'P0002'; end if;
  if v_campanha.situacao <> 'ativa' then
    raise exception 'Somente campanha ativa aceita novos lotes.' using errcode = '55000';
  end if;

  perform 1
  from public.patrimonio_campanha_equipamentos ce
  join public.equipamentos e on e.id = ce.equipamento_id
  where ce.campanha_id = p_campanha_id
  for share of e;

  select * into v_contexto
  from private.patrimonio_demanda_contexto(p_campanha_id, p_contexto);

  v_payload := jsonb_build_object(
    'campanha_id', p_campanha_id,
    'quantidade', p_quantidade,
    'contexto', jsonb_build_object('tipo', v_contexto.contexto_tipo, 'referencia', v_contexto.contexto_referencia),
    'nome_amigavel', v_nome,
    'confirmar_excesso', coalesce(p_confirmar_excesso, false)
  );
  select * into v_idempotencia
  from private.patrimonio_idempotencia_obter('lote_preparado', p_idempotencia, v_payload);
  if v_idempotencia.encontrado then
    return (v_idempotencia.resultado ->> 'lote_id')::uuid;
  end if;

  select
    (select count(*)::integer from public.patrimonio_campanha_equipamentos ce
      where ce.campanha_id = p_campanha_id and ce.resolucao = 'pendente'),
    coalesce((select sum(l.quantidade)::integer from public.patrimonio_lotes l
      where l.campanha_id = p_campanha_id and l.situacao = 'preparado'), 0)
      + coalesce((select count(*)::integer from public.equipamentos_patrimonio ep
        join public.patrimonio_lotes l on l.id = ep.lote_origem_id
        where l.campanha_id = p_campanha_id
          and ep.situacao in ('disponivel', 'vinculado', 'aplicado')), 0)
  into v_pendentes, v_reservadas;
  v_saldo_pendente := greatest(v_pendentes - v_reservadas, 0);
  v_excesso := greatest(p_quantidade - v_contexto.demanda, 0);
  if v_excesso > 0 and p_confirmar_excesso is distinct from true then
    raise exception 'Quantidade excede em % a demanda do contexto; confirme explicitamente o excesso.', v_excesso
      using errcode = '22023',
            detail = jsonb_build_object('quantidade_solicitada', p_quantidade, 'demanda_contexto', v_contexto.demanda, 'quantidade_excedente', v_excesso)::text;
  end if;

  perform set_config('stockon.patrimonio_rpc', 'permitido', true);
  v_numero := nextval('public.patrimonio_lote_seq'::regclass);
  v_codigo := 'PAT-' || to_char(current_date, 'YYYYMM') || '-' || lpad(v_numero::text, 4, '0');
  insert into public.patrimonio_lotes (
    id, numero, codigo, campanha_id, quantidade, contexto,
    saldo_pendente_no_preparo, quantidade_excedente, excesso_confirmado,
    nome_amigavel, contexto_tipo, contexto_referencia, contexto_label, demanda_contexto_no_preparo,
    criado_por_user_id, criado_por_nome_snapshot, criado_por_perfil_snapshot
  ) values (
    v_lote_id, v_numero, v_codigo, p_campanha_id, p_quantidade, v_contexto.contexto_label,
    v_saldo_pendente, v_excesso, v_excesso > 0,
    v_nome, v_contexto.contexto_tipo, v_contexto.contexto_referencia, v_contexto.contexto_label, v_contexto.demanda,
    auth.uid(), v_identidade.usuario_nome, v_identidade.perfil
  );
  v_resultado := jsonb_build_object('lote_id', v_lote_id, 'codigo', v_codigo, 'quantidade', p_quantidade,
    'nome_amigavel', v_nome, 'demanda_contexto_no_preparo', v_contexto.demanda,
    'saldo_pendente_no_preparo', v_saldo_pendente, 'quantidade_excedente', v_excesso, 'excesso_confirmado', v_excesso > 0);
  perform private.patrimonio_registrar_evento('lote_preparado', p_campanha_id, null, v_lote_id, null, null, null,
    null, 'preparado', null, v_resultado - 'lote_id', p_idempotencia);
  perform private.patrimonio_idempotencia_registrar('lote_preparado', p_idempotencia, v_payload, v_resultado);
  return v_lote_id;
end;
$$;

revoke all on function public.patrimonio_preparar_lote(uuid, integer, text, boolean, uuid)
  from authenticated;
revoke all on function public.patrimonio_preparar_lote(uuid, integer, jsonb, text, boolean, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.patrimonio_preparar_lote(uuid, integer, jsonb, text, boolean, uuid)
  to authenticated;

create or replace view public.patrimonio_lotes_resumo_v
with (security_invoker = true)
as
select
  l.id, l.codigo, l.campanha_id, c.codigo as campanha_codigo, l.situacao,
  l.quantidade, l.contexto, l.saldo_pendente_no_preparo, l.quantidade_excedente,
  l.excesso_confirmado, l.impressoes,
  count(ep.id)::integer as geradas,
  count(ep.id) filter (where ep.situacao = 'disponivel')::integer as disponiveis,
  count(ep.id) filter (where ep.situacao = 'vinculado')::integer as vinculadas,
  count(ep.id) filter (where ep.situacao = 'aplicado')::integer as aplicadas,
  count(ep.id) filter (where ep.situacao = 'conferido')::integer as conferidas,
  count(ep.id) filter (where ep.situacao = 'anulado')::integer as anuladas,
  count(ep.id) filter (where ep.situacao = 'baixado')::integer as baixadas,
  l.preparado_em, l.gerado_em, l.concluido_em,
  l.nome_amigavel, l.contexto_tipo, l.contexto_referencia, l.contexto_label,
  l.demanda_contexto_no_preparo, c.nome as campanha_nome
from public.patrimonio_lotes l
join public.patrimonio_campanhas c on c.id = l.campanha_id
left join public.equipamentos_patrimonio ep on ep.lote_origem_id = l.id
group by l.id, c.id;

comment on view public.patrimonio_lotes_resumo_v is
  'Leitura consolidada do lote: identidade humana, contexto backend, demanda capturada e progresso das etiquetas.';

commit;
