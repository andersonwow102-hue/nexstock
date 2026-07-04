-- Permite dois APKs para 90 da Sorte: TV e Terminal.
-- As demais modalidades continuam usando o tipo padrao.

alter table public.modalidade_apps
add column if not exists app_tipo text not null default 'padrao';

update public.modalidade_apps
set app_tipo = 'terminal'
where modalidade = '90 da Sorte'
  and app_tipo = 'padrao';

alter table public.modalidade_apps
drop constraint if exists modalidade_apps_modalidade_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'modalidade_apps_modalidade_app_tipo_key'
      and conrelid = 'public.modalidade_apps'::regclass
  ) then
    alter table public.modalidade_apps
    add constraint modalidade_apps_modalidade_app_tipo_key unique (modalidade, app_tipo);
  end if;
end $$;

alter table public.modalidade_apps
drop constraint if exists modalidade_apps_tipo_check;

alter table public.modalidade_apps
add constraint modalidade_apps_tipo_check
check (
  char_length(btrim(app_tipo)) > 0
  and (
    (modalidade = '90 da Sorte' and app_tipo in ('tv', 'terminal'))
    or (modalidade <> '90 da Sorte' and app_tipo = 'padrao')
  )
);
