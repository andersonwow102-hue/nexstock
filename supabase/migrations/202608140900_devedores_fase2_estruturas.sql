begin;

alter table public.devedores_historico
  drop constraint devedores_historico_entidade_check,
  drop constraint devedores_historico_referencia_check;

alter table public.devedores_historico
  add constraint devedores_historico_entidade_check check (
    entidade in ('relatorio', 'divida', 'negociacao', 'parcela', 'pagamento', 'estorno')
  ),
  add constraint devedores_historico_referencia_check check (
    relatorio_id is not null and divida_id is not null
    and entidade_id > 0
    and (
      entidade not in ('relatorio', 'divida')
      or (entidade = 'relatorio' and entidade_id = relatorio_id)
      or (entidade = 'divida' and entidade_id = divida_id)
    )
  );

create table public.devedores_negociacoes (
  id bigserial primary key,
  divida_id bigint not null references public.devedores_dividas(id) on delete restrict,
  negociacao_anterior_id bigint references public.devedores_negociacoes(id) on delete restrict,
  forma_pagamento text not null,
  valor_negociado numeric(14,2) not null,
  data_prevista_quitacao date,
  quantidade_parcelas integer,
  primeiro_vencimento date,
  observacoes text,
  situacao text not null default 'ativa',
  motivo_substituicao text,
  idempotencia uuid not null,
  criado_por uuid not null references auth.users(id) on delete restrict,
  criado_por_nome_snapshot text not null,
  criado_por_perfil_snapshot text not null,
  criado_em timestamptz not null default now(),
  substituida_por uuid references auth.users(id) on delete restrict,
  substituida_em timestamptz,
  versao bigint not null default 1,
  constraint devedores_negociacoes_forma_check check (forma_pagamento in ('vista', 'parcelada')),
  constraint devedores_negociacoes_valor_check check (valor_negociado > 0),
  constraint devedores_negociacoes_situacao_check check (situacao in ('ativa', 'substituida')),
  constraint devedores_negociacoes_observacoes_check check (observacoes is null or char_length(btrim(observacoes)) between 1 and 2000),
  constraint devedores_negociacoes_motivo_check check (motivo_substituicao is null or char_length(btrim(motivo_substituicao)) between 1 and 1000),
  constraint devedores_negociacoes_versao_check check (versao > 0),
  constraint devedores_negociacoes_campos_forma_check check (
    (forma_pagamento = 'vista' and data_prevista_quitacao is not null and quantidade_parcelas is null and primeiro_vencimento is null)
    or
    (forma_pagamento = 'parcelada' and data_prevista_quitacao is null and quantidade_parcelas between 1 and 240 and primeiro_vencimento is not null)
  ),
  constraint devedores_negociacoes_substituicao_check check (
    (situacao = 'ativa' and motivo_substituicao is null and substituida_por is null and substituida_em is null)
    or
    (situacao = 'substituida' and motivo_substituicao is not null and substituida_por is not null and substituida_em is not null)
  ),
  unique (criado_por, idempotencia),
  unique (id, divida_id)
);

create unique index devedores_negociacoes_ativa_uidx
  on public.devedores_negociacoes (divida_id)
  where situacao = 'ativa';
create index devedores_negociacoes_divida_idx
  on public.devedores_negociacoes (divida_id, criado_em desc);

create table public.devedores_parcelas (
  id bigserial primary key,
  negociacao_id bigint not null references public.devedores_negociacoes(id) on delete restrict,
  divida_id bigint not null references public.devedores_dividas(id) on delete restrict,
  numero integer not null,
  valor numeric(14,2) not null,
  vencimento date not null,
  criado_em timestamptz not null default now(),
  constraint devedores_parcelas_numero_check check (numero > 0),
  constraint devedores_parcelas_valor_check check (valor > 0),
  unique (negociacao_id, numero),
  unique (id, negociacao_id, divida_id),
  foreign key (negociacao_id, divida_id)
    references public.devedores_negociacoes(id, divida_id) on delete restrict
);

create index devedores_parcelas_divida_idx
  on public.devedores_parcelas (divida_id, vencimento);

create table public.devedores_pagamentos (
  id bigserial primary key,
  divida_id bigint not null references public.devedores_dividas(id) on delete restrict,
  negociacao_id bigint not null references public.devedores_negociacoes(id) on delete restrict,
  parcela_id bigint references public.devedores_parcelas(id) on delete restrict,
  valor numeric(14,2) not null,
  data_pagamento date not null,
  observacao text,
  idempotencia uuid not null,
  registrado_por uuid not null references auth.users(id) on delete restrict,
  registrado_por_nome_snapshot text not null,
  registrado_por_perfil_snapshot text not null,
  registrado_em timestamptz not null default now(),
  constraint devedores_pagamentos_valor_check check (valor > 0),
  constraint devedores_pagamentos_observacao_check check (observacao is null or char_length(btrim(observacao)) between 1 and 2000),
  unique (registrado_por, idempotencia),
  unique (id, divida_id),
  foreign key (negociacao_id, divida_id)
    references public.devedores_negociacoes(id, divida_id) on delete restrict,
  foreign key (parcela_id, negociacao_id, divida_id)
    references public.devedores_parcelas(id, negociacao_id, divida_id) on delete restrict
);

create index devedores_pagamentos_divida_idx
  on public.devedores_pagamentos (divida_id, registrado_em desc);
create index devedores_pagamentos_negociacao_idx
  on public.devedores_pagamentos (negociacao_id, registrado_em desc);
create index devedores_pagamentos_parcela_idx
  on public.devedores_pagamentos (parcela_id, registrado_em desc)
  where parcela_id is not null;

create table public.devedores_pagamentos_estornos (
  id bigserial primary key,
  pagamento_id bigint not null unique references public.devedores_pagamentos(id) on delete restrict,
  divida_id bigint not null references public.devedores_dividas(id) on delete restrict,
  motivo text not null,
  idempotencia uuid not null,
  estornado_por uuid not null references auth.users(id) on delete restrict,
  estornado_por_nome_snapshot text not null,
  estornado_por_perfil_snapshot text not null,
  estornado_em timestamptz not null default now(),
  constraint devedores_pagamentos_estornos_motivo_check check (char_length(btrim(motivo)) between 1 and 1000),
  unique (estornado_por, idempotencia),
  foreign key (pagamento_id, divida_id)
    references public.devedores_pagamentos(id, divida_id) on delete restrict
);

create index devedores_pagamentos_estornos_divida_idx
  on public.devedores_pagamentos_estornos (divida_id, estornado_em desc);

alter table public.devedores_negociacoes enable row level security;
alter table public.devedores_parcelas enable row level security;
alter table public.devedores_pagamentos enable row level security;
alter table public.devedores_pagamentos_estornos enable row level security;

comment on table public.devedores_pagamentos_estornos is
  'Estornos append-only. O pagamento original nunca e atualizado nem excluido.';

commit;
