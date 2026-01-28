-- Migration: Replace move_in_month with move-in range + flexibility
-- Created: 2026-01-07

alter table public.user_survey_responses
  add column if not exists move_in_month_from text,
  add column if not exists move_in_month_to text,
  add column if not exists move_in_is_flexible boolean;

-- Backfill from legacy single month (move_in_month):
-- - exact month => from=month, to=month, is_flexible=false
update public.user_survey_responses
set
  move_in_month_from = coalesce(move_in_month_from, move_in_month),
  move_in_month_to = coalesce(move_in_month_to, move_in_month),
  move_in_is_flexible = coalesce(move_in_is_flexible, false)
where move_in_month is not null
  and (move_in_month_from is null or move_in_month_to is null or move_in_is_flexible is null);

-- Drop legacy column
alter table public.user_survey_responses
  drop column if exists move_in_month;

