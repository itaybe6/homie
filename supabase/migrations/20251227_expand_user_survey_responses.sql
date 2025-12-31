-- Expand user_survey_responses columns to match app expectations.
-- Safe to run multiple times (uses IF NOT EXISTS guards).

do $$
begin
  if to_regclass('public.user_survey_responses') is null then
    raise notice 'public.user_survey_responses not found; skipping migration';
    return;
  end if;

  alter table public.user_survey_responses
    add column if not exists is_completed boolean,
    add column if not exists is_sublet boolean,
    add column if not exists occupation text,
    add column if not exists student_year integer,
    add column if not exists works_from_home boolean,
    add column if not exists keeps_kosher boolean,
    add column if not exists is_shomer_shabbat boolean,
    add column if not exists diet_type text,
    add column if not exists is_smoker boolean,
    add column if not exists relationship_status text,
    add column if not exists has_pet boolean,
    add column if not exists lifestyle text,
    add column if not exists cleanliness_importance integer,
    add column if not exists cleaning_frequency text,
    add column if not exists hosting_preference text,
    add column if not exists cooking_style text,
    add column if not exists home_vibe text,
    add column if not exists price_range integer,
    add column if not exists bills_included boolean,
    add column if not exists preferred_city text,
    add column if not exists preferred_neighborhoods text[],
    add column if not exists floor_preference text,
    add column if not exists has_balcony boolean,
    add column if not exists has_elevator boolean,
    add column if not exists wants_master_room boolean,
    add column if not exists move_in_month text,
    add column if not exists preferred_roommates integer,
    add column if not exists pets_allowed boolean,
    add column if not exists with_broker boolean,
    add column if not exists sublet_month_from text,
    add column if not exists sublet_month_to text,
    add column if not exists preferred_age_min integer,
    add column if not exists preferred_age_max integer,
    add column if not exists preferred_age_range text,
    add column if not exists preferred_gender text,
    add column if not exists preferred_occupation text,
    add column if not exists partner_shabbat_preference text,
    add column if not exists partner_diet_preference text,
    add column if not exists partner_smoking_preference text,
    add column if not exists partner_pets_preference text;

  -- Optional: keep one row per user (helps future upserts and avoids duplicates)
  create unique index if not exists user_survey_responses_user_id_unique
    on public.user_survey_responses (user_id);
end $$;


