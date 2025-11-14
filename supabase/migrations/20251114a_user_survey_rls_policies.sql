-- Ensure RLS is enabled and policies exist for user_survey_responses
-- Allows authenticated users to manage only their own survey row (user_id = auth.uid())

alter table if exists public.user_survey_responses enable row level security;

-- SELECT own
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_survey_responses'
      and policyname = 'survey_select_own'
  ) then
    create policy survey_select_own
      on public.user_survey_responses
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

-- INSERT own
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_survey_responses'
      and policyname = 'survey_insert_own'
  ) then
    create policy survey_insert_own
      on public.user_survey_responses
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- UPDATE own
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_survey_responses'
      and policyname = 'survey_update_own'
  ) then
    create policy survey_update_own
      on public.user_survey_responses
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- DELETE own (not strictly required, but keeps semantics consistent)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_survey_responses'
      and policyname = 'survey_delete_own'
  ) then
    create policy survey_delete_own
      on public.user_survey_responses
      for delete
      using (auth.uid() = user_id);
  end if;
end
$$;

-- Optional: make sure roles have privileges (Supabase usually manages this, but safe to include)
grant select, insert, update, delete on table public.user_survey_responses to anon, authenticated;


