begin;

create table public.devedores_historico (
  id bigserial primary key,
  relatorio_id bigint references public.devedores_relatorios(id) on delete restrict,
  divida_id bigint references public.devedores_dividas(id) on delete restrict,
  entidade text not null,
  entidade_id bigint not null,
  acao text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  motivo text,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nome_snapshot text not null,
  perfil_snapshot text not null,
  correlation_id uuid not null,
  criado_em timestamptz not null default now(),
  constraint devedores_historico_entidade_check check (entidade in ('relatorio', 'divida')),
  constraint devedores_historico_acao_check check (char_length(btrim(acao)) between 1 and 100),
  constraint devedores_historico_motivo_check check (motivo is null or char_length(btrim(motivo)) between 1 and 1000),
  constraint devedores_historico_referencia_check check (
    relatorio_id is not null and divida_id is not null
    and (
      (entidade = 'relatorio' and entidade_id = relatorio_id)
      or (entidade = 'divida' and entidade_id = divida_id)
    )
  )
);

create index devedores_historico_relatorio_idx
  on public.devedores_historico (relatorio_id, criado_em desc);
create index devedores_historico_divida_idx
  on public.devedores_historico (divida_id, criado_em desc);
create index devedores_historico_correlation_idx
  on public.devedores_historico (correlation_id);

alter table public.devedores_historico enable row level security;

comment on table public.devedores_historico is
  'Auditoria append-only do modulo DEVEDORES.';

commit;
