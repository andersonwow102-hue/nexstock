-- Permite cadastrar um link HTTPS quando o APK ultrapassa o limite do Storage.

alter table public.modalidade_apps
add column if not exists download_url text not null default '';

alter table public.modalidade_apps
drop constraint if exists modalidade_apps_path_check;

alter table public.modalidade_apps
drop constraint if exists modalidade_apps_origem_check;

alter table public.modalidade_apps
add constraint modalidade_apps_origem_check
check (
  char_length(btrim(storage_path)) > 0
  or download_url ~ '^https://'
);
