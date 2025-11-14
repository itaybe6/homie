-- Add sublet toggle and month range columns to user_survey_responses
-- Safe to re-run thanks to IF NOT EXISTS

alter table public.user_survey_responses
  add column if not exists is_sublet boolean;

alter table public.user_survey_responses
  add column if not exists sublet_month_from text; -- expected format YYYY-MM

alter table public.user_survey_responses
  add column if not exists sublet_month_to text;   -- expected format YYYY-MM


