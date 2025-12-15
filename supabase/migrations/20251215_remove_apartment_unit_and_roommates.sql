-- Remove unused property feature columns from apartments table.
-- Supabase migration (Postgres).

alter table public.apartments
  drop column if exists is_housing_unit,
  drop column if exists is_for_roommates;


