-- Fix: garden area should be OPTIONAL for garden apartments.
-- Previously constraint forced garden_square_meters to be NOT NULL for apartment_type='GARDEN'.
-- This migration replaces that check so that:
-- - garden_square_meters can be NULL for any apartment
-- - if garden_square_meters is provided, apartment_type must be 'GARDEN'

do $$
begin
  if to_regclass('public.apartments') is null then
    raise notice 'public.apartments not found; skipping migration';
    return;
  end if;

  -- Replace the overly strict constraint (safe to run multiple times)
  if exists (
    select 1
    from pg_constraint
    where conname = 'apartments_garden_area_requires_garden_type_check'
  ) then
    alter table public.apartments
      drop constraint apartments_garden_area_requires_garden_type_check;
  end if;

  alter table public.apartments
    add constraint apartments_garden_area_requires_garden_type_check
    check (
      garden_square_meters is null
      or
      apartment_type = 'GARDEN'
    );
end $$;

