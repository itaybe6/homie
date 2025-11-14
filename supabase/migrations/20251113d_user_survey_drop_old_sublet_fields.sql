-- Drop obsolete sublet detail columns to avoid duplication
-- Safe to re-run thanks to IF EXISTS

alter table public.user_survey_responses
  drop column if exists sublet_dates;

alter table public.user_survey_responses
  drop column if exists sublet_pets_allowed;

alter table public.user_survey_responses
  drop column if exists sublet_people_count;

alter table public.user_survey_responses
  drop column if exists sublet_price;

alter table public.user_survey_responses
  drop column if exists sublet_location;

alter table public.user_survey_responses
  drop column if exists sublet_floor;

alter table public.user_survey_responses
  drop column if exists sublet_balcony;

alter table public.user_survey_responses
  drop column if exists sublet_elevator;

alter table public.user_survey_responses
  drop column if exists sublet_master_room;


