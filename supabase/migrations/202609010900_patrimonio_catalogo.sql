begin;

create table public.equipamento_categorias (
  codigo text primary key,
  nome text not null,
  ordem smallint not null unique,
  patrimoniavel boolean not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint equipamento_categorias_codigo_check check (
    codigo = lower(btrim(codigo))
    and codigo ~ '^[a-z0-9_]+$'
  ),
  constraint equipamento_categorias_nome_check check (
    nome = btrim(nome)
    and char_length(nome) between 1 and 80
  ),
  constraint equipamento_categorias_ordem_check check (ordem between 1 and 9)
);

create unique index equipamento_categorias_nome_normalizado_uidx
  on public.equipamento_categorias (lower(btrim(nome)));

insert into public.equipamento_categorias (codigo, nome, ordem, patrimoniavel)
values
  ('televisoes', 'Televisões', 1, true),
  ('terminais', 'Terminais', 2, true),
  ('impressoras', 'Impressoras', 3, true),
  ('tablets', 'Tablets', 4, true),
  ('carregadores', 'Carregadores', 5, true),
  ('maquina_de_brindes', 'Máquina de Brindes', 6, false),
  ('totens', 'Totens', 7, true),
  ('noteiro', 'Noteiro', 8, true),
  ('pdv_touchscreen', 'PDV Touchscreen', 9, true);

comment on table public.equipamento_categorias is
  'Catalogo fechado da Fase 1 patrimonial. Maquina de Brindes e explicitamente nao patrimoniavel.';

commit;
