-- Migration: Merge lifestyle and home_vibe into single home_lifestyle column
-- Created: 2026-01-07

-- Add new combined column
alter table public.user_survey_responses 
  add column if not exists home_lifestyle text;

-- Migrate existing data: prefer lifestyle if exists, otherwise home_vibe
update public.user_survey_responses 
set home_lifestyle = coalesce(lifestyle, home_vibe)
where lifestyle is not null or home_vibe is not null;

-- Drop old columns
alter table public.user_survey_responses 
  drop column if exists lifestyle;

alter table public.user_survey_responses 
  drop column if exists home_vibe;
