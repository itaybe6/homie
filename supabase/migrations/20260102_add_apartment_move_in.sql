-- Add move-in availability fields to apartments
-- - move_in_date: planned entry date (YYYY-MM-DD)
-- - move_in_is_immediate: true when entry is immediate

alter table public.apartments
  add column if not exists move_in_date date;

alter table public.apartments
  add column if not exists move_in_is_immediate boolean;

-- Optional sanity rule: if immediate then date should be null.
-- (Not enforced here to keep backwards compatibility / avoid failing existing rows.)

