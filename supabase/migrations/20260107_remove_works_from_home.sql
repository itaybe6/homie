-- Migration: Remove works_from_home column from user_survey_responses
-- Created: 2026-01-07

-- Remove the works_from_home column from user_survey_responses table
alter table public.user_survey_responses 
  drop column if exists works_from_home;
