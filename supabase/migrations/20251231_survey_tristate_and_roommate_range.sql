-- Survey improvements:
-- - Add preferred_roommates_min/max (range).
-- - Make selected boolean preferences tri-state (true/false/null) to support "לא משנה לי".
--
-- Safe to run multiple times.

do $$
begin
  if to_regclass('public.user_survey_responses') is null then
    raise notice 'public.user_survey_responses not found; skipping migration';
    return;
  end if;

  alter table public.user_survey_responses
    add column if not exists preferred_roommates_min integer,
    add column if not exists preferred_roommates_max integer;

  -- Ensure tri-state columns can store NULL and don't force defaults.
  -- (If the columns are already nullable, these statements are harmless.)
  begin
    alter table public.user_survey_responses alter column bills_included drop not null;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses alter column bills_included drop default;
  exception when others then
    null;
  end;

  begin
    alter table public.user_survey_responses alter column has_balcony drop not null;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses alter column has_balcony drop default;
  exception when others then
    null;
  end;

  begin
    alter table public.user_survey_responses alter column has_elevator drop not null;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses alter column has_elevator drop default;
  exception when others then
    null;
  end;

  begin
    alter table public.user_survey_responses alter column wants_master_room drop not null;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses alter column wants_master_room drop default;
  exception when others then
    null;
  end;

  begin
    alter table public.user_survey_responses alter column with_broker drop not null;
  exception when others then
    null;
  end;
  begin
    alter table public.user_survey_responses alter column with_broker drop default;
  exception when others then
    null;
  end;
end $$;

