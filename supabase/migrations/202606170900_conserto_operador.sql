alter table public.equipamentos
  add column if not exists conserto_defeito text,
  add column if not exists conserto_assistencia text,
  add column if not exists conserto_previsao date,
  add column if not exists conserto_pix text,
  add column if not exists conserto_valor numeric default 0,
  add column if not exists conserto_nota_nome text,
  add column if not exists conserto_nota_arquivo text,
  add column if not exists conserto_solicitado_em timestamptz,
  add column if not exists conserto_solicitado_por uuid references auth.users(id);
