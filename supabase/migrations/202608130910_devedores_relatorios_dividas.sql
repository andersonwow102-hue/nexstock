begin;

create table public.devedores_relatorios (
  id bigserial primary key,
  gerente_responsavel_id uuid not null,
  gerente_nome_snapshot text not null,
  tipo text not null,
  nome text not null,
  nome_fantasia text,
  endereco text not null,
  numero text not null,
  complemento text,
  bairro text,
  cidade text not null,
  estado text not null,
  telefone text not null,
  observacoes_cadastrais text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome_snapshot text not null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  versao bigint not null default 1,
  constraint devedores_relatorios_tipo_check check (tipo in ('pessoa', 'ponto')),
  constraint devedores_relatorios_nome_check check (char_length(btrim(nome)) between 1 and 200),
  constraint devedores_relatorios_endereco_check check (char_length(btrim(endereco)) between 1 and 300),
  constraint devedores_relatorios_numero_check check (char_length(btrim(numero)) between 1 and 30),
  constraint devedores_relatorios_cidade_check check (char_length(btrim(cidade)) between 1 and 150),
  constraint devedores_relatorios_estado_check check (estado ~ '^[A-Z]{2}$'),
  constraint devedores_relatorios_telefone_check check (char_length(btrim(telefone)) between 8 and 30),
  constraint devedores_relatorios_versao_check check (versao > 0)
);

create index devedores_relatorios_gerente_idx
  on public.devedores_relatorios (gerente_responsavel_id, criado_em desc);

create table public.devedores_dividas (
  id bigserial primary key,
  relatorio_id bigint not null unique references public.devedores_relatorios(id) on delete restrict,
  gerente_responsavel_id uuid not null,
  gerente_nome_snapshot text not null,
  valor_original numeric(14,2) not null,
  modalidade_id bigint not null references public.devedores_modalidades(id) on delete restrict,
  modalidade_nome_snapshot text not null,
  data_registro date not null,
  observacoes_originais text,
  relatorio_snapshot jsonb not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome_snapshot text not null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  versao bigint not null default 1,
  constraint devedores_dividas_valor_check check (valor_original > 0),
  constraint devedores_dividas_snapshot_check check (jsonb_typeof(relatorio_snapshot) = 'object'),
  constraint devedores_dividas_versao_check check (versao > 0)
);

create index devedores_dividas_gerente_idx
  on public.devedores_dividas (gerente_responsavel_id, data_registro desc);
create index devedores_dividas_modalidade_idx
  on public.devedores_dividas (modalidade_id);

alter table public.devedores_relatorios enable row level security;
alter table public.devedores_dividas enable row level security;

comment on table public.devedores_relatorios is
  'Relatorio cadastral isolado por divida e gerente; nao representa identidade global.';
comment on table public.devedores_dividas is
  'Dividas internas sem efeito em caixa, fechamento, despesas, estoque, pontos ou rotas.';

commit;
