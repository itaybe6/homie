-- Store the last question key the user was on when saving a draft,
-- so the app can resume the survey from that step next time.
--
-- Safe to run multiple times (uses IF NOT EXISTS guards).

do $$
begin
  if to_regclass('public.user_survey_responses') is null then
    raise notice 'public.user_survey_responses not found; skipping migration';
    return;
  end if;

  alter table public.user_survey_responses
    add column if not exists draft_step_key text;
end $$;

