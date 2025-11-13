-- Allow group-level interactions by making receiver_id nullable
do $$ begin
  -- Drop NOT NULL from receiver_id if present
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'receiver_id'
      and is_nullable = 'NO'
  ) then
    alter table public.matches
      alter column receiver_id drop not null;
  end if;
end $$;


