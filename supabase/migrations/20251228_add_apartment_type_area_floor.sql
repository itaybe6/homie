-- Add apartment type + area + floor (+ garden area for garden apartments) to apartments table.
-- Safe to run multiple times (uses IF NOT EXISTS guards).

do $$
begin
  if to_regclass('public.apartments') is null then
    raise notice 'public.apartments not found; skipping migration';
    return;
  end if;

  -- Enum for apartment type
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'apartment_type'
      and n.nspname = 'public'
  ) then
    create type public.apartment_type as enum ('REGULAR', 'GARDEN');
  end if;

  alter table public.apartments
    add column if not exists apartment_type public.apartment_type not null default 'REGULAR',
    add column if not exists square_meters numeric(6,2),
    add column if not exists floor integer,
    add column if not exists garden_square_meters numeric(6,2);

  -- Constraints (created once)
  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_square_meters_check'
  ) then
    alter table public.apartments
      add constraint apartments_square_meters_check
      check (square_meters is null or square_meters > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_garden_square_meters_check'
  ) then
    alter table public.apartments
      add constraint apartments_garden_square_meters_check
      check (garden_square_meters is null or garden_square_meters > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_garden_area_requires_garden_type_check'
  ) then
    alter table public.apartments
      add constraint apartments_garden_area_requires_garden_type_check
      check (
        (apartment_type = 'GARDEN' and garden_square_meters is not null)
        or
        (apartment_type = 'REGULAR' and garden_square_meters is null)
      );
  end if;
end $$;

