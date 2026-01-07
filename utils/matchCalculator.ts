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
  relationship_status?: string | null;
  city?: string | null;
  price_range?: number | null;
  preferred_city?: string | null;
  preferred_neighborhoods?: string[] | null;
  floor_preference?: string | null;
  has_balcony?: boolean | null;
  move_in_month?: string | null;
  is_sublet?: boolean | null;
  sublet_month_from?: string | null;
  sublet_month_to?: string | null;
  preferred_roommates?: number | null;
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
  smoking: 5,
  pets: 5,
  shabbat: 5,
  kosher: 5,
  partnerOver: 3,
  noise: 4,
  lifestyle: 3,
  cleanliness: 3,
  cooking: 2,
  social: 2,
  ageRange: 3,
  genderPref: 4,
  occupationPref: 2,
  wfh: 1,
  location: 4,
  budget: 4,
  moveIn: 3,
  roommates: 2,
  bills: 2,
  amenities: 2,
  petsPolicy: 3,
  hobbies: 1,
  personality: 1,
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
function dietCompatibilityScore(pref: PartnerDietPref, target: { diet_type?: DietType | null; keeps_kosher?: boolean | null }): number {
  if (!pref || pref === 'אין בעיה') return 1;
  if (pref === 'כשר בלבד') {
    return target.keeps_kosher ? 1 : 0;
  }
  // 'מעדיפ/ה שלא טבעוני'
  if ((target.diet_type || null) === 'טבעוני') return 0.5;
  return 1;
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
  if (!normA || neutralPreferenceTerms.has(normA)) return 1;
  if (!normB || neutralPreferenceTerms.has(normB)) return 1;
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

function calculateBudgetCompatibility(a?: number | null, b?: number | null): number {
  if (!Number.isFinite(a as number) || !Number.isFinite(b as number)) return 0.5;
  const v1 = a as number;
  const v2 = b as number;
  if (v1 <= 0 || v2 <= 0) return 0.5;
  const diff = Math.abs(v1 - v2);
  const scale = Math.max(v1, v2, 1);
  const ratio = diff / scale;
  return Math.max(0, 1 - ratio);
}

function calculateRoommateCountMatch(a?: number | null, b?: number | null): number {
  if (!Number.isFinite(a as number) || !Number.isFinite(b as number)) return 0.5;
  const diff = Math.abs((a as number) - (b as number));
  if (diff === 0) return 1;
  if (diff === 1) return 0.7;
  return Math.max(0, 1 - diff / 3);
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
    const start = parseYearMonth(subletUser.sublet_month_from || subletUser.move_in_month);
    const end = parseYearMonth(subletUser.sublet_month_to || subletUser.sublet_month_from);
    const regular = parseYearMonth(regularUser.move_in_month);
    if (start !== null && end !== null && regular !== null) {
      if (regular >= start && regular <= end) return 0.6;
      const diff = Math.min(Math.abs(regular - start), Math.abs(regular - end));
      return Math.max(0, 0.6 - diff * 0.1);
    }
    return 0.4;
  }
  return calculateMonthDistance(me.move_in_month, them.move_in_month);
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

  // Critical: smoking
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

  // Critical: pets (arriving with pet)
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

  // Critical: shabbat
  {
    const s1 = mapShabbatTolerance(myAnswers.partner_shabbat_preference as PartnerShabbatPref, theirAnswers.is_shomer_shabbat);
    const s2 = mapShabbatTolerance(theirAnswers.partner_shabbat_preference as PartnerShabbatPref, myAnswers.is_shomer_shabbat);
    add(weights.shabbat, [s1, s2]);
  }

  // Critical: kosher (diet)
  {
    const s1 = dietCompatibilityScore(myAnswers.partner_diet_preference as PartnerDietPref, {
      diet_type: theirAnswers.diet_type as DietType,
      keeps_kosher: theirAnswers.keeps_kosher ?? null,
    });
    const s2 = dietCompatibilityScore(theirAnswers.partner_diet_preference as PartnerDietPref, {
      diet_type: myAnswers.diet_type as DietType,
      keeps_kosher: myAnswers.keeps_kosher ?? null,
    });
    add(weights.kosher, [s1, s2]);
  }

  // Critical: partner over (not modeled, optional)
  {
    // If either side provided a strong stance, consider it; else skip.
    const pref1 = myAnswers.partnerOver || null;
    const pref2 = theirAnswers.partnerOver || null;
    let s1: number | null = null;
    let s2: number | null = null;
    if (pref1) {
      // No behavior flag available → treat 'אין בעיה' as 1, 'מעדיפ/ה שלא' as 0.5, 'אסור' as 0.5 (neutral without behavior data)
      s1 = pref1 === 'אין בעיה' ? 1 : 0.5;
    }
    if (pref2) {
      s2 = pref2 === 'אין בעיה' ? 1 : 0.5;
    }
    add(weights.partnerOver, [s1 ?? undefined, s2 ?? undefined]);
  }

  // Critical: home lifestyle compatibility
  {
    const myLevel = homeLifestyleToNoiseLevel(myAnswers.home_lifestyle ?? null);
    const theirLevel = homeLifestyleToNoiseLevel(theirAnswers.home_lifestyle ?? null);

    const s = calculateRangeMatch(myLevel ?? undefined, theirLevel ?? undefined, 5);
    add(weights.noise, [s]);
    
    // Direct similarity check
    const directMatch = calculateCategoryMatch(myAnswers.home_lifestyle || null, theirAnswers.home_lifestyle || null, {
      similarGroups: [
        new Set(['שקט וביתי', 'רגוע ולימודי']),
        new Set(['חברתי ופעיל', 'זורם וספונטני']),
      ],
    });
    add(weights.lifestyle, [directMatch]);
  }

  // Important: cleanliness (importance 1-5)
  {
    const s1 = calculateRangeMatch(myAnswers.cleanliness_importance ?? null, theirAnswers.cleanliness_importance ?? null, 5);
    add(weights.cleanliness, [s1]);
  }

  // Important: cooking
  {
    const s = calculateCategoryMatch(myAnswers.cooking_style || null, theirAnswers.cooking_style || null, {
      similarGroups: [
        new Set(['כל אחד לעצמו', 'לפעמים מתחלקים']),
        new Set(['לפעמים מתחלקים', 'מבשלים יחד']),
      ],
    });
    add(weights.cooking, [s]);
  }

  // Important: social/hosting
  {
    const s = calculateCategoryMatch(myAnswers.hosting_preference || null, theirAnswers.hosting_preference || null, {
      similarGroups: [
        new Set(['פעם בשבוע', 'לפעמים']),
        new Set(['לפעמים', 'כמה שיותר']),
      ],
    });
    add(weights.social, [s]);
  }

  // Important: age range (mutual)
  {
    const s1 = ageWithinPreferred(theirAnswers.age ?? null, myAnswers.preferred_age_min ?? null, myAnswers.preferred_age_max ?? null);
    const s2 = ageWithinPreferred(myAnswers.age ?? null, theirAnswers.preferred_age_min ?? null, theirAnswers.preferred_age_max ?? null);
    add(weights.ageRange, [s1, s2]);
  }

  // Preferences: gender
  {
    const s1 = preferenceMatch(myAnswers.preferred_gender, theirAnswers.gender, { neutralValues: neutralPreferenceTerms });
    const s2 = preferenceMatch(theirAnswers.preferred_gender, myAnswers.gender, { neutralValues: neutralPreferenceTerms });
    add(weights.genderPref, [s1, s2]);
  }

  // Preferences: occupation & lifestyle overlap
  {
    const pref1 = preferenceMatch(myAnswers.preferred_occupation, theirAnswers.occupation, { neutralValues: neutralPreferenceTerms });
    const pref2 = preferenceMatch(theirAnswers.preferred_occupation, myAnswers.occupation, { neutralValues: neutralPreferenceTerms });
    const occSimilarity = calculateCategoryMatch(myAnswers.occupation || null, theirAnswers.occupation || null);
    add(weights.occupationPref, [pref1, pref2, occSimilarity]);
  }

  // Location expectations
  {
    const locationScore = calculateLocationCompatibility(myAnswers, theirAnswers);
    add(weights.location, [locationScore]);
  }

  // Budget alignment & policies
  {
    const budgetScore = calculateBudgetCompatibility(myAnswers.price_range ?? null, theirAnswers.price_range ?? null);
    add(weights.budget, [budgetScore]);
  }

  // Move-in timing
  {
    const moveInScore = calculateMoveInCompatibility(myAnswers, theirAnswers);
    add(weights.moveIn, [moveInScore]);
  }

  // Preferred roommates count
  {
    const roommatesScore = calculateRoommateCountMatch(myAnswers.preferred_roommates, theirAnswers.preferred_roommates);
    add(weights.roommates, [roommatesScore]);
  }

  // Amenities alignment
  {
    const amenityScores = [
      softBooleanPreferenceMatch(myAnswers.has_balcony, theirAnswers.has_balcony),
      floorPreferenceMatch(myAnswers.floor_preference, theirAnswers.floor_preference),
    ];
    add(weights.amenities, amenityScores);
  }

  // Pets allowed policy (apartment constraints)
  {
    const s1 = petsPolicyCompatibility(myAnswers.pets_allowed, theirAnswers.has_pet);
    const s2 = petsPolicyCompatibility(theirAnswers.pets_allowed, myAnswers.has_pet);
    add(weights.petsPolicy, [s1, s2]);
  }

  // Soft: hobbies
  {
    const s = jaccardSimilarity(myAnswers.hobbies || null, theirAnswers.hobbies || null);
    add(weights.hobbies, [s]);
  }

  // Soft: personality
  {
    const s = jaccardSimilarity(myAnswers.personality || null, theirAnswers.personality || null);
    add(weights.personality, [s]);
  }

  if (totalPossible === 0) return 0;
  const percent = (totalScore / totalPossible) * 100;
  return Math.round(percent);
}
