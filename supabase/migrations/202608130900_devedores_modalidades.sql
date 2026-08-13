begin;

create table public.devedores_modalidades (
  id bigserial primary key,
  nome text not null,
  nome_normalizado text generated always as (lower(btrim(nome))) stored,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  versao bigint not null default 1,
  constraint devedores_modalidades_nome_check check (char_length(btrim(nome)) between 1 and 80),
  constraint devedores_modalidades_versao_check check (versao > 0)
);

create unique index devedores_modalidades_nome_ativo_uidx
  on public.devedores_modalidades (nome_normalizado)
  where ativo;

insert into public.devedores_modalidades (nome)
values ('ViaPix'), ('90 da Sorte'), ('Outros');

alter table public.devedores_modalidades enable row level security;

comment on table public.devedores_modalidades is
  'Catalogo isolado do modulo DEVEDORES. Nao reutiliza modalidades operacionais.';

commit;
