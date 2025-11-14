-- Add numeric age range columns and migrate from old text column if present

alter table public.user_survey_responses
  add column if not exists preferred_age_min int4,
  add column if not exists preferred_age_max int4;

-- Best-effort migration from text column 'preferred_age_range' if exists
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_survey_responses'
      and column_name = 'preferred_age_range'
  ) then
    -- Fill min age from the first number (use regexp_match which is NOT set-returning)
    update public.user_survey_responses
    set preferred_age_min = coalesce(
      preferred_age_min,
      (regexp_match(preferred_age_range, '([0-9]+)'))[1]::int
    )
    where preferred_age_range is not null
      and preferred_age_range ~ '[0-9]+';

    -- Fill max age from the second number if present; otherwise reuse min
    update public.user_survey_responses
    set preferred_age_max = coalesce(
      preferred_age_max,
      coalesce(
        (regexp_match(preferred_age_range, '([0-9]+)\\D+([0-9]+)'))[2]::int,
        (regexp_match(preferred_age_range, '([0-9]+)'))[1]::int
      )
    )
    where preferred_age_range is not null
      and preferred_age_range ~ '[0-9]+';
  end if;
end $$;

-- Optionally drop the old text column to avoid duplication
alter table public.user_survey_responses
  drop column if exists preferred_age_range;


