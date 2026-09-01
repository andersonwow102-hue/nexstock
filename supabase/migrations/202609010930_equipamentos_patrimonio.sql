begin;

create table public.equipamentos_patrimonio (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  codigo text not null,
  numero bigint,
  equipamento_id bigint not null references public.equipamentos(id) on delete restrict,
  lote_id uuid references public.patrimonio_lotes(id) on delete restrict,
  origem text not null,
  situacao text not null,
  equipamento_nome_snapshot text not null,
  categoria_codigo_snapshot text not null
    references public.equipamento_categorias(codigo) on delete restrict,
  categoria_nome_snapshot text not null,
  localizacao_snapshot text not null default '',
  ponto_id_snapshot bigint,
  criado_por_user_id uuid not null,
  criado_por_nome_snapshot text not null,
  criado_por_perfil_snapshot text not null,
  criado_em timestamptz not null default now(),
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
  constraint equipamentos_patrimonio_codigo_key unique (codigo),
  constraint equipamentos_patrimonio_numero_key unique (numero),
  constraint equipamentos_patrimonio_codigo_check check (
    codigo = btrim(codigo)
    and char_length(codigo) between 1 and 80
  ),
  constraint equipamentos_patrimonio_numero_check check (
    numero is null or numero between 1 and 999999
  ),
  constraint equipamentos_patrimonio_origem_check check (origem in ('gerado', 'legado')),
  constraint equipamentos_patrimonio_origem_dados_check check (
    (origem = 'gerado'
      and lote_id is not null
      and numero is not null
      and codigo = 'NP-' || lpad(numero::text, 6, '0'))
    or
    (origem = 'legado' and lote_id is null and numero is null)
  ),
  constraint equipamentos_patrimonio_situacao_check check (
    situacao in ('gerado', 'emitido', 'em_aplicacao', 'aplicado', 'conferido', 'legado', 'baixado', 'anulado')
  ),
  constraint equipamentos_patrimonio_autoria_check check (
    criado_por_nome_snapshot = btrim(criado_por_nome_snapshot)
    and char_length(criado_por_nome_snapshot) between 1 and 200
    and criado_por_perfil_snapshot in ('administrador', 'operador', 'gerente', 'consulta')
  ),
  constraint equipamentos_patrimonio_reimpressoes_check check (reimpressoes >= 0),
  constraint equipamentos_patrimonio_versao_check check (versao > 0),
  constraint equipamentos_patrimonio_aplicacao_autoria_check check (
    (aplicado_em is null and aplicado_por_user_id is null and aplicado_por_nome_snapshot is null and aplicado_por_perfil_snapshot is null)
    or
    (aplicado_em is not null and aplicado_por_user_id is not null
      and aplicado_por_nome_snapshot is not null
      and aplicado_por_nome_snapshot = btrim(aplicado_por_nome_snapshot)
      and char_length(aplicado_por_nome_snapshot) between 1 and 200
      and aplicado_por_perfil_snapshot is not null
      and aplicado_por_perfil_snapshot in ('administrador', 'operador'))
  ),
  constraint equipamentos_patrimonio_conferencia_autoria_check check (
    (conferido_em is null and conferido_por_user_id is null and conferido_por_nome_snapshot is null and conferido_por_perfil_snapshot is null)
    or
    (conferido_em is not null and conferido_por_user_id is not null
      and conferido_por_nome_snapshot is not null
      and conferido_por_nome_snapshot = btrim(conferido_por_nome_snapshot)
      and char_length(conferido_por_nome_snapshot) between 1 and 200
      and conferido_por_perfil_snapshot is not null
      and conferido_por_perfil_snapshot in ('administrador', 'operador'))
  ),
  constraint equipamentos_patrimonio_baixa_check check (
    (situacao = 'baixado' and baixado_em is not null and baixado_por_user_id is not null
      and baixado_por_nome_snapshot is not null
      and baixado_por_nome_snapshot = btrim(baixado_por_nome_snapshot)
      and char_length(baixado_por_nome_snapshot) between 1 and 200
      and baixado_por_perfil_snapshot is not null
      and baixado_por_perfil_snapshot = 'administrador'
      and motivo_baixa is not null and char_length(btrim(motivo_baixa)) between 5 and 1000)
    or
    (situacao <> 'baixado' and baixado_em is null and baixado_por_user_id is null
      and baixado_por_nome_snapshot is null and baixado_por_perfil_snapshot is null and motivo_baixa is null)
  ),
  constraint equipamentos_patrimonio_anulacao_check check (
    (situacao = 'anulado' and anulado_em is not null and anulado_por_user_id is not null
      and anulado_por_nome_snapshot is not null
      and anulado_por_nome_snapshot = btrim(anulado_por_nome_snapshot)
      and char_length(anulado_por_nome_snapshot) between 1 and 200
      and anulado_por_perfil_snapshot is not null
      and anulado_por_perfil_snapshot = 'administrador'
      and motivo_anulacao is not null and char_length(btrim(motivo_anulacao)) between 5 and 1000)
    or
    (situacao <> 'anulado' and anulado_em is null and anulado_por_user_id is null
      and anulado_por_nome_snapshot is null and anulado_por_perfil_snapshot is null and motivo_anulacao is null)
  ),
  constraint equipamentos_patrimonio_aplicacao_check check (
    situacao not in ('aplicado', 'conferido') or aplicado_em is not null
  ),
  constraint equipamentos_patrimonio_conferencia_check check (
    situacao <> 'conferido' or conferido_em is not null
  )
);

create unique index equipamentos_patrimonio_equipamento_ativo_uidx
  on public.equipamentos_patrimonio (equipamento_id)
  where situacao not in ('baixado', 'anulado');

create index equipamentos_patrimonio_lote_idx
  on public.equipamentos_patrimonio (lote_id, id)
  where lote_id is not null;

create index equipamentos_patrimonio_equipamento_historico_idx
  on public.equipamentos_patrimonio (equipamento_id, criado_em desc);

comment on table public.equipamentos_patrimonio is
  'Registro canonico permanente do patrimonio. numero nulo e reservado a importacoes legadas controladas.';
comment on column public.equipamentos_patrimonio.codigo is
  'Codigo imutavel e unico. Gerados seguem NP-000001; legados preservam exatamente caixa e formato apos btrim.';
comment on column public.equipamentos_patrimonio.numero is
  'Numero da sequencia NP para gerados. Permanece nulo em registros legados.';

commit;
