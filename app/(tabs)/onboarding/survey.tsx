import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { UserSurveyResponse } from '@/types/database';
import { fetchUserSurvey, upsertUserSurvey } from '@/lib/survey';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { getNeighborhoodsForCityName, searchCitiesWithNeighborhoods } from '@/lib/neighborhoods';

type SurveyState = Partial<UserSurveyResponse>;

const steps = [
  { key: 'about', title: 'עליך' },
  { key: 'apartment', title: 'על הדירה שאני מחפש' },
  { key: 'partner', title: 'השותפ/ה שאני מחפש' },
] as const;

const lifestyleOptions = ['רגוע', 'פעיל', 'ספונטני', 'ביתי', 'חברתי'];
const dietOptions = ['ללא הגבלה', 'צמחוני', 'טבעוני'];
const relationOptions = ['רווק/ה', 'בזוגיות'];
const cleaningFrequencyOptions = ['פעם בשבוע', 'פעמיים בשבוע', 'פעם בשבועיים', 'כאשר צריך'];
const hostingOptions = ['פעם בשבוע', 'לפעמים', 'כמה שיותר'];
const cookingOptions = ['כל אחד לעצמו', 'לפעמים מתחלקים', 'מבשלים יחד'];
const vibesOptions = ['שקטה ולימודית', 'זורמת וחברתית', 'לא משנה לי'];
const floorOptions = ['קרקע', 'נמוכה', 'ביניים', 'גבוהה', 'לא משנה לי'];
const genderPrefOptions = ['זכר', 'נקבה', 'לא משנה'];
const occupationPrefOptions = ['סטודנט', 'עובד', 'לא משנה'];
const partnerShabbatPrefOptions = ['אין בעיה', 'מעדיפ/ה שלא'];
const partnerDietPrefOptions = ['אין בעיה', 'מעדיפ/ה שלא טבעוני', 'כשר בלבד'];
const partnerSmokingPrefOptions = ['אין בעיה', 'מעדיפ/ה שלא'];
const studentYearOptions = ['שנה א׳', 'שנה ב׳', 'שנה ג׳', 'שנה ד׳', 'שנה ה׳', 'שנה ו׳', 'שנה ז׳'];
const roommateCountOptions = ['1', '2', '3', '4'];

export default function SurveyScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<SurveyState>({});
  const [cityQuery, setCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!user) return;
        const existing = await fetchUserSurvey(user.id);
        if (existing) {
          const hydrated = hydrateSurvey(existing);
          setState(hydrated);
          setCityQuery(hydrated.preferred_city || '');
          setNeighborhoodSearch('');
        } else {
          setState({ is_completed: false });
          setCityQuery('');
          setNeighborhoodSearch('');
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const query = cityQuery.trim();
      if (!query || query.length < 2) {
        if (!cancelled) setCitySuggestions([]);
        return;
      }
      const names = searchCitiesWithNeighborhoods(query, 8);
      if (!cancelled) setCitySuggestions(names);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [cityQuery, state.preferred_city]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const name = (state.preferred_city || '').trim();
      if (!name) {
        if (!cancelled) setNeighborhoodOptions([]);
        return;
      }
      try {
        const list = getNeighborhoodsForCityName(name);
        if (!cancelled) setNeighborhoodOptions(list);
      } catch {
        if (!cancelled) setNeighborhoodOptions([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [state.preferred_city]);

  // Removed Google place id resolution (local-only cities)

  const progress = useMemo(() => (currentStep + 1) / steps.length, [currentStep]);
  const filteredNeighborhoods = useMemo(() => {
    if (!neighborhoodSearch.trim()) return neighborhoodOptions;
    const query = neighborhoodSearch.trim();
    return neighborhoodOptions.filter((opt) => opt.includes(query));
  }, [neighborhoodOptions, neighborhoodSearch]);
  const moveInMonthOptions = useMemo(() => generateUpcomingMonths(18), []);
  const moveInMonthSelectOptions = useMemo(() => {
    const arr = [...moveInMonthOptions];
    if (state.move_in_month && !arr.includes(state.move_in_month)) {
      arr.unshift(state.move_in_month);
    }
    return arr;
  }, [moveInMonthOptions, state.move_in_month]);

  const setField = <K extends keyof SurveyState>(key: K, value: SurveyState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
  };
  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };
  const handleExit = () => {
    router.back();
  };

  const handleSubmit = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const payload = normalizePayload(user.id, state);
      // eslint-disable-next-line no-console
      console.log('[survey] submit payload', {
        userId: user.id,
        is_sublet: payload.is_sublet ?? null,
        sublet_month_from: (payload as any).sublet_month_from ?? null,
        sublet_month_to: (payload as any).sublet_month_to ?? null,
        hasNeighborhoods: Array.isArray((payload as any).preferred_neighborhoods)
          ? (payload as any).preferred_neighborhoods?.length
          : null,
      });
      await upsertUserSurvey(payload);
      Alert.alert('נשמר', 'השאלון נשמר בהצלחה');
      router.back();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[survey] submit error', {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
      });
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשמור כעת');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow} />
        <TouchableOpacity onPress={handleExit} style={styles.backBtn} accessibilityLabel="חזור">
          <ArrowLeft size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>שאלון העדפות</Text>
        <Text style={styles.headerSubtitle}>{steps[currentStep].title}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#A78BFA" />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {currentStep === 0 && (
              <View style={styles.stepCard}>
                <Section title="מה אני עושה ביומיום">
                  <ChipSelect
                    options={['סטודנט', 'עובד']}
                    value={normalizeToTextChoice(state.occupation, ['סטודנט', 'עובד'])}
                    onChange={(v) => {
                      setState((prev) => {
                        const next: SurveyState = { ...prev, occupation: v || null };
                        if (v !== 'סטודנט') next.student_year = undefined;
                        if (v !== 'עובד') next.works_from_home = undefined;
                        return next;
                      });
                    }}
                  />
                  {state.occupation === 'סטודנט' && (
                    <ChipSelect
                      label="שנה בתואר"
                      options={studentYearOptions}
                      value={
                        state.student_year && state.student_year >= 1 && state.student_year <= 7
                          ? studentYearOptions[state.student_year - 1]
                          : null
                      }
                      onChange={(label) => {
                        if (!label) {
                          setField('student_year', undefined);
                          return;
                        }
                        const index = studentYearOptions.indexOf(label);
                        setField('student_year', index >= 0 ? (index + 1) : undefined);
                      }}
                    />
                  )}
                  {state.occupation === 'עובד' && (
                    <ChipSelect
                      label="עובד מהבית?"
                      options={['כן', 'לא']}
                      value={
                        state.works_from_home === undefined
                          ? null
                          : state.works_from_home
                          ? 'כן'
                          : 'לא'
                      }
                      onChange={(v) => {
                        if (!v) {
                          setField('works_from_home', undefined);
                          return;
                        }
                        setField('works_from_home', v === 'כן');
                      }}
                    />
                  )}
                </Section>

                <Section title="הרגלים והעדפות">
                  <ToggleRow
                    label="שומר שבת?"
                    value={!!state.is_shomer_shabbat}
                    onToggle={(v) => setField('is_shomer_shabbat', v)}
                  />
                  <ChipSelect
                    label="התזונה שלי"
                    options={dietOptions}
                    value={state.diet_type || null}
                    onChange={(v) => setField('diet_type', v || null)}
                  />
                  <ChipSelect
                    label="אוכל כשר"
                    options={['כשר', 'לא כשר']}
                    value={
                      state.keeps_kosher === undefined
                        ? null
                        : state.keeps_kosher
                        ? 'כשר'
                        : 'לא כשר'
                    }
                    onChange={(v) => {
                      if (!v) {
                        setField('keeps_kosher', undefined);
                        return;
                      }
                      setField('keeps_kosher', v === 'כשר');
                    }}
                  />
                  <ToggleRow
                    label="מעשן?"
                    value={!!state.is_smoker}
                    onToggle={(v) => setField('is_smoker', v)}
                  />
                  <ChipSelect
                    label="מצב זוגי"
                    options={relationOptions}
                    value={state.relationship_status || null}
                    onChange={(v) => setField('relationship_status', v || null)}
                  />
                  <ToggleRow
                    label="מגיע עם בעל חיים?"
                    value={!!state.has_pet}
                    onToggle={(v) => setField('has_pet', v)}
                  />
                  <ChipSelect
                    label="סגנון חיים"
                    options={lifestyleOptions}
                    value={state.lifestyle || null}
                    onChange={(v) => setField('lifestyle', v || null)}
                  />
                </Section>

                <Section title="ניקיון ואווירה">
                  <Label text="כמה חשוב לי ניקיון? (1–5)" />
                  <Scale5 value={state.cleanliness_importance || 0} onChange={(v) => setField('cleanliness_importance', v)} />
                  <ChipSelect
                    label="תדירות ניקיון"
                    options={cleaningFrequencyOptions}
                    value={state.cleaning_frequency || null}
                    onChange={(v) => setField('cleaning_frequency', v || null)}
                  />
                  <ChipSelect
                    label="אירוחים"
                    options={hostingOptions}
                    value={state.hosting_preference || null}
                    onChange={(v) => setField('hosting_preference', v || null)}
                  />
                  <ChipSelect
                    label="אוכל ובישולים"
                    options={cookingOptions}
                    value={state.cooking_style || null}
                    onChange={(v) => setField('cooking_style', v || null)}
                  />
                  <ChipSelect
                    label="האווירה שאני מחפש"
                    options={vibesOptions}
                    value={state.home_vibe || null}
                    onChange={(v) => setField('home_vibe', v || null)}
                  />
                </Section>
              </View>
            )}

            {currentStep === 1 && (
              <View style={styles.stepCard}>
                <Section title="פרטי הדירה">
                  <LabeledInput
                    label="מחיר (₪)"
                    keyboardType="numeric"
                    value={state.price_range?.toString() || ''}
                    placeholder="לדוגמה: 3500"
                    onChangeText={(txt) => setField('price_range', toNumberOrNull(txt))}
                  />
                  <ChipSelect
                    label="חשבונות"
                    options={['כלול', 'לא כלול']}
                    value={state.bills_included === undefined ? null : state.bills_included ? 'כלול' : 'לא כלול'}
                    onChange={(v) => setField('bills_included', v === 'כלול')}
                  />
                  <View style={{ gap: 12 }}>
                    <View style={{ gap: 8 }}>
                      <Text style={styles.label}>עיר מועדפת</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="לדוגמה: תל אביב"
                        placeholderTextColor="#6B7280"
                        value={cityQuery}
                        onChangeText={(txt) => {
                          setCityQuery(txt);
                          setNeighborhoodSearch('');
                          setField('preferred_city', txt ? txt : undefined);
                          setField('preferred_neighborhoods', undefined);
                        }}
                      />
                      {citySuggestions.length > 0 ? (
                        <View style={styles.suggestionsBox}>
                          {citySuggestions.map((name, idx) => (
                            <TouchableOpacity
                              key={name}
                              style={[
                                styles.suggestionItem,
                                idx === citySuggestions.length - 1 ? styles.suggestionItemLast : null,
                              ]}
                              onPress={() => {
                                setCityQuery(name);
                                setCitySuggestions([]);
                                setNeighborhoodSearch('');
                                setField('preferred_city', name);
                                setField('preferred_neighborhoods', []);
                              }}
                            >
                              <Text style={styles.suggestionText}>{name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    {state.preferred_city ? (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.label}>שכונות מועדפות</Text>
                        {neighborhoodOptions.length ? (
                          <MultiChipSelect
                            options={filteredNeighborhoods}
                            values={state.preferred_neighborhoods || []}
                            onToggle={(option, isActive) => {
                              setState((prev) => {
                                const current = prev.preferred_neighborhoods || [];
                                const set = new Set(current);
                                if (isActive) set.add(option);
                                else set.delete(option);
                                return { ...prev, preferred_neighborhoods: Array.from(set) };
                              });
                            }}
                          />
                        ) : (
                          <Text style={styles.helperText}>בחר עיר מהרשימה כדי לראות שכונות זמינות.</Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                  <ChipSelect
                    label="קומה"
                    options={floorOptions}
                    value={state.floor_preference || null}
                    onChange={(v) => setField('floor_preference', v || null)}
                  />
                  <ToggleRow label="מרפסת / גינה" value={!!state.has_balcony} onToggle={(v) => setField('has_balcony', v)} />
                  <ToggleRow label="מעלית" value={!!state.has_elevator} onToggle={(v) => setField('has_elevator', v)} />
                  <ToggleRow label="חדר מאסטר (שירותים צמודים)" value={!!state.wants_master_room} onToggle={(v) => setField('wants_master_room', v)} />
                  <ToggleRow
                    label="האם מדובר בסאבלט?"
                    value={!!state.is_sublet}
                    onToggle={(v) =>
                      setState((prev) => {
                        const next: SurveyState = { ...prev, is_sublet: v };
                        if (!v) {
                          next.sublet_month_from = undefined;
                          next.sublet_month_to = undefined;
                        }
                        return next;
                      })
                    }
                  />
                  {state.is_sublet ? (
                    <View style={{ gap: 12 }}>
                      <LabeledInput
                        label="חודש התחלה (YYYY-MM)"
                        value={state.sublet_month_from || ''}
                        placeholder="לדוגמה: 2025-07"
                        onChangeText={(txt) => setField('sublet_month_from', txt)}
                      />
                      <LabeledInput
                        label="חודש סיום (YYYY-MM)"
                        value={state.sublet_month_to || ''}
                        placeholder="לדוגמה: 2025-09"
                        onChangeText={(txt) => setField('sublet_month_to', txt)}
                      />
                    </View>
                  ) : (
                    <ChipSelect
                      label="תאריך כניסה (חודש ושנה)"
                      options={moveInMonthSelectOptions}
                      value={state.move_in_month || null}
                      onChange={(option) => {
                        if (!option) {
                          setField('move_in_month', undefined);
                          return;
                        }
                        setField('move_in_month', option);
                      }}
                    />
                  )}
                  <ChipSelect
                    label="כמה שותפים נראה לי מתאים?"
                    options={roommateCountOptions}
                    value={state.preferred_roommates ? String(state.preferred_roommates) : null}
                    onChange={(v) => {
                      if (!v) {
                        setField('preferred_roommates', undefined);
                        return;
                      }
                      setField('preferred_roommates', parseInt(v, 10));
                    }}
                  />
                  <ToggleRow label="אפשר להביא בעלי חיים?" value={!!state.pets_allowed} onToggle={(v) => setField('pets_allowed', v)} />
                  <ChipSelect
                    label="תיווך / ישירות"
                    options={['תיווך', 'ישירות']}
                    value={
                      state.with_broker === undefined ? null : state.with_broker ? 'תיווך' : 'ישירות'
                    }
                    onChange={(v) => setField('with_broker', v === 'תיווך')}
                  />
                </Section>
              </View>
            )}

            {currentStep === 2 && (
              <View style={styles.stepCard}>
                <Section title="מאפייני השותפ/ה">
                  <LabeledInput
                    label="טווח גילאים מועדף"
                    value={state.preferred_age_range || ''}
                    placeholder="לדוגמה: 22–30"
                    onChangeText={(txt) => setField('preferred_age_range', txt)}
                  />
                  <ChipSelect
                    label="מין מועדף"
                    options={genderPrefOptions}
                    value={state.preferred_gender || null}
                    onChange={(v) => setField('preferred_gender', v || null)}
                  />
                  <ChipSelect
                    label="עיסוק"
                    options={occupationPrefOptions}
                    value={state.preferred_occupation || null}
                    onChange={(v) => setField('preferred_occupation', v || null)}
                  />
                </Section>
                <Section title="העדפות הרגלים">
                  <ChipSelect
                    label="שומר שבת"
                    options={partnerShabbatPrefOptions}
                    value={state.partner_shabbat_preference || null}
                    onChange={(v) => setField('partner_shabbat_preference', v || null)}
                  />
                  <ChipSelect
                    label="תזונה"
                    options={partnerDietPrefOptions}
                    value={state.partner_diet_preference || null}
                    onChange={(v) => setField('partner_diet_preference', v || null)}
                  />
                  <ChipSelect
                    label="מעשן"
                    options={partnerSmokingPrefOptions}
                    value={state.partner_smoking_preference || null}
                    onChange={(v) => setField('partner_smoking_preference', v || null)}
                  />
                  <ChipSelect
                    label="מגיע עם בעל חיים"
                    options={['אין בעיה', 'מעדיפ/ה שלא']}
                    value={state.partner_pets_preference || null}
                    onChange={(v) => setField('partner_pets_preference', v || null)}
                  />
                </Section>
              </View>
            )}

            <View style={[
              styles.footer,
              { marginBottom: Math.max(12, Math.ceil(tabBarHeight + insets.bottom)) }
            ]}>
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={handleBack}
                disabled={currentStep === 0 || saving}
                style={[styles.navBtn, currentStep === 0 || saving ? styles.navBtnDisabled : null]}
              >
                <ChevronRight size={18} color={currentStep === 0 || saving ? '#9DA4AE' : '#0F0F14'} />
                <Text style={[styles.navBtnText, currentStep === 0 || saving ? styles.navBtnTextDisabled : null]}>חזרה</Text>
              </TouchableOpacity>

              {currentStep < steps.length - 1 ? (
                <TouchableOpacity onPress={handleNext} disabled={saving} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>הבא</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleSubmit} disabled={saving} style={styles.primaryBtn}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#0F0F14" />
                  ) : (
                    <Text style={styles.primaryBtnText}>סיום ושמירה</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            </View>
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function normalizePayload(userId: string, s: SurveyState) {
  const payload: any = {
    user_id: userId,
    is_completed: true,
    is_sublet: s.is_sublet ?? false,
    occupation: s.occupation ?? null,
    student_year: s.student_year ?? null,
    works_from_home: s.occupation === 'עובד' ? (s.works_from_home ?? false) : null,
    keeps_kosher: s.keeps_kosher ?? false,
    is_shomer_shabbat: s.is_shomer_shabbat ?? false,
    diet_type: s.diet_type ?? null,
    is_smoker: s.is_smoker ?? false,
    relationship_status: s.relationship_status ?? null,
    has_pet: s.has_pet ?? false,
    lifestyle: s.lifestyle ?? null,
    cleanliness_importance: s.cleanliness_importance ?? null,
    cleaning_frequency: s.cleaning_frequency ?? null,
    hosting_preference: s.hosting_preference ?? null,
    cooking_style: s.cooking_style ?? null,
    home_vibe: s.home_vibe ?? null,
    price_range: s.price_range ?? null,
    bills_included: s.bills_included ?? null,
    preferred_city: s.preferred_city ?? null,
    preferred_neighborhoods:
      s.preferred_neighborhoods && s.preferred_neighborhoods.length > 0 ? s.preferred_neighborhoods : null,
    floor_preference: s.floor_preference ?? null,
    has_balcony: s.has_balcony ?? false,
    has_elevator: s.has_elevator ?? false,
    wants_master_room: s.wants_master_room ?? false,
    move_in_month: s.move_in_month ?? null,
    preferred_roommates: s.preferred_roommates ?? null,
    pets_allowed: s.pets_allowed ?? false,
    with_broker: s.with_broker ?? null,
    sublet_month_from: s.is_sublet ? (s.sublet_month_from ?? null) : null,
    sublet_month_to: s.is_sublet ? (s.sublet_month_to ?? null) : null,
    preferred_age_range: s.preferred_age_range ?? null,
    preferred_gender: s.preferred_gender ?? null,
    preferred_occupation: s.preferred_occupation ?? null,
    partner_shabbat_preference: s.partner_shabbat_preference ?? null,
    partner_diet_preference: s.partner_diet_preference ?? null,
    partner_smoking_preference: s.partner_smoking_preference ?? null,
    partner_pets_preference: s.partner_pets_preference ?? null,
  };
  return payload;
}

function toNumberOrNull(txt: string): number | null {
  const num = Number((txt || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(num) ? num : null;
}
function toIntOrNull(txt: string): number | null {
  const num = parseInt((txt || '').replace(/[^\d]/g, ''));
  return Number.isFinite(num) ? num : null;
}
function normalizeToTextChoice(value: string | undefined, options: string[]): string | null {
  if (!value) return null;
  return options.includes(value) ? value : null;
}
function extractDetailFromOccupation(value?: string | null): string | null {
  if (!value) return null;
  const parts = value.split('-').map((s) => s.trim());
  return parts.length > 1 ? parts.slice(1).join(' - ') : null;
}

function generateUpcomingMonths(count = 12): string[] {
  const monthNames = [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
  ];
  const now = new Date();
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    const current = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${monthNames[current.getMonth()]} ${current.getFullYear()}`;
    list.push(label);
  }
  return list;
}

function hydrateSurvey(existing: UserSurveyResponse): SurveyState {
  const next: SurveyState = { ...existing };

  if (existing.occupation) {
    if (existing.occupation.startsWith('סטודנט')) {
      next.occupation = 'סטודנט';
      if (!existing.student_year) {
        const detail = extractDetailFromOccupation(existing.occupation);
        if (detail) {
          const idx = studentYearOptions.indexOf(detail);
          if (idx >= 0) {
            next.student_year = idx + 1;
          }
        }
      }
    } else if (existing.occupation === 'עובד - מהבית') {
      next.occupation = 'עובד';
      next.works_from_home = true;
    }
  }

  if (existing.works_from_home !== undefined) {
    next.works_from_home = existing.works_from_home;
  }
  if (existing.keeps_kosher !== undefined) {
    next.keeps_kosher = existing.keeps_kosher;
  } else if (existing.diet_type === 'כשר') {
    next.keeps_kosher = true;
    next.diet_type = null;
  }
  if (existing.preferred_neighborhoods) {
    next.preferred_neighborhoods = [...existing.preferred_neighborhoods];
  }

  return next;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.toggleOptions}>
        <TouchableOpacity
          style={[styles.toggleBtn, value ? styles.toggleActive : null]}
          onPress={() => onToggle(true)}
        >
          <Check size={16} color={value ? '#0F0F14' : '#9DA4AE'} />
          <Text style={[styles.toggleText, value ? styles.toggleTextActive : null]}>כן</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, !value ? styles.toggleActive : null]}
          onPress={() => onToggle(false)}
        >
          <Text style={[styles.toggleText, !value ? styles.toggleTextActive : null]}>לא</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chipsWrap}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, active ? styles.chipActive : null]}
              onPress={() => onChange(active ? null : opt)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MultiChipSelect({
  label,
  options,
  values,
  onToggle,
}: {
  label?: string;
  options: string[];
  values: string[];
  onToggle: (option: string, isActive: boolean) => void;
}) {
  const uniqueOptions = useMemo(() => {
    const arr = [...options];
    const selected = values || [];
    for (const sel of selected) {
      if (!arr.includes(sel)) arr.push(sel);
    }
    return arr;
  }, [options, values]);

  const selectedSet = useMemo(() => new Set(values || []), [values]);

  return (
    <View style={{ gap: 8 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {uniqueOptions.length > 0 ? (
        <View style={styles.chipsWrap}>
          {uniqueOptions.map((opt) => {
            const active = selectedSet.has(opt);
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => onToggle(opt, !active)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={styles.helperText}>לא נמצאו שכונות תואמות.</Text>
      )}
    </View>
  );
}

function Scale5({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.scaleRow}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <TouchableOpacity key={n} onPress={() => onChange(n)} style={[styles.scaleDot, active ? styles.scaleDotActive : null]}>
            <Text style={[styles.scaleDotText, active ? styles.scaleDotTextActive : null]}>{n}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
    writingDirection: 'rtl',
    // @ts-expect-error RN Web supports CSS direction
    direction: 'rtl',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 52,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backBtnText: {
    color: '#0F0F14',
    fontWeight: '900',
    fontSize: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 10,
  },
  headerSubtitle: {
    color: '#C7CBD1',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 4,
  },
  progressTrack: {
    marginTop: 10,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#A78BFA',
    borderRadius: 999,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  stepCard: {
    backgroundColor: '#15151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'right',
  },
  label: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#1B1C27',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    textAlign: Platform.select({ ios: 'right', android: 'right', default: 'right' }) as any,
  },
  toggleRow: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12,
  },
  toggleOptions: {
    flexDirection: 'row',
    gap: 8,
    writingDirection: 'rtl',
    // @ts-expect-error RN Web supports CSS direction
    direction: 'rtl',
  },
  toggleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E1F2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleActive: {
    backgroundColor: '#A78BFA',
    borderColor: 'rgba(167,139,250,0.8)',
  },
  toggleText: {
    color: '#C7CBD1',
    fontWeight: '800',
  },
  toggleTextActive: {
    color: '#0F0F14',
  },
  helperText: {
    color: '#9DA4AE',
    fontSize: 13,
    textAlign: 'right',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
    writingDirection: 'rtl',
    // @ts-expect-error RN Web supports CSS direction
    direction: 'rtl',
  },
  chip: {
    backgroundColor: '#1E1F2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: '#7C5CFF',
    borderColor: 'rgba(124,92,255,0.8)',
  },
  chipText: {
    color: '#C7CBD1',
    fontWeight: '800',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#0F0F14',
  },
  suggestionsBox: {
    marginTop: 4,
    backgroundColor: '#1E1F2A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  scaleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  scaleDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1E1F2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleDotActive: {
    backgroundColor: '#34D399',
    borderColor: 'rgba(52,211,153,0.7)',
  },
  scaleDotText: {
    color: '#E5E7EB',
    fontWeight: '900',
  },
  scaleDotTextActive: {
    color: '#0F0F14',
  },
  footer: {
    padding: 16,
    backgroundColor: 'rgba(15,15,20,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
  },
  navBtnDisabled: {
    backgroundColor: 'rgba(229,231,235,0.4)',
  },
  navBtnText: {
    color: '#0F0F14',
    fontWeight: '900',
    fontSize: 14,
  },
  navBtnTextDisabled: {
    color: '#9DA4AE',
  },
  primaryBtn: {
    backgroundColor: '#7C5CFF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#0F0F14',
    fontWeight: '900',
    fontSize: 16,
  },
});


