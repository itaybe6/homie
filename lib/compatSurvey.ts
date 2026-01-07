import type { User, UserSurveyResponse } from '@/types/database';
import type {
  CompatUserSurvey,
  CleaningFrequency,
  CookingStyle,
  DietType,
  HomeLifestyle,
  HostingPreference,
  PartnerDietPref,
  PartnerPetsPref,
  PartnerShabbatPref,
  PartnerSmokingPref,
} from '@/utils/matchCalculator';

const genderAliasMap: Record<string, 'male' | 'female'> = {
  male: 'male',
  men: 'male',
  גבר: 'male',
  זכר: 'male',
  בנים: 'male',
  female: 'female',
  women: 'female',
  נקבה: 'female',
  אישה: 'female',
  נשים: 'female',
  בנות: 'female',
};

const genderPrefAliasMap: Record<string, 'male' | 'female' | 'any'> = {
  ...genderAliasMap,
  any: 'any',
  'לא משנה': 'any',
  'לא משנה לי': 'any',
};

const occupationAliasMap: Record<string, 'student' | 'worker'> = {
  student: 'student',
  סטודנט: 'student',
  סטודנטית: 'student',
  worker: 'worker',
  עובד: 'worker',
  עובדת: 'worker',
  'עובד - מהבית': 'worker',
};

const occupationPrefAliasMap: Record<string, 'student' | 'worker' | 'any'> = {
  ...occupationAliasMap,
  any: 'any',
  'לא משנה': 'any',
  'לא משנה לי': 'any',
};

function normalizeKey<T extends string>(value: string | null | undefined, map: Record<string, T>): T | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return map[key] ?? null;
}

function normalizeGenderValue(value?: string | null): 'male' | 'female' | null {
  return normalizeKey(value, genderAliasMap);
}

function normalizeGenderPreference(value?: string | null): 'male' | 'female' | 'any' | null {
  return normalizeKey(value, genderPrefAliasMap);
}

function normalizeOccupationValue(value?: string | null): 'student' | 'worker' | null {
  const normalized = normalizeKey(value, occupationAliasMap);
  if (normalized) return normalized;
  if (value && value.includes('סטודנט')) return 'student';
  if (value && value.includes('student')) return 'student';
  if (value && value.includes('עובד')) return 'worker';
  return null;
}

function normalizeOccupationPreference(value?: string | null): 'student' | 'worker' | 'any' | null {
  const normalized = normalizeKey(value, occupationPrefAliasMap);
  if (normalized) return normalized;
  if (value && value.includes('סטודנט')) return 'student';
  if (value && value.includes('עובד')) return 'worker';
  return null;
}

function parsePreferredAgeRange(value?: string | null): { min: number | null; max: number | null } {
  if (!value) return { min: null, max: null };
  const matches = (value.match(/\d+/g) || []).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (!matches.length) return { min: null, max: null };
  if (matches.length === 1) return { min: matches[0], max: null };
  const [first, second] = matches;
  if (second !== undefined) return { min: Math.min(first, second), max: Math.max(first, second) };
  return { min: first, max: null };
}

export function buildCompatSurvey(
  userEntry: User | undefined | null,
  survey?: UserSurveyResponse | null,
): Partial<CompatUserSurvey> {
  const compat: Partial<CompatUserSurvey> = {};
  if (typeof userEntry?.age === 'number') compat.age = userEntry.age;
  compat.gender = normalizeGenderValue((userEntry as any)?.gender);
  if (userEntry?.city) compat.city = userEntry.city;

  if (typeof survey?.is_smoker === 'boolean') compat.is_smoker = survey.is_smoker;
  if (typeof survey?.has_pet === 'boolean') compat.has_pet = survey.has_pet;
  if (typeof survey?.is_shomer_shabbat === 'boolean') compat.is_shomer_shabbat = survey.is_shomer_shabbat;
  if (typeof survey?.keeps_kosher === 'boolean') compat.keeps_kosher = survey.keeps_kosher;
  if (survey?.diet_type) compat.diet_type = survey.diet_type as DietType;
  if ((survey as any)?.home_lifestyle) compat.home_lifestyle = (survey as any).home_lifestyle as HomeLifestyle;
  if (typeof survey?.cleanliness_importance === 'number') compat.cleanliness_importance = survey.cleanliness_importance;
  if (survey?.cleaning_frequency) compat.cleaning_frequency = survey.cleaning_frequency as CleaningFrequency;
  if (survey?.hosting_preference) compat.hosting_preference = survey.hosting_preference as HostingPreference;
  if (survey?.cooking_style) compat.cooking_style = survey.cooking_style as CookingStyle;
  if (survey?.preferred_city) compat.preferred_city = survey.preferred_city;
  if (Array.isArray((survey as any)?.preferred_neighborhoods)) compat.preferred_neighborhoods = (survey as any).preferred_neighborhoods;
  if (Number.isFinite((survey as any)?.price_min as number)) compat.price_min = Number((survey as any).price_min);
  if (Number.isFinite((survey as any)?.price_max as number)) compat.price_max = Number((survey as any).price_max);
  if (Number.isFinite(survey?.price_range as number)) compat.price_range = Number(survey?.price_range);
  if (survey?.floor_preference) compat.floor_preference = survey.floor_preference;
  if (typeof survey?.has_balcony === 'boolean') compat.has_balcony = survey.has_balcony;
  if (typeof survey?.pets_allowed === 'boolean') compat.pets_allowed = survey.pets_allowed;
  if (typeof survey?.preferred_roommates === 'number') compat.preferred_roommates = survey.preferred_roommates;
  if ((survey as any)?.move_in_month_from) compat.move_in_month_from = (survey as any).move_in_month_from;
  if ((survey as any)?.move_in_month_to) compat.move_in_month_to = (survey as any).move_in_month_to;
  if (typeof (survey as any)?.move_in_is_flexible === 'boolean')
    compat.move_in_is_flexible = (survey as any).move_in_is_flexible;
  if (survey?.move_in_month) compat.move_in_month = survey.move_in_month; // legacy
  if (typeof (survey as any)?.is_sublet === 'boolean') compat.is_sublet = (survey as any).is_sublet;
  if ((survey as any)?.sublet_month_from) compat.sublet_month_from = (survey as any).sublet_month_from;
  if ((survey as any)?.sublet_month_to) compat.sublet_month_to = (survey as any).sublet_month_to;
  if (survey?.relationship_status) compat.relationship_status = survey.relationship_status;

  const occupationValue = normalizeOccupationValue((survey as any)?.occupation);
  if (occupationValue) compat.occupation = occupationValue;

  if ((survey as any)?.partner_smoking_preference)
    compat.partner_smoking_preference = (survey as any).partner_smoking_preference as PartnerSmokingPref;
  if ((survey as any)?.partner_pets_preference)
    compat.partner_pets_preference = (survey as any).partner_pets_preference as PartnerPetsPref;
  if ((survey as any)?.partner_diet_preference)
    compat.partner_diet_preference = (survey as any).partner_diet_preference as PartnerDietPref;
  if ((survey as any)?.partner_shabbat_preference)
    compat.partner_shabbat_preference = (survey as any).partner_shabbat_preference as PartnerShabbatPref;

  const preferredGender = normalizeGenderPreference((survey as any)?.preferred_gender);
  if (preferredGender) compat.preferred_gender = preferredGender;
  const preferredOccupation = normalizeOccupationPreference((survey as any)?.preferred_occupation);
  if (preferredOccupation) compat.preferred_occupation = preferredOccupation;

  const { min, max } = parsePreferredAgeRange((survey as any)?.preferred_age_range);
  if (typeof min === 'number') compat.preferred_age_min = min;
  if (typeof max === 'number') compat.preferred_age_max = max;

  return compat;
}


