-- Migration: Add price_min and price_max to user_survey_responses
-- Created: 2026-01-07

alter table public.user_survey_responses
  add column if not exists price_min integer,
  add column if not exists price_max integer;

-- Backfill from legacy single-value budget (price_range)
-- Use +400 default window to satisfy UI constraint.
update public.user_survey_responses
set
  price_min = coalesce(price_min, price_range),
  price_max = coalesce(price_max, case when price_range is null then null else (price_range + 400) end)
where price_min is null or price_max is null;

