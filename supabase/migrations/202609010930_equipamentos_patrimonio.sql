begin;

create or replace function private.patrimonio_novo_public_id()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with fonte as (
    select
      uuid_send(gen_random_uuid()) as base,
      uuid_send(gen_random_uuid()) as complemento
  ), bytes_aleatorios as (
    select set_byte(
      set_byte(base, 6, get_byte(complemento, 0)),
      8,
      get_byte(complemento, 1)
    ) as valor
    from fonte
  )
  select rtrim(translate(encode(valor, 'base64'), '+/', '-_'), '=')
  from bytes_aleatorios;
$$;

revoke all on function private.patrimonio_novo_public_id()
  from public, anon, authenticated, service_role;

create table public.equipamentos_patrimonio (
  id bigint generated always as identity primary key,
  public_id text not null default private.patrimonio_novo_public_id(),
  numero bigint not null,
  codigo text not null,
  equipamento_id bigint references public.equipamentos(id) on delete restrict,
  lote_origem_id uuid references public.patrimonio_lotes(id) on delete restrict,
  campanha_item_id uuid references public.patrimonio_campanha_equipamentos(id) on delete restrict,
  origem text not null,
  situacao text not null,
  criado_por_user_id uuid not null,
  criado_por_nome_snapshot text not null,
  criado_por_perfil_snapshot text not null,
  criado_em timestamptz not null default now(),
  vinculado_em timestamptz,
  vinculado_por_user_id uuid,
  vinculado_por_nome_snapshot text,
  vinculado_por_perfil_snapshot text,
  aplicado_em timestamptz,
  aplicado_por_user_id uuid,
  aplicado_por_nome_snapshot text,
  aplicado_por_perfil_snapshot text,
  conferido_em timestamptz,
  conferido_por_user_id uuid,
  conferido_por_nome_snapshot text,
  conferido_por_perfil_snapshot text,
  reimpressoes integer not null default 0,
  ultima_reimpressao_em timestamptz,
  baixado_em timestamptz,
  baixado_por_user_id uuid,
  baixado_por_nome_snapshot text,
  baixado_por_perfil_snapshot text,
  motivo_baixa text,
  anulado_em timestamptz,
  anulado_por_user_id uuid,
  anulado_por_nome_snapshot text,
  anulado_por_perfil_snapshot text,
  motivo_anulacao text,
  versao bigint not null default 1,
  constraint equipamentos_patrimonio_public_id_key unique (public_id),
  constraint equipamentos_patrimonio_public_id_check check (
    char_length(public_id) = 22
    and public_id ~ '^[A-Za-z0-9_-]{22}$'
  ),
  constraint equipamentos_patrimonio_codigo_key unique (codigo),
  constraint equipamentos_patrimonio_numero_key unique (numero),
  constraint equipamentos_patrimonio_numero_check check (numero between 1 and 999999),
  constraint equipamentos_patrimonio_codigo_check check (
    codigo = 'NP-' || lpad(numero::text, 6, '0')
  ),
  constraint equipamentos_patrimonio_origem_check check (
    origem in ('implantacao', 'cadastro')
  ),
  constraint equipamentos_patrimonio_origem_dados_check check (
    (origem = 'implantacao' and lote_origem_id is not null)
    or
    (origem = 'cadastro' and lote_origem_id is null and campanha_item_id is null)
  ),
  constraint equipamentos_patrimonio_situacao_check check (
    situacao in ('disponivel', 'vinculado', 'aplicado', 'conferido', 'anulado', 'baixado')
  ),
  constraint equipamentos_patrimonio_autoria_check check (
    criado_por_nome_snapshot = btrim(criado_por_nome_snapshot)
    and char_length(criado_por_nome_snapshot) between 1 and 200
    and criado_por_perfil_snapshot in ('administrador', 'operador', 'gerente')
  ),
  constraint equipamentos_patrimonio_vinculo_autoria_check check (
    (vinculado_em is null
      and vinculado_por_user_id is null
      and vinculado_por_nome_snapshot is null
      and vinculado_por_perfil_snapshot is null)
    or
    (vinculado_em is not null
      and vinculado_por_user_id is not null
      and vinculado_por_nome_snapshot is not null
      and vinculado_por_nome_snapshot = btrim(vinculado_por_nome_snapshot)
      and char_length(vinculado_por_nome_snapshot) between 1 and 200
      and vinculado_por_perfil_snapshot in ('administrador', 'operador', 'gerente'))
  ),
  constraint equipamentos_patrimonio_aplicacao_autoria_check check (
    (aplicado_em is null
      and aplicado_por_user_id is null
      and aplicado_por_nome_snapshot is null
      and aplicado_por_perfil_snapshot is null)
    or
    (aplicado_em is not null
      and aplicado_por_user_id is not null
      and aplicado_por_nome_snapshot is not null
      and aplicado_por_nome_snapshot = btrim(aplicado_por_nome_snapshot)
      and char_length(aplicado_por_nome_snapshot) between 1 and 200
      and aplicado_por_perfil_snapshot in ('administrador', 'operador'))
  ),
  constraint equipamentos_patrimonio_conferencia_autoria_check check (
    (conferido_em is null
      and conferido_por_user_id is null
      and conferido_por_nome_snapshot is null
      and conferido_por_perfil_snapshot is null)
    or
    (conferido_em is not null
      and conferido_por_user_id is not null
      and conferido_por_nome_snapshot is not null
      and conferido_por_nome_snapshot = btrim(conferido_por_nome_snapshot)
      and char_length(conferido_por_nome_snapshot) between 1 and 200
      and conferido_por_perfil_snapshot in ('administrador', 'operador'))
  ),
  constraint equipamentos_patrimonio_reimpressoes_check check (
    reimpressoes >= 0
    and ((reimpressoes = 0 and ultima_reimpressao_em is null)
      or (reimpressoes > 0 and ultima_reimpressao_em is not null))
  ),
  constraint equipamentos_patrimonio_versao_check check (versao > 0),
  constraint equipamentos_patrimonio_marcos_ordem_check check (
    (aplicado_em is null or (vinculado_em is not null and aplicado_em >= vinculado_em))
    and (conferido_em is null or (aplicado_em is not null and conferido_em >= aplicado_em))
    and (baixado_em is null or (conferido_em is not null and baixado_em >= conferido_em))
  ),
  constraint equipamentos_patrimonio_baixa_check check (
    (situacao = 'baixado'
      and equipamento_id is not null
      and vinculado_em is not null
      and aplicado_em is not null
      and conferido_em is not null
      and baixado_em is not null
      and baixado_por_user_id is not null
      and baixado_por_nome_snapshot is not null
      and baixado_por_nome_snapshot = btrim(baixado_por_nome_snapshot)
      and char_length(baixado_por_nome_snapshot) between 1 and 200
      and baixado_por_perfil_snapshot = 'administrador'
      and motivo_baixa is not null
      and char_length(btrim(motivo_baixa)) between 5 and 1000
      and anulado_em is null)
    or
    (situacao <> 'baixado'
      and baixado_em is null
      and baixado_por_user_id is null
      and baixado_por_nome_snapshot is null
      and baixado_por_perfil_snapshot is null
      and motivo_baixa is null)
  ),
  constraint equipamentos_patrimonio_anulacao_check check (
    (situacao = 'anulado'
      and conferido_em is null
      and baixado_em is null
      and anulado_em is not null
      and anulado_por_user_id is not null
      and anulado_por_nome_snapshot is not null
      and anulado_por_nome_snapshot = btrim(anulado_por_nome_snapshot)
      and char_length(anulado_por_nome_snapshot) between 1 and 200
      and anulado_por_perfil_snapshot = 'administrador'
      and motivo_anulacao is not null
      and char_length(btrim(motivo_anulacao)) between 5 and 1000)
    or
    (situacao <> 'anulado'
      and anulado_em is null
      and anulado_por_user_id is null
      and anulado_por_nome_snapshot is null
      and anulado_por_perfil_snapshot is null
      and motivo_anulacao is null)
  ),
  constraint equipamentos_patrimonio_estado_dados_check check (
    (situacao = 'disponivel'
      and origem = 'implantacao'
      and equipamento_id is null
      and campanha_item_id is null
      and vinculado_em is null
      and aplicado_em is null
      and conferido_em is null)
    or
    (situacao = 'vinculado'
      and equipamento_id is not null
      and vinculado_em is not null
      and aplicado_em is null
      and conferido_em is null
      and (origem = 'cadastro' or campanha_item_id is not null))
    or
    (situacao = 'aplicado'
      and equipamento_id is not null
      and vinculado_em is not null
      and aplicado_em is not null
      and conferido_em is null
      and (origem = 'cadastro' or campanha_item_id is not null))
    or
    (situacao = 'conferido'
      and equipamento_id is not null
      and vinculado_em is not null
      and aplicado_em is not null
      and conferido_em is not null
      and (origem = 'cadastro' or campanha_item_id is not null))
    or
    (situacao = 'anulado'
      and (
        (equipamento_id is null
          and campanha_item_id is null
          and vinculado_em is null
          and aplicado_em is null)
        or
        (equipamento_id is not null
          and vinculado_em is not null
          and (origem = 'cadastro' or campanha_item_id is not null))
      ))
    or
    situacao = 'baixado'
  )
);

create unique index equipamentos_patrimonio_equipamento_ativo_uidx
  on public.equipamentos_patrimonio (equipamento_id)
  where equipamento_id is not null and situacao not in ('anulado', 'baixado');

create unique index equipamentos_patrimonio_campanha_item_ativo_uidx
  on public.equipamentos_patrimonio (campanha_item_id)
  where campanha_item_id is not null and situacao not in ('anulado', 'baixado');

create index equipamentos_patrimonio_lote_idx
  on public.equipamentos_patrimonio (lote_origem_id, situacao, numero)
  where lote_origem_id is not null;

create index equipamentos_patrimonio_equipamento_historico_idx
  on public.equipamentos_patrimonio (equipamento_id, criado_em desc)
  where equipamento_id is not null;

create table public.equipamentos_patrimonio_legados (
  id bigint generated always as identity primary key,
  equipamento_id bigint references public.equipamentos(id) on delete set null,
  equipamento_id_snapshot bigint not null,
  codigo text not null,
  codigo_normalizado text generated always as (lower(btrim(codigo))) stored,
  categoria_codigo_snapshot text not null
    references public.equipamento_categorias(codigo) on delete restrict,
  fonte text not null default 'equipamentos.patrimonio',
  importado_por_user_id uuid not null,
  importado_por_nome_snapshot text not null,
  importado_por_perfil_snapshot text not null,
  importado_em timestamptz not null default now(),
  unique (equipamento_id_snapshot, codigo_normalizado),
  constraint equipamentos_patrimonio_legados_equipamento_check check (equipamento_id_snapshot > 0),
  constraint equipamentos_patrimonio_legados_codigo_check check (
    codigo = btrim(codigo)
    and char_length(codigo) between 1 and 80
    and upper(codigo) !~ '^NP-[0-9]{6}$'
  ),
  constraint equipamentos_patrimonio_legados_fonte_check check (
    fonte = 'equipamentos.patrimonio'
  ),
  constraint equipamentos_patrimonio_legados_autoria_check check (
    importado_por_nome_snapshot = btrim(importado_por_nome_snapshot)
    and char_length(importado_por_nome_snapshot) between 1 and 200
    and importado_por_perfil_snapshot = 'administrador'
  )
);

create index equipamentos_patrimonio_legados_equipamento_idx
  on public.equipamentos_patrimonio_legados (equipamento_id, importado_em desc)
  where equipamento_id is not null;

comment on table public.equipamentos_patrimonio is
  'Identidade NP canonica. Etiquetas de implantacao nascem disponiveis e sem equipamento; cadastro futuro nasce vinculado.';
comment on column public.equipamentos_patrimonio.public_id is
  'Token opaco URL-safe de 22 caracteres e 128 bits de entropia, usado somente no deep link autenticado do QR; nao e credencial nem codigo patrimonial.';
comment on table public.equipamentos_patrimonio_legados is
  'Referencias anteriores separadas do namespace NP. Nao possuem public_id, QR operacional nem consumo de sequencia.';

commit;
