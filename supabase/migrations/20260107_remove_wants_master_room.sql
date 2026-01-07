-- Migration: Remove wants_master_room column from user_survey_responses
-- Created: 2026-01-07

alter table public.user_survey_responses
  drop column if exists wants_master_room;

