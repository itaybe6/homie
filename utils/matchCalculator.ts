/* eslint-disable @typescript-eslint/ban-ts-comment */

export type BinaryPreference = 'allow' | 'preferNo' | 'forbid';

export type DietType = 'ללא הגבלה' | 'צמחוני' | 'טבעוני' | 'כשר';
export type Lifestyle =
  | 'רגוע'
  | 'פעיל'
  | 'ספונטני'
  | 'ביתי'
  | 'חברתי'
  | string;
export type CleaningFrequency =
  | 'פעם בשבוע'
  | 'פעמיים בשבוע'
  | 'פעם בשבועיים'
  | 'כאשר צריך'
  | string;
export type HostingPreference = 'פעם בשבוע' | 'לפעמים' | 'כמה שיותר' | string;
export type CookingStyle = 'כל אחד לעצמו' | 'לפעמים מתחלקים' | 'מבשלים יחד' | string;
export type HomeVibe = 'שקטה ולימודית' | 'זורמת וחברתית' | 'לא משנה לי' | string;

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
  lifestyle?: Lifestyle | null;
  cleanliness_importance?: number | null; // 1-5
  cleaning_frequency?: CleaningFrequency | null;
  hosting_preference?: HostingPreference | null;
  cooking_style?: CookingStyle | null;
  home_vibe?: HomeVibe | null; // expectation for vibe/noise
  age?: number | null;
  // Acceptance/preferences for partner
  partner_smoking_preference?: PartnerSmokingPref;
  partner_shabbat_preference?: PartnerShabbatPref;
  partner_diet_preference?: PartnerDietPref;
  partner_pets_preference?: PartnerPetsPref;
  preferred_age_min?: number | null;
  preferred_age_max?: number | null;
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
  partnerOver: 5,
  noise: 5,
  lifestyle: 3,
  cleanliness: 3,
  cooking: 3,
  social: 3,
  ageRange: 3,
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

function vibeToNoiseLevel(vibe: HomeVibe | null | undefined): number | null {
  if (!vibe) return null;
  if (vibe === 'לא משנה לי') return null;
  if (vibe === 'שקטה ולימודית') return 1;
  if (vibe === 'זורמת וחברתית') return 5;
  return null;
}
function lifestyleToNoiseLevel(style: Lifestyle | null | undefined): number | null {
  if (!style) return null;
  const quietSet = new Set<Lifestyle>(['רגוע', 'ביתי']);
  const louderSet = new Set<Lifestyle>(['חברתי', 'פעיל', 'ספונטני']);
  if (quietSet.has(style)) return 2;
  if (louderSet.has(style)) return 4;
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

  // Critical: noise (expectation vs lifestyle)
  {
    const myExpect = vibeToNoiseLevel(myAnswers.home_vibe ?? null);
    const theirStyle = lifestyleToNoiseLevel(theirAnswers.lifestyle ?? null);
    const theirExpect = vibeToNoiseLevel(theirAnswers.home_vibe ?? null);
    const myStyle = lifestyleToNoiseLevel(myAnswers.lifestyle ?? null);

    const s1 = calculateRangeMatch(
      myExpect === null ? undefined : myExpect,
      theirStyle === null ? undefined : theirStyle,
      5,
    );
    const s2 = calculateRangeMatch(
      theirExpect === null ? undefined : theirExpect,
      myStyle === null ? undefined : myStyle,
      5,
    );
    add(weights.noise, [s1, s2]);
  }

  // Important: lifestyle (direct similarity)
  {
    const s = calculateCategoryMatch(myAnswers.lifestyle || null, theirAnswers.lifestyle || null, {
      similarGroups: [
        new Set(['רגוע', 'ביתי']),
        new Set(['פעיל', 'חברתי', 'ספונטני']),
      ],
    });
    add(weights.lifestyle, [s]);
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

export { calculateMatchScore };


