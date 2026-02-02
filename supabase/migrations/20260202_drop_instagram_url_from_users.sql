-- Remove deprecated Instagram field from profiles table.
-- The app no longer collects/displays this field.

alter table public.users
drop column if exists instagram_url;

