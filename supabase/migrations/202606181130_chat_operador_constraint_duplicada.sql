alter table public.mensagens_internas
  drop constraint if exists mensagens_internas_destino_check;

alter table public.mensagens_internas
  drop constraint if exists mensagens_internas_destino_tipo_check;

alter table public.mensagens_internas
  add constraint mensagens_internas_destino_tipo_check
  check (destino_tipo in ('gerente', 'administracao', 'operador'));
