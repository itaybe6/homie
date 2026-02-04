-- Survey: switch roommate preference to multi-select array
-- - Add preferred_roommates_choices integer[]
-- - Backfill from min/max or legacy preferred_roommates
-- - Drop old columns
--
-- Safe to run multiple times.

do $$
begin
  if to_regclass('public.user_survey_responses') is null then
    raise notice 'public.user_survey_responses not found; skipping migration';
    return;
  end if;

  alter table public.user_survey_responses
    add column if not exists preferred_roommates_choices integer[];

  -- Backfill from range (min/max) when available.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_survey_responses'
      and column_name = 'preferred_roommates_min'
  ) then
    execute $sql$
      update public.user_survey_responses
      set preferred_roommates_choices = (
        select array_agg(g)
        from generate_series(preferred_roommates_min, preferred_roommates_max) g
      )
      where preferred_roommates_choices is null
        and preferred_roommates_min is not null
        and preferred_roommates_max is not null
        and preferred_roommates_max >= preferred_roommates_min
    $sql$;
  end if;

  -- Backfill from legacy single value if still empty.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_survey_responses'
      and column_name = 'preferred_roommates'
  ) then
    execute $sql$
      update public.user_survey_responses
      set preferred_roommates_choices = array[preferred_roommates]
      where preferred_roommates_choices is null
        and preferred_roommates is not null
    $sql$;
  end if;

  -- Drop legacy columns.
  begin
    alter table public.user_survey_responses drop column if exists preferred_roommates_min;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses drop column if exists preferred_roommates_max;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses drop column if exists preferred_roommates;
  exception when others then
    null;
  end;
end $$;
