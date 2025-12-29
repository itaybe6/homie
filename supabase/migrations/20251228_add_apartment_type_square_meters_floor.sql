-- Add apartment type + square meters + floor + garden square meters (new field names)
alter table public.apartments
  add column if not exists apartment_type text,
  add column if not exists square_meters integer,
  add column if not exists floor integer,
  add column if not exists garden_square_meters integer;

-- Optional: enforce valid values when provided
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_apartment_type_check'
  ) then
    alter table public.apartments
      add constraint apartments_apartment_type_check
      check (apartment_type is null or apartment_type in ('REGULAR', 'GARDEN'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_square_meters_positive'
  ) then
    alter table public.apartments
      add constraint apartments_square_meters_positive
      check (square_meters is null or square_meters > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_garden_square_meters_positive'
  ) then
    alter table public.apartments
      add constraint apartments_garden_square_meters_positive
      check (garden_square_meters is null or garden_square_meters > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_floor_reasonable'
  ) then
    alter table public.apartments
      add constraint apartments_floor_reasonable
      check (floor is null or (floor >= 0 and floor <= 120));
  end if;
end $$;


