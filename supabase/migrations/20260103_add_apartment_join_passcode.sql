-- Add 6-digit join passcode to apartments table.
-- Safe to run multiple times (uses IF NOT EXISTS guards).

do $$
begin
  if to_regclass('public.apartments') is null then
    raise notice 'public.apartments not found; skipping migration';
    return;
  end if;

  alter table public.apartments
    add column if not exists join_passcode text;

  -- Ensure passcode is exactly 6 digits when present
  if not exists (
    select 1
    from pg_constraint
    where conname = 'apartments_join_passcode_format'
  ) then
    alter table public.apartments
      add constraint apartments_join_passcode_format
      check (join_passcode is null or join_passcode ~ '^[0-9]{6}$');
  end if;

  -- Ensure uniqueness when present (partial unique index allows existing rows to stay null)
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'apartments_join_passcode_unique'
      and n.nspname = 'public'
  ) then
    create unique index apartments_join_passcode_unique
      on public.apartments (join_passcode)
      where join_passcode is not null;
  end if;
end $$;

