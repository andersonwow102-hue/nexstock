begin;

create table public.patrimonio_campanhas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  situacao text not null default 'ativa',
  data_corte timestamptz not null,
  quantidade_snapshot integer not null,
  criado_por_user_id uuid not null,
  criado_por_nome_snapshot text not null,
  criado_por_perfil_snapshot text not null,
  criado_em timestamptz not null default now(),
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
  constraint patrimonio_campanhas_codigo_check check (
    codigo ~ '^CAMP-[0-9]{8}-[A-F0-9]{8}$'
  ),
  constraint patrimonio_campanhas_nome_check check (
    nome = btrim(nome) and char_length(nome) between 3 and 160
  ),
  constraint patrimonio_campanhas_situacao_check check (
    situacao in ('ativa', 'concluida', 'cancelada')
  ),
  constraint patrimonio_campanhas_quantidade_check check (quantidade_snapshot > 0),
  constraint patrimonio_campanhas_versao_check check (versao > 0),
  constraint patrimonio_campanhas_autoria_check check (
    criado_por_nome_snapshot = btrim(criado_por_nome_snapshot)
    and char_length(criado_por_nome_snapshot) between 1 and 200
    and criado_por_perfil_snapshot = 'administrador'
  ),
  constraint patrimonio_campanhas_conclusao_check check (
    (situacao = 'concluida'
      and concluido_em is not null
      and concluido_por_user_id is not null
      and concluido_por_nome_snapshot is not null
      and concluido_por_nome_snapshot = btrim(concluido_por_nome_snapshot)
      and char_length(concluido_por_nome_snapshot) between 1 and 200
      and concluido_por_perfil_snapshot = 'administrador'
      and cancelado_em is null)
    or
    (situacao <> 'concluida'
      and concluido_em is null
      and concluido_por_user_id is null
      and concluido_por_nome_snapshot is null
      and concluido_por_perfil_snapshot is null)
  ),
  constraint patrimonio_campanhas_cancelamento_check check (
    (situacao = 'cancelada'
      and cancelado_em is not null
      and cancelado_por_user_id is not null
      and cancelado_por_nome_snapshot is not null
      and cancelado_por_nome_snapshot = btrim(cancelado_por_nome_snapshot)
      and char_length(cancelado_por_nome_snapshot) between 1 and 200
      and cancelado_por_perfil_snapshot = 'administrador'
      and motivo_cancelamento is not null
      and char_length(btrim(motivo_cancelamento)) between 5 and 1000
      and concluido_em is null)
    or
    (situacao <> 'cancelada'
      and cancelado_em is null
      and cancelado_por_user_id is null
      and cancelado_por_nome_snapshot is null
      and cancelado_por_perfil_snapshot is null
      and motivo_cancelamento is null)
  )
);

create table public.patrimonio_campanha_equipamentos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.patrimonio_campanhas(id) on delete restrict,
  equipamento_id bigint references public.equipamentos(id) on delete set null,
  equipamento_id_snapshot bigint not null,
  categoria_codigo_snapshot text not null
    references public.equipamento_categorias(codigo) on delete restrict,
  resolucao text not null default 'pendente',
  resolucao_tipo text,
  resolucao_motivo text,
  resolvido_em timestamptz,
  resolvido_por_user_id uuid,
  resolvido_por_nome_snapshot text,
  resolvido_por_perfil_snapshot text,
  criado_em timestamptz not null default now(),
  unique (campanha_id, equipamento_id_snapshot),
  constraint patrimonio_campanha_equipamentos_snapshot_check check (equipamento_id_snapshot > 0),
  constraint patrimonio_campanha_equipamentos_resolucao_check check (
    resolucao in ('pendente', 'conferido', 'excecao')
  ),
  constraint patrimonio_campanha_equipamentos_desfecho_check check (
    (resolucao = 'pendente'
      and resolucao_tipo is null
      and resolucao_motivo is null
      and resolvido_em is null
      and resolvido_por_user_id is null
      and resolvido_por_nome_snapshot is null
      and resolvido_por_perfil_snapshot is null)
    or
    (resolucao = 'conferido'
      and resolucao_tipo = 'conferido'
      and resolucao_motivo is null
      and resolvido_em is not null
      and resolvido_por_user_id is not null
      and resolvido_por_nome_snapshot is not null
      and resolvido_por_nome_snapshot = btrim(resolvido_por_nome_snapshot)
      and char_length(resolvido_por_nome_snapshot) between 1 and 200
      and resolvido_por_perfil_snapshot in ('administrador', 'operador'))
    or
    (resolucao = 'excecao'
      and resolucao_tipo in ('equipamento_excluido', 'equipamento_baixado', 'inelegivel', 'outro')
      and resolucao_motivo is not null
      and char_length(btrim(resolucao_motivo)) between 5 and 1000
      and resolvido_em is not null
      and resolvido_por_user_id is not null
      and resolvido_por_nome_snapshot is not null
      and resolvido_por_nome_snapshot = btrim(resolvido_por_nome_snapshot)
      and char_length(resolvido_por_nome_snapshot) between 1 and 200
      and resolvido_por_perfil_snapshot = 'administrador')
  )
);

create unique index patrimonio_campanha_equipamentos_atual_uidx
  on public.patrimonio_campanha_equipamentos (campanha_id, equipamento_id)
  where equipamento_id is not null;

create index patrimonio_campanha_equipamentos_resolucao_idx
  on public.patrimonio_campanha_equipamentos (campanha_id, resolucao, equipamento_id_snapshot);

create table public.patrimonio_lotes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique,
  codigo text not null unique,
  campanha_id uuid not null references public.patrimonio_campanhas(id) on delete restrict,
  situacao text not null default 'preparado',
  quantidade integer not null,
  contexto text,
  saldo_pendente_no_preparo integer not null,
  quantidade_excedente integer not null,
  excesso_confirmado boolean not null,
  criado_por_user_id uuid not null,
  criado_por_nome_snapshot text not null,
  criado_por_perfil_snapshot text not null,
  preparado_em timestamptz not null default now(),
  gerado_em timestamptz,
  gerado_por_user_id uuid,
  gerado_por_nome_snapshot text,
  gerado_por_perfil_snapshot text,
  iniciado_em timestamptz,
  impressoes integer not null default 0,
  ultima_impressao_em timestamptz,
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
  constraint patrimonio_lotes_codigo_check check (
    codigo ~ '^PAT-[0-9]{6}-[0-9]{4,}$'
    and split_part(codigo, '-', 3) = lpad(numero::text, 4, '0')
  ),
  constraint patrimonio_lotes_situacao_check check (
    situacao in ('preparado', 'gerado', 'em_uso', 'concluido', 'cancelado')
  ),
  constraint patrimonio_lotes_quantidade_check check (quantidade between 1 and 500),
  constraint patrimonio_lotes_excesso_check check (
    saldo_pendente_no_preparo >= 0
    and quantidade_excedente = greatest(quantidade - saldo_pendente_no_preparo, 0)
    and excesso_confirmado = (quantidade_excedente > 0)
  ),
  constraint patrimonio_lotes_contexto_check check (
    contexto is null or (contexto = btrim(contexto) and char_length(contexto) between 1 and 300)
  ),
  constraint patrimonio_lotes_impressoes_check check (
    impressoes >= 0
    and ((impressoes = 0 and ultima_impressao_em is null) or (impressoes > 0 and ultima_impressao_em is not null))
  ),
  constraint patrimonio_lotes_versao_check check (versao > 0),
  constraint patrimonio_lotes_autoria_check check (
    criado_por_nome_snapshot = btrim(criado_por_nome_snapshot)
    and char_length(criado_por_nome_snapshot) between 1 and 200
    and criado_por_perfil_snapshot = 'administrador'
  ),
  constraint patrimonio_lotes_geracao_check check (
    (gerado_em is null
      and gerado_por_user_id is null
      and gerado_por_nome_snapshot is null
      and gerado_por_perfil_snapshot is null)
    or
    (gerado_em is not null
      and gerado_por_user_id is not null
      and gerado_por_nome_snapshot is not null
      and gerado_por_nome_snapshot = btrim(gerado_por_nome_snapshot)
      and char_length(gerado_por_nome_snapshot) between 1 and 200
      and gerado_por_perfil_snapshot = 'administrador')
  ),
  constraint patrimonio_lotes_conclusao_check check (
    (situacao = 'concluido'
      and concluido_em is not null
      and concluido_por_user_id is not null
      and concluido_por_nome_snapshot is not null
      and concluido_por_nome_snapshot = btrim(concluido_por_nome_snapshot)
      and char_length(concluido_por_nome_snapshot) between 1 and 200
      and concluido_por_perfil_snapshot = 'administrador'
      and cancelado_em is null)
    or
    (situacao <> 'concluido'
      and concluido_em is null
      and concluido_por_user_id is null
      and concluido_por_nome_snapshot is null
      and concluido_por_perfil_snapshot is null)
  ),
  constraint patrimonio_lotes_cancelamento_check check (
    (situacao = 'cancelado'
      and gerado_em is null
      and cancelado_em is not null
      and cancelado_por_user_id is not null
      and cancelado_por_nome_snapshot is not null
      and cancelado_por_nome_snapshot = btrim(cancelado_por_nome_snapshot)
      and char_length(cancelado_por_nome_snapshot) between 1 and 200
      and cancelado_por_perfil_snapshot = 'administrador'
      and motivo_cancelamento is not null
      and char_length(btrim(motivo_cancelamento)) between 5 and 1000)
    or
    (situacao <> 'cancelado'
      and cancelado_em is null
      and cancelado_por_user_id is null
      and cancelado_por_nome_snapshot is null
      and cancelado_por_perfil_snapshot is null
      and motivo_cancelamento is null)
  ),
  constraint patrimonio_lotes_marcos_check check (
    (situacao = 'preparado' and gerado_em is null and iniciado_em is null)
    or (situacao = 'gerado' and gerado_em is not null and iniciado_em is null)
    or (situacao = 'em_uso' and gerado_em is not null and iniciado_em is not null)
    or (situacao = 'concluido' and gerado_em is not null)
    or situacao = 'cancelado'
  )
);

create index patrimonio_campanhas_situacao_idx
  on public.patrimonio_campanhas (situacao, criado_em desc);

create index patrimonio_lotes_campanha_idx
  on public.patrimonio_lotes (campanha_id, situacao, preparado_em desc);

comment on table public.patrimonio_campanhas is
  'Campanha administrativa com meta derivada de snapshot explicito no momento do corte; migrations nunca criam campanhas reais.';
comment on table public.patrimonio_campanha_equipamentos is
  'Snapshot de pertencimento. Preserva o ID historico, mas contexto operacional continua vindo do equipamento atual.';
comment on table public.patrimonio_lotes is
  'Lotes de etiquetas livres vinculados a campanha. Nenhum equipamento e preassociado ao lote.';

commit;
