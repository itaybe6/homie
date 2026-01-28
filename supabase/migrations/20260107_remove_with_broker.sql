-- Migration: Remove with_broker column from user_survey_responses
-- Created: 2026-01-07

-- Remove the with_broker column from user_survey_responses table
alter table public.user_survey_responses 
  drop column if exists with_broker;
