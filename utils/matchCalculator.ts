/* eslint-disable @typescript-eslint/ban-ts-comment */

export type BinaryPreference = 'allow' | 'preferNo' | 'forbid';

export type DietType = 'ללא הגבלה' | 'צמחוני' | 'טבעוני' | 'כשר';
export type HomeLifestyle =
  | 'שקט וביתי'
  | 'רגוע ולימודי'
  | 'מאוזן'
  | 'חברתי ופעיל'
  | 'זורם וספונטני'
  | string;
export type CleaningFrequency =
  | 'פעם בשבוע'
  | 'פעמיים בשבוע'
  | 'פעם בשבועיים'
  | 'כאשר צריך'
  | string;
export type HostingPreference = 'פעם בשבוע' | 'לפעמים' | 'כמה שיותר' | string;
export type CookingStyle = 'קניות משותפות' | 'כל אחד לעצמו' | 'לא משנה לי' | string;

export type PartnerSmokingPref = 'אין בעיה' | 'מעדיפ/ה שלא' | null;
export type PartnerShabbatPref = 'אין בעיה' | 'מעדיפ/ה שלא' | null;
export type PartnerDietPref = 'אין בעיה' | 'מעדיפ/ה שלא טבעוני' | 'כשר בלבד' | null;
export type PartnerPetsPref = 'אין בעיה' | 'מעדיפ/ה שלא' | null;

export type CompatUserSurvey = {
  // Self/behavior
  is_smoker?: boolean | null;
  has_pet?: boolean | null;
  is_shomer_shabbat?: boolean | null;
  keeps_kosher?: boolean | null;
  diet_type?: DietType | null;
  home_lifestyle?: HomeLifestyle | null;
  cleanliness_importance?: number | null; // 1-5
  cleaning_frequency?: CleaningFrequency | null;
  hosting_preference?: HostingPreference | null;
  cooking_style?: CookingStyle | null;
  age?: number | null;
  gender?: 'male' | 'female' | null;
  occupation?: 'student' | 'worker' | string | null;
  student_year?: number | null; // if occupation === 'student', 1–8
  relationship_status?: string | null;
  city?: string | null;
  // Budget range (₪) - new fields
  price_min?: number | null;
  price_max?: number | null;
  // Legacy single-value budget
  price_range?: number | null;
  // Kept for backwards-compat scoring logic; derive it from preferred_cities at call sites.
  preferred_city?: string | null;
  preferred_neighborhoods?: string[] | null;
  floor_preference?: string | null;
  has_balcony?: boolean | null;
  // Move-in range (YYYY-MM)
  move_in_month_from?: string | null;
  move_in_month_to?: string | null;
  move_in_is_flexible?: boolean | null;
  // Legacy
  move_in_month?: string | null;
  is_sublet?: boolean | null;
  sublet_month_from?: string | null;
  sublet_month_to?: string | null;
  preferred_roommates?: number | null;
  preferred_roommates_min?: number | null;
  preferred_roommates_max?: number | null;
  pets_allowed?: boolean | null;
  // Acceptance/preferences for partner
  partner_smoking_preference?: PartnerSmokingPref;
  partner_shabbat_preference?: PartnerShabbatPref;
  partner_diet_preference?: PartnerDietPref;
  partner_pets_preference?: PartnerPetsPref;
  preferred_age_min?: number | null;
  preferred_age_max?: number | null;
  preferred_gender?: 'male' | 'female' | 'any' | null;
  preferred_occupation?: 'student' | 'worker' | 'any' | string | null;
  // Optional soft signals
  hobbies?: string[] | null;
  personality?: string[] | null;
  // Not currently modeled in UI; included for completeness
  partnerOver?: 'אין בעיה' | 'מעדיפ/ה שלא' | 'אסור' | null;
};

export const weights = {
  // Weights per your table (1–5)
  occupation: 5,
  studentYear: 2,
  shabbat: 5,
  kosher: 5,
  diet: 2,
  smoking: 3,
  relationshipStatus: 2,
  pets: 5,
  cleanliness: 5,
  cleaningFrequency: 3,
  hosting: 4,
  cooking: 4,
  homeVibe: 5,
  budget: 5,
  neighborhood: 5,
  balconyGarden: 3,
  roommateCount: 3,
  gender: 5,
  moveIn: 5,
  floor: 3,
  age: 5,
} as const;

function average(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return 0.5;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

export function calculateBinaryMatch(
  myValue: boolean | null | undefined,
  theirValue: boolean | null | undefined,
  myTolerance?: BinaryPreference | null,
): number {
  if (myValue === null || myValue === undefined || theirValue === null || theirValue === undefined) {
    if (!myTolerance) return 0.5;
  }
  const tol = myTolerance || 'allow';
  if (tol === 'allow') return 1;
  if (tol === 'forbid') return theirValue ? 0 : 1;
  // preferNo
  return theirValue ? 0.5 : 1;
}

export function calculateCategoryMatch(
  myValue: string | null | undefined,
  theirValue: string | null | undefined,
  options?: {
    neutral?: Set<string>;
    similarGroups?: Array<Set<string>>;
  },
): number {
  if (!myValue || !theirValue) return 0.5;
  if (myValue === theirValue) return 1;
  if (options?.neutral?.has(myValue) || options?.neutral?.has(theirValue)) return 1;
  if (options?.similarGroups) {
    for (const group of options.similarGroups) {
      if (group.has(myValue) && group.has(theirValue)) return 0.5;
    }
  }
  return 0;
}

export function calculateRangeMatch(
  myValue: number | null | undefined,
  theirValue: number | null | undefined,
  max: number,
): number {
  if (!Number.isFinite(myValue as number) || !Number.isFinite(theirValue as number)) return 0.5;
  const diff = Math.abs((myValue as number) - (theirValue as number));
  const sim = 1 - diff / max;
  return Math.max(0, Math.min(1, sim));
}

function oneToFiveScaleMatch(a?: number | null, b?: number | null): number {
  // values are 1–5 => max diff is 4
  return calculateRangeMatch(a, b, 4);
}

function mapSmokingTolerance(pref: PartnerSmokingPref): BinaryPreference {
  if (!pref || pref === 'אין בעיה') return 'allow';
  return 'preferNo';
}
function mapPetsTolerance(pref: PartnerPetsPref): BinaryPreference {
  if (!pref || pref === 'אין בעיה') return 'allow';
  return 'preferNo';
}
function mapShabbatTolerance(pref: PartnerShabbatPref, targetIsShomer: boolean | null | undefined): number {
  if (!pref || pref === 'אין בעיה') return 1;
  if (targetIsShomer === null || targetIsShomer === undefined) return 0.5;
  // 'מעדיפ/ה שלא' → מעדיף/ה שלא שומר/ת שבת
  return targetIsShomer ? 0.5 : 1;
}

function dietToleranceScore(pref: PartnerDietPref, targetDiet?: DietType | null): number {
  if (!pref || pref === 'אין בעיה') return 1;
  // 'כשר בלבד' נספר במשקל "כשרות", כדי לא לספור פעמיים
  if (pref === 'כשר בלבד') return 1;
  // 'מעדיפ/ה שלא טבעוני'
  if ((targetDiet || null) === 'טבעוני') return 0.5;
  return 1;
}

function dietTypeMatch(a?: DietType | null, b?: DietType | null): number {
  if (!a || !b) return 0.5;
  if (a === b) return 1;
  // "ללא הגבלה" = לא מגביל
  if (a === 'ללא הגבלה' || b === 'ללא הגבלה') return 1;
  // צמחוני/טבעוני דומים חלקית
  if ((a === 'צמחוני' && b === 'טבעוני') || (a === 'טבעוני' && b === 'צמחוני')) return 0.7;
  // כל שאר המקרים: אי התאמה חלקית (משקל נמוך יחסית)
  return 0.3;
}

function kosherScoreFromPerspective(me: Partial<CompatUserSurvey>, them: Partial<CompatUserSurvey>): number {
  // דרישה מפורשת: "כשר בלבד"
  if ((me.partner_diet_preference || null) === 'כשר בלבד') {
    if (them.keeps_kosher === null || them.keeps_kosher === undefined) return 0.5;
    return them.keeps_kosher ? 1 : 0;
  }
  // אם אני שומר/ת כשרות בפועל, זה קריטי (מטבח משותף)
  if (me.keeps_kosher === true) {
    if (them.keeps_kosher === null || them.keeps_kosher === undefined) return 0.5;
    return them.keeps_kosher ? 1 : 0;
  }
  // אחרת – התאמה בסיסית: הסכמה/אי־הסכמה
  return booleanAgreement(me.keeps_kosher, them.keeps_kosher, { mismatchScore: 0 });
}

function homeLifestyleToNoiseLevel(style: HomeLifestyle | null | undefined): number | null {
  if (!style) return null;
  const quietSet = new Set<HomeLifestyle>(['שקט וביתי', 'רגוע ולימודי']);
  const loudSet = new Set<HomeLifestyle>(['חברתי ופעיל', 'זורם וספונטני']);
  if (quietSet.has(style)) return 2;
  if (loudSet.has(style)) return 4;
  if (style === 'מאוזן') return 3;
  return null;
}

function cleaningFrequencyToLevel(value?: CleaningFrequency | null): number | null {
  if (!value) return null;
  if (value === 'פעמיים בשבוע') return 4;
  if (value === 'פעם בשבוע') return 3;
  if (value === 'פעם בשבועיים') return 2;
  if (value === 'כאשר צריך') return 1;
  return null;
}

function relationshipStatusMatch(a?: string | null, b?: string | null): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0.5;
  if (na === nb) return 1;
  return 0.3;
}

function jaccardSimilarity(a?: string[] | null, b?: string[] | null): number {
  const A = new Set((a || []).map((s) => (s || '').trim()).filter(Boolean));
  const B = new Set((b || []).map((s) => (s || '').trim()).filter(Boolean));
  if (A.size === 0 && B.size === 0) return 0.5;
  if (A.size === 0 || B.size === 0) return 0.5;
  let inter = 0;
  for (const v of A) if (B.has(v)) inter++;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0.5 : inter / union;
}

function ageWithinPreferred(targetAge: number | null | undefined, min?: number | null, max?: number | null): number {
  if (!Number.isFinite(targetAge as number)) return 0.5;
  const age = targetAge as number;
  if (Number.isFinite(min as number) && age < (min as number)) {
    return age + 2 >= (min as number) ? 0.5 : 0;
  }
  if (Number.isFinite(max as number) && age > (max as number)) {
    return age - 2 <= (max as number) ? 0.5 : 0;
  }
  return 1;
}

const neutralPreferenceTerms = new Set(['לא משנה', 'לא משנה לי', 'any', 'הכל', 'כל דבר']);
const hebrewMonthMap: Record<string, number> = {
  ינואר: 0,
  פברואר: 1,
  מרץ: 2,
  אפריל: 3,
  מאי: 4,
  יוני: 5,
  יולי: 6,
  אוגוסט: 7,
  ספטמבר: 8,
  אוקטובר: 9,
  נובמבר: 10,
  דצמבר: 11,
};

function normalizeText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function cityMatchScore(a?: string | null, b?: string | null): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0.5;
  return normA === normB ? 1 : 0;
}

function preferenceMatch(
  preference?: string | null,
  candidate?: string | null,
  options?: { neutralValues?: Set<string> },
): number {
  const pref = normalizeText(preference);
  const value = normalizeText(candidate);
  if (!pref || options?.neutralValues?.has(pref)) return 1;
  if (!value) return 0.5;
  return pref === value ? 1 : 0;
}

function booleanAgreement(
  a?: boolean | null,
  b?: boolean | null,
  options?: { mismatchScore?: number; neutralScore?: number },
): number {
  if (a === null || a === undefined || b === null || b === undefined) {
    return options?.neutralScore ?? 0.5;
  }
  return a === b ? 1 : options?.mismatchScore ?? 0;
}

function softBooleanPreferenceMatch(a?: boolean | null, b?: boolean | null): number {
  return booleanAgreement(a, b, { mismatchScore: 0.7 });
}

function floorPreferenceMatch(a?: string | null, b?: string | null): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0.5;
  if (neutralPreferenceTerms.has(normA) || neutralPreferenceTerms.has(normB)) return 1;
  return normA === normB ? 1 : 0.5;
}

function calculateLocationCompatibility(
  me: Partial<CompatUserSurvey>,
  them: Partial<CompatUserSurvey>,
): number {
  const pieces: number[] = [];
  pieces.push(cityMatchScore(me.preferred_city, them.preferred_city));
  pieces.push(cityMatchScore(me.preferred_city, them.city));
  pieces.push(cityMatchScore(them.preferred_city, me.city));
  if ((me.preferred_neighborhoods && me.preferred_neighborhoods.length) || (them.preferred_neighborhoods && them.preferred_neighborhoods.length)) {
    pieces.push(jaccardSimilarity(me.preferred_neighborhoods || null, them.preferred_neighborhoods || null));
  }
  const valid = pieces.filter((p) => typeof p === 'number' && !Number.isNaN(p));
  if (!valid.length) return 0.5;
  return average(valid);
}

function coerceBudgetRange(s: Partial<CompatUserSurvey>): { min: number; max: number } | null {
  const min = s.price_min;
  const max = s.price_max;
  if (Number.isFinite(min as number) && Number.isFinite(max as number) && (max as number) >= (min as number)) {
    return { min: Number(min), max: Number(max) };
  }
  if (Number.isFinite(s.price_range as number)) {
    const v = Number(s.price_range);
    if (v > 0) return { min: v, max: v + 400 };
  }
  return null;
}

function calculateBudgetCompatibility(me: Partial<CompatUserSurvey>, them: Partial<CompatUserSurvey>): number {
  const a = coerceBudgetRange(me);
  const b = coerceBudgetRange(them);
  if (!a || !b) return 0.5;

  const overlap = Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min));
  const union = Math.max(a.max, b.max) - Math.min(a.min, b.min);
  if (union <= 0) return 0.5;
  if (overlap > 0) {
    // ranges overlap: reward overlap ratio
    return Math.min(1, 0.7 + 0.3 * (overlap / union));
  }

  // no overlap: penalize by gap size relative to scale
  const gap = Math.max(a.min, b.min) - Math.min(a.max, b.max);
  const scale = Math.max(a.max, b.max, 1);
  return Math.max(0, 1 - gap / scale);
}

function coerceRoommateRange(s: Partial<CompatUserSurvey>): { min: number; max: number } | null {
  const min = s.preferred_roommates_min;
  const max = s.preferred_roommates_max;
  if (Number.isFinite(min as number) && Number.isFinite(max as number) && (max as number) >= (min as number)) {
    return { min: Number(min), max: Number(max) };
  }
  if (Number.isFinite(s.preferred_roommates as number)) {
    const v = Number(s.preferred_roommates);
    return { min: v, max: v };
  }
  return null;
}

function calculateRoommateRangeCompatibility(me: Partial<CompatUserSurvey>, them: Partial<CompatUserSurvey>): number {
  const a = coerceRoommateRange(me);
  const b = coerceRoommateRange(them);
  if (!a || !b) return 0.5;

  const overlap = Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min));
  const union = Math.max(a.max, b.max) - Math.min(a.min, b.min);
  if (union <= 0) return 0.5;
  if (overlap > 0) return Math.min(1, 0.7 + 0.3 * (overlap / union));

  const gap = Math.max(a.min, b.min) - Math.min(a.max, b.max);
  const scale = Math.max(a.max, b.max, 1);
  return Math.max(0, 1 - gap / scale);
}

function parseYearMonth(value?: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = Math.min(Math.max(parseInt(iso[2], 10) - 1, 0), 11);
    if (Number.isFinite(year)) return year * 12 + month;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const monthName = parts[0];
    const year = parseInt(parts[parts.length - 1], 10);
    const month = hebrewMonthMap[monthName];
    if (Number.isFinite(year) && typeof month === 'number') {
      return year * 12 + month;
    }
  }
  return null;
}

function calculateMonthDistance(a?: string | null, b?: string | null): number {
  const idxA = parseYearMonth(a);
  const idxB = parseYearMonth(b);
  if (idxA === null || idxB === null) return 0.5;
  const diff = Math.abs(idxA - idxB);
  const MAX_DIFF = 6;
  return Math.max(0, 1 - diff / MAX_DIFF);
}

function calculateSubletWindowOverlap(
  startA?: string | null,
  endA?: string | null,
  startB?: string | null,
  endB?: string | null,
): number {
  const sA = parseYearMonth(startA);
  const eA = parseYearMonth(endA);
  const sB = parseYearMonth(startB);
  const eB = parseYearMonth(endB);
  if (sA === null || eA === null || sB === null || eB === null) return 0.4;
  const overlapStart = Math.max(sA, sB);
  const overlapEnd = Math.min(eA, eB);
  if (overlapEnd < overlapStart) return 0;
  const overlap = overlapEnd - overlapStart + 1;
  const span = Math.max(eA, eB) - Math.min(sA, sB) + 1;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, overlap / span));
}

function calculateMoveInCompatibility(
  me: Partial<CompatUserSurvey>,
  them: Partial<CompatUserSurvey>,
): number {
  const coerceMoveInRange = (s: Partial<CompatUserSurvey>): { from: string; to: string } | null => {
    const from = (s as any).move_in_month_from ?? null;
    const to = (s as any).move_in_month_to ?? null;
    if (typeof from === 'string' && from) {
      if (typeof to === 'string' && to) return { from, to };
      return { from, to: from };
    }
    if (typeof s.move_in_month === 'string' && s.move_in_month) return { from: s.move_in_month, to: s.move_in_month };
    return null;
  };

  const meSublet = !!me.is_sublet;
  const themSublet = !!them.is_sublet;
  if (meSublet && themSublet) {
    return calculateSubletWindowOverlap(
      me.sublet_month_from,
      me.sublet_month_to,
      them.sublet_month_from,
      them.sublet_month_to,
    );
  }
  if (meSublet || themSublet) {
    const subletUser = meSublet ? me : them;
    const regularUser = meSublet ? them : me;
    const subletStart = subletUser.sublet_month_from || null;
    const subletEnd = subletUser.sublet_month_to || subletUser.sublet_month_from || null;
    const regularRange = coerceMoveInRange(regularUser);
    if (regularRange) {
      const overlap = calculateSubletWindowOverlap(subletStart, subletEnd, regularRange.from, regularRange.to);
      return 0.4 + 0.6 * overlap;
    }
    return 0.4;
  }
  const a = coerceMoveInRange(me);
  const b = coerceMoveInRange(them);
  if (!a || !b) return 0.5;
  const aS = parseYearMonth(a.from);
  const aE = parseYearMonth(a.to);
  const bS = parseYearMonth(b.from);
  const bE = parseYearMonth(b.to);
  if (aS === null || aE === null || bS === null || bE === null) return 0.5;
  const startA = Math.min(aS, aE);
  const endA = Math.max(aS, aE);
  const startB = Math.min(bS, bE);
  const endB = Math.max(bS, bE);
  const overlapStart = Math.max(startA, startB);
  const overlapEnd = Math.min(endA, endB);
  if (overlapEnd >= overlapStart) {
    const overlap = overlapEnd - overlapStart + 1;
    const span = Math.max(endA, endB) - Math.min(startA, startB) + 1;
    return Math.min(1, 0.7 + 0.3 * (span > 0 ? overlap / span : 0));
  }
  const gap = Math.max(startA, startB) - Math.min(endA, endB);
  const MAX_DIFF = 6;
  return Math.max(0, 1 - gap / MAX_DIFF);
}

function petsPolicyCompatibility(
  petsAllowed?: boolean | null,
  partnerHasPet?: boolean | null,
): number {
  if (!partnerHasPet) return 1;
  if (petsAllowed === null || petsAllowed === undefined) return 0.5;
  return petsAllowed ? 1 : 0;
}

export function calculateMatchScore(
  myAnswers: Partial<CompatUserSurvey>,
  theirAnswers: Partial<CompatUserSurvey>,
): number {
  let totalScore = 0;
  let totalPossible = 0;

  const add = (weight: number, scorePieces: Array<number | null | undefined>) => {
    const valid = scorePieces.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (valid.length === 0) return;
    const score = average(valid);
    totalScore += score * weight;
    totalPossible += 1 * weight;
  };

  // עישון (משקל 3)
  {
    const s1 = calculateBinaryMatch(
      myAnswers.is_smoker,
      theirAnswers.is_smoker,
      mapSmokingTolerance(myAnswers.partner_smoking_preference as PartnerSmokingPref),
    );
    const s2 = calculateBinaryMatch(
      theirAnswers.is_smoker,
      myAnswers.is_smoker,
      mapSmokingTolerance(theirAnswers.partner_smoking_preference as PartnerSmokingPref),
    );
    add(weights.smoking, [s1, s2]);
  }

  // בע"ח (משקל 5)
  {
    const s1 = calculateBinaryMatch(
      myAnswers.has_pet,
      theirAnswers.has_pet,
      mapPetsTolerance(myAnswers.partner_pets_preference as PartnerPetsPref),
    );
    const s2 = calculateBinaryMatch(
      theirAnswers.has_pet,
      myAnswers.has_pet,
      mapPetsTolerance(theirAnswers.partner_pets_preference as PartnerPetsPref),
    );
    add(weights.pets, [s1, s2]);
  }

  // שמירת שבת (משקל 5)
  {
    const s1 = mapShabbatTolerance(
      myAnswers.partner_shabbat_preference as PartnerShabbatPref,
      theirAnswers.is_shomer_shabbat,
    );
    const s2 = mapShabbatTolerance(
      theirAnswers.partner_shabbat_preference as PartnerShabbatPref,
      myAnswers.is_shomer_shabbat,
    );
    add(weights.shabbat, [s1, s2]);
  }

  // כשרות (משקל 5)
  {
    const s1 = kosherScoreFromPerspective(myAnswers, theirAnswers);
    const s2 = kosherScoreFromPerspective(theirAnswers, myAnswers);
    add(weights.kosher, [s1, s2]);
  }

  // תזונה (משקל 2)
  {
    const s1 = dietToleranceScore(myAnswers.partner_diet_preference as PartnerDietPref, theirAnswers.diet_type as DietType);
    const s2 = dietToleranceScore(theirAnswers.partner_diet_preference as PartnerDietPref, myAnswers.diet_type as DietType);
    const s3 = dietTypeMatch(myAnswers.diet_type as DietType, theirAnswers.diet_type as DietType);
    add(weights.diet, [s1, s2, s3]);
  }

  // אווירה בבית (משקל 5)
  {
    const directMatch = calculateCategoryMatch(myAnswers.home_lifestyle || null, theirAnswers.home_lifestyle || null, {
      similarGroups: [
        new Set(['שקט וביתי', 'רגוע ולימודי']),
        new Set(['חברתי ופעיל', 'זורם וספונטני']),
      ],
    });
    const myLevel = homeLifestyleToNoiseLevel(myAnswers.home_lifestyle ?? null);
    const theirLevel = homeLifestyleToNoiseLevel(theirAnswers.home_lifestyle ?? null);
    const noiseMatch =
      myLevel === null || theirLevel === null ? 0.5 : Math.max(0, 1 - Math.abs(myLevel - theirLevel) / 2);
    add(weights.homeVibe, [directMatch, noiseMatch]);
  }

  // ניקיון (משקל 5)
  {
    add(weights.cleanliness, [oneToFiveScaleMatch(myAnswers.cleanliness_importance ?? null, theirAnswers.cleanliness_importance ?? null)]);
  }

  // תדירות ניקיון (משקל 3)
  {
    const a = cleaningFrequencyToLevel(myAnswers.cleaning_frequency ?? null);
    const b = cleaningFrequencyToLevel(theirAnswers.cleaning_frequency ?? null);
    const s = calculateRangeMatch(a ?? undefined, b ?? undefined, 3);
    add(weights.cleaningFrequency, [s]);
  }

  // אירוחים (משקל 4)
  {
    const s = calculateCategoryMatch(myAnswers.hosting_preference || null, theirAnswers.hosting_preference || null, {
      similarGroups: [
        new Set(['פעם בשבוע', 'לפעמים']),
        new Set(['לפעמים', 'כמה שיותר']),
      ],
    });
    add(weights.hosting, [s]);
  }

  // אוכל ובישולים (משקל 4)
  {
    const s = calculateCategoryMatch(myAnswers.cooking_style || null, theirAnswers.cooking_style || null, {
      neutral: new Set(['לא משנה', 'לא משנה לי']),
    });
    add(weights.cooking, [s]);
  }

  // מצב זוגי (משקל 2)
  {
    add(weights.relationshipStatus, [relationshipStatusMatch(myAnswers.relationship_status, theirAnswers.relationship_status)]);
  }

  // גיל (משקל 5) - התאמה דו־כיוונית לפי טווח מועדף
  {
    const s1 = ageWithinPreferred(theirAnswers.age ?? null, myAnswers.preferred_age_min ?? null, myAnswers.preferred_age_max ?? null);
    const s2 = ageWithinPreferred(myAnswers.age ?? null, theirAnswers.preferred_age_min ?? null, theirAnswers.preferred_age_max ?? null);
    add(weights.age, [s1, s2]);
  }

  // מין (משקל 5) - התאמה דו־כיוונית לפי העדפה
  {
    const s1 = preferenceMatch(myAnswers.preferred_gender, theirAnswers.gender, { neutralValues: neutralPreferenceTerms });
    const s2 = preferenceMatch(theirAnswers.preferred_gender, myAnswers.gender, { neutralValues: neutralPreferenceTerms });
    add(weights.gender, [s1, s2]);
  }

  // עיסוק (סטודנט/עובד) (משקל 5)
  {
    const pref1 = preferenceMatch(myAnswers.preferred_occupation, theirAnswers.occupation, { neutralValues: neutralPreferenceTerms });
    const pref2 = preferenceMatch(theirAnswers.preferred_occupation, myAnswers.occupation, { neutralValues: neutralPreferenceTerms });
    const occSimilarity = calculateCategoryMatch(myAnswers.occupation || null, theirAnswers.occupation || null);
    add(weights.occupation, [pref1, pref2, occSimilarity]);
  }

  // שנת לימודים (משקל 2) - רק אם שני הצדדים סטודנטים ויש נתון
  {
    const bothStudent = (myAnswers.occupation || null) === 'student' && (theirAnswers.occupation || null) === 'student';
    if (bothStudent && Number.isFinite(myAnswers.student_year as number) && Number.isFinite(theirAnswers.student_year as number)) {
      const diff = Math.abs(Number(myAnswers.student_year) - Number(theirAnswers.student_year));
      const MAX_DIFF = 7; // 1–8
      const s = Math.max(0, 1 - diff / MAX_DIFF);
      add(weights.studentYear, [s]);
    }
  }

  // שכונה (משקל 5)
  {
    const locationScore = calculateLocationCompatibility(myAnswers, theirAnswers);
    add(weights.neighborhood, [locationScore]);
  }

  // תקציב (משקל 5)
  {
    const budgetScore = calculateBudgetCompatibility(myAnswers, theirAnswers);
    add(weights.budget, [budgetScore]);
  }

  // חודש כניסה (משקל 5)
  {
    const moveInScore = calculateMoveInCompatibility(myAnswers, theirAnswers);
    add(weights.moveIn, [moveInScore]);
  }

  // מס' שותפים (משקל 3)
  {
    const roommatesScore = calculateRoommateRangeCompatibility(myAnswers, theirAnswers);
    add(weights.roommateCount, [roommatesScore]);
  }

  // מרפסת/גינה (משקל 3) - tri-state (null = "לא משנה לי")
  {
    const a = myAnswers.has_balcony;
    const b = theirAnswers.has_balcony;
    const s =
      a === null || b === null
        ? 1
        : a === undefined || b === undefined
          ? 0.5
          : a === b
            ? 1
            : 0;
    add(weights.balconyGarden, [s]);
  }

  // קומה (משקל 3)
  {
    add(weights.floor, [floorPreferenceMatch(myAnswers.floor_preference, theirAnswers.floor_preference)]);
  }

  if (totalPossible === 0) return 0;
  const percent = (totalScore / totalPossible) * 100;
  return Math.round(percent);
}
