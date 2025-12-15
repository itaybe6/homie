-- Add property feature columns to apartments table.
-- Generated for Supabase (Postgres).

alter table public.apartments
  add column if not exists balcony_count smallint not null default 0,
  add column if not exists wheelchair_accessible boolean not null default false,
  add column if not exists has_air_conditioning boolean not null default false,
  add column if not exists has_bars boolean not null default false,
  add column if not exists has_solar_heater boolean not null default false,
  add column if not exists is_housing_unit boolean not null default false,
  add column if not exists is_furnished boolean not null default false,
  add column if not exists has_safe_room boolean not null default false,
  add column if not exists is_renovated boolean not null default false,
  add column if not exists pets_allowed boolean not null default false,
  add column if not exists has_elevator boolean not null default false,
  add column if not exists kosher_kitchen boolean not null default false,
  add column if not exists is_for_roommates boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_balcony_count_check'
  ) then
    alter table public.apartments
      add constraint apartments_balcony_count_check
      check (balcony_count between 0 and 3);
  end if;
end $$;



