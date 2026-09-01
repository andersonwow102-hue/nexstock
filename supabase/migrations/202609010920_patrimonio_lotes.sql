begin;

create table public.patrimonio_lotes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique,
  codigo text not null unique,
  origem text not null,
  situacao text not null default 'preparado',
  quantidade integer not null,
  criado_por_user_id uuid not null,
  criado_por_nome_snapshot text not null,
  criado_por_perfil_snapshot text not null,
  preparado_em timestamptz not null default now(),
  gerado_em timestamptz,
  gerado_por_user_id uuid,
  gerado_por_nome_snapshot text,
  gerado_por_perfil_snapshot text,
  emitido_em timestamptz,
  emitido_por_user_id uuid,
  emitido_por_nome_snapshot text,
  emitido_por_perfil_snapshot text,
  iniciado_em timestamptz,
  iniciado_por_user_id uuid,
  iniciado_por_nome_snapshot text,
  iniciado_por_perfil_snapshot text,
  concluido_em timestamptz,
  concluido_por_user_id uuid,
  concluido_por_nome_snapshot text,
  concluido_por_perfil_snapshot text,
  cancelado_em timestamptz,
  cancelado_por_user_id uuid,
  cancelado_por_nome_snapshot text,
  cancelado_por_perfil_snapshot text,
  motivo_cancelamento text,
  versao bigint not null default 1,
  constraint patrimonio_lotes_situacao_check check (
    situacao in ('preparado', 'gerado', 'emitido', 'em_aplicacao', 'concluido', 'cancelado')
  ),
  constraint patrimonio_lotes_numero_check check (numero between 1 and 9999),
  constraint patrimonio_lotes_codigo_check check (
    codigo ~ '^PAT-[0-9]{6}-[0-9]{4}$'
    and right(codigo, 4) = lpad(numero::text, 4, '0')
  ),
  constraint patrimonio_lotes_origem_check check (origem in ('novo', 'legado')),
  constraint patrimonio_lotes_quantidade_check check (quantidade between 1 and 500),
  constraint patrimonio_lotes_autoria_check check (
    criado_por_nome_snapshot = btrim(criado_por_nome_snapshot)
    and char_length(criado_por_nome_snapshot) between 1 and 200
    and criado_por_perfil_snapshot in ('administrador', 'operador', 'gerente', 'consulta')
  ),
  constraint patrimonio_lotes_versao_check check (versao > 0),
  constraint patrimonio_lotes_autoria_geracao_check check (
    (gerado_em is null and gerado_por_user_id is null and gerado_por_nome_snapshot is null and gerado_por_perfil_snapshot is null)
    or
    (gerado_em is not null and gerado_por_user_id is not null
      and gerado_por_nome_snapshot is not null
      and gerado_por_nome_snapshot = btrim(gerado_por_nome_snapshot)
      and char_length(gerado_por_nome_snapshot) between 1 and 200
      and gerado_por_perfil_snapshot is not null
      and gerado_por_perfil_snapshot = 'administrador')
  ),
  constraint patrimonio_lotes_autoria_emissao_check check (
    (emitido_em is null and emitido_por_user_id is null and emitido_por_nome_snapshot is null and emitido_por_perfil_snapshot is null)
    or
    (emitido_em is not null and emitido_por_user_id is not null
      and emitido_por_nome_snapshot is not null
      and emitido_por_nome_snapshot = btrim(emitido_por_nome_snapshot)
      and char_length(emitido_por_nome_snapshot) between 1 and 200
      and emitido_por_perfil_snapshot is not null
      and emitido_por_perfil_snapshot = 'administrador')
  ),
  constraint patrimonio_lotes_autoria_inicio_check check (
    (iniciado_em is null and iniciado_por_user_id is null and iniciado_por_nome_snapshot is null and iniciado_por_perfil_snapshot is null)
    or
    (iniciado_em is not null and iniciado_por_user_id is not null
      and iniciado_por_nome_snapshot is not null
      and iniciado_por_nome_snapshot = btrim(iniciado_por_nome_snapshot)
      and char_length(iniciado_por_nome_snapshot) between 1 and 200
      and iniciado_por_perfil_snapshot is not null
      and iniciado_por_perfil_snapshot = 'administrador')
  ),
  constraint patrimonio_lotes_autoria_conclusao_check check (
    (concluido_em is null and concluido_por_user_id is null and concluido_por_nome_snapshot is null and concluido_por_perfil_snapshot is null)
    or
    (concluido_em is not null and concluido_por_user_id is not null
      and concluido_por_nome_snapshot is not null
      and concluido_por_nome_snapshot = btrim(concluido_por_nome_snapshot)
      and char_length(concluido_por_nome_snapshot) between 1 and 200
      and concluido_por_perfil_snapshot is not null
      and concluido_por_perfil_snapshot = 'administrador')
  ),
  constraint patrimonio_lotes_autoria_cancelamento_check check (
    (cancelado_em is null and cancelado_por_user_id is null and cancelado_por_nome_snapshot is null and cancelado_por_perfil_snapshot is null)
    or
    (cancelado_em is not null and cancelado_por_user_id is not null
      and cancelado_por_nome_snapshot is not null
      and cancelado_por_nome_snapshot = btrim(cancelado_por_nome_snapshot)
      and char_length(cancelado_por_nome_snapshot) between 1 and 200
      and cancelado_por_perfil_snapshot is not null
      and cancelado_por_perfil_snapshot = 'administrador')
  ),
  constraint patrimonio_lotes_cancelamento_check check (
    (situacao = 'cancelado'
      and cancelado_em is not null
      and concluido_em is null
      and motivo_cancelamento is not null
      and char_length(btrim(motivo_cancelamento)) between 5 and 1000)
    or
    (situacao <> 'cancelado' and cancelado_em is null and motivo_cancelamento is null)
  ),
  constraint patrimonio_lotes_marcos_check check (
    (situacao = 'preparado'
      and gerado_em is null and emitido_em is null and iniciado_em is null and concluido_em is null)
    or
    (situacao = 'gerado'
      and gerado_em is not null and emitido_em is null and iniciado_em is null and concluido_em is null)
    or
    (situacao = 'emitido'
      and gerado_em is not null and emitido_em is not null and iniciado_em is null and concluido_em is null)
    or
    (situacao = 'em_aplicacao'
      and gerado_em is not null and emitido_em is not null and iniciado_em is not null and concluido_em is null)
    or
    (situacao = 'concluido'
      and gerado_em is not null and emitido_em is not null and iniciado_em is not null and concluido_em is not null)
    or situacao = 'cancelado'
  )
);

create table public.patrimonio_lote_equipamentos (
  lote_id uuid not null references public.patrimonio_lotes(id) on delete restrict,
  equipamento_id bigint references public.equipamentos(id) on delete set null,
  ordem integer not null,
  equipamento_nome_snapshot text not null,
  categoria_codigo_snapshot text not null
    references public.equipamento_categorias(codigo) on delete restrict,
  categoria_nome_snapshot text not null,
  localizacao_snapshot text not null default '',
  ponto_id_snapshot bigint,
  criado_em timestamptz not null default now(),
  primary key (lote_id, ordem),
  unique (lote_id, equipamento_id),
  constraint patrimonio_lote_equipamentos_ordem_check check (ordem between 1 and 500),
  constraint patrimonio_lote_equipamentos_categoria_check check (
    categoria_nome_snapshot = btrim(categoria_nome_snapshot)
    and char_length(categoria_nome_snapshot) between 1 and 80
  ),
  constraint patrimonio_lote_equipamentos_localizacao_check check (
    localizacao_snapshot = btrim(localizacao_snapshot)
  )
);

create index patrimonio_lotes_situacao_idx
  on public.patrimonio_lotes (situacao, preparado_em desc);

create index patrimonio_lote_equipamentos_equipamento_idx
  on public.patrimonio_lote_equipamentos (equipamento_id, lote_id);

comment on table public.patrimonio_lotes is
  'Lotes permanentes de etiquetas. O codigo local PAT-YYYYMM-0001 e independente da sequencia NP dos ativos.';
comment on table public.patrimonio_lote_equipamentos is
  'Selecao e snapshots validados na preparacao. A geracao revalida os dados atuais antes de reservar numeros.';

commit;
