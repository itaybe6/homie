-- Migration: Remove has_elevator column from user_survey_responses (survey preferences)
-- Note: This does NOT remove has_elevator from apartments table (property feature)
-- Created: 2026-01-07

-- Remove the has_elevator preference column from user_survey_responses table
alter table public.user_survey_responses 
  drop column if exists has_elevator;
