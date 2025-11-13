-- Add group target support to matches so merged profiles can be treated as one
do $$ begin
  -- receiver_group_id column
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'receiver_group_id'
  ) then
    alter table public.matches
      add column receiver_group_id uuid references public.profile_groups(id) on delete set null;
  end if;

  -- Check constraint: either receiver_id or receiver_group_id must be present (but not both)
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_receiver_oneof_chk'
  ) then
    alter table public.matches
      add constraint matches_receiver_oneof_chk
      check (
        (receiver_id is not null)::int + (receiver_group_id is not null)::int = 1
      );
  end if;

  -- Unique interaction per sender->user (only when receiver_id is set)
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'matches_unique_sender_user'
  ) then
    create unique index matches_unique_sender_user
      on public.matches (sender_id, receiver_id)
      where receiver_id is not null;
  end if;

  -- Unique interaction per sender->group (only when receiver_group_id is set)
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'matches_unique_sender_group'
  ) then
    create unique index matches_unique_sender_group
      on public.matches (sender_id, receiver_group_id)
      where receiver_group_id is not null;
  end if;

  -- Helpful index for querying incoming group requests
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'matches_receiver_group_idx'
  ) then
    create index matches_receiver_group_idx
      on public.matches (receiver_group_id);
  end if;
end $$;


