-- Add status column to matches table with English states and migrate legacy approved flag
alter table if exists public.matches
  add column if not exists status text;

alter table if exists public.matches
  alter column status set default 'PENDING';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'approved'
  ) then
    update public.matches
    set status = case
        when coalesce(approved, false) then 'APPROVED'
        else 'PENDING'
      end
    where status is null or status = '';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_status_check'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_status_check
        check (status in ('PENDING', 'APPROVED', 'NOT_RELEVANT', 'REJECTED'));
  end if;
end $$;

create index if not exists matches_status_idx on public.matches (status);

alter table if exists public.matches
  drop column if exists approved;

