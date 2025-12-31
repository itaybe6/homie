import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronRight, X } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { UserSurveyResponse } from '@/types/database';
import { fetchUserSurvey, upsertUserSurvey } from '@/lib/survey';
import { getNeighborhoodsForCityName, searchCitiesWithNeighborhoods } from '@/lib/neighborhoods';
import LavaLamp from '@/components/LavaLamp';

type SurveyState = Partial<UserSurveyResponse>;

const PRIMARY = '#5e3f2d';
// Match the login screen dark background
const BG = '#2B1A12';
const CARD = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT = '#111827';
const MUTED = '#6B7280';
const SOFT_ACCENT = 'rgba(94,63,45,0.10)';

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
const roommateCountOptions = ['1', '2', '3', '4', '5', '6'];

export default function SurveyScreen() {
  const router = useRouter();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<SurveyState>({});
  const [cityQuery, setCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  const isTransitioningRef = useRef(false);
  const transitionDirRef = useRef<1 | -1>(1);
  const animOpacity = useRef(new Animated.Value(1)).current;
  const animTranslate = useRef(new Animated.Value(0)).current;
  const latestStateRef = useRef<SurveyState>({});
  const exitingRef = useRef(false);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

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

  // Age select options (computed at top-level to keep hooks order stable)
  const minAgeSelectOptions = useMemo(() => generateNumberRange(18, 40), []);
  const maxAgeSelectOptions = useMemo(() => {
    const min = (state as any).preferred_age_min;
    const start = typeof min === 'number' ? min + 1 : 19;
    return generateNumberRange(start, 60);
  }, [(state as any).preferred_age_min]);

  useEffect(() => {
    const min = (state as any).preferred_age_min;
    const max = (state as any).preferred_age_max;
    if (typeof min === 'number' && typeof max === 'number' && max <= min) {
      setState((prev) => ({ ...(prev as any), preferred_age_max: Math.min(min + 1, 60) } as any));
    }
  }, [(state as any).preferred_age_min]);

  const setField = (key: keyof SurveyState, value: any) => {
    setState((prev) => ({ ...prev, [key]: value } as any));
  };

  type Question = {
    key: string;
    title: string;
    subtitle?: string;
    isVisible?: () => boolean;
    render: () => React.ReactNode;
  };

  const questions: Question[] = useMemo(() => {
    const q: Question[] = [
      // About you
      {
        key: 'occupation',
        title: 'מה אני עושה ביומיום?',
        subtitle: 'זה עוזר לנו להבין את הלו״ז והוייב שלך.',
        render: () => (
          <ChipSelect
            options={['סטודנט', 'עובד']}
            value={normalizeToTextChoice(state.occupation, ['סטודנט', 'עובד'])}
            onChange={(v) => {
              setState((prev) => {
                const next: SurveyState = { ...prev, occupation: v || undefined };
                if (v !== 'סטודנט') next.student_year = undefined;
                if (v !== 'עובד') next.works_from_home = undefined;
                return next;
              });
            }}
          />
        ),
      },
      {
        key: 'student_year',
        title: 'באיזו שנה בתואר?',
        isVisible: () => state.occupation === 'סטודנט',
        render: () => (
          <ChipSelect
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
        ),
      },
      {
        key: 'works_from_home',
        title: 'עובד/ת מהבית?',
        isVisible: () => state.occupation === 'עובד',
        render: () => (
          <ChipSelect
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
        ),
      },
      { key: 'shabbat', title: 'שומר/ת שבת?', render: () => <ToggleRow label="שומר/ת שבת?" value={!!state.is_shomer_shabbat} onToggle={(v) => setField('is_shomer_shabbat', v)} /> },
      { key: 'diet', title: 'מה התזונה שלי?', render: () => <ChipSelect options={dietOptions} value={state.diet_type || null} onChange={(v) => setField('diet_type', v || null)} /> },
      {
        key: 'kosher',
        title: 'אוכל כשר?',
        render: () => (
          <ChipSelect
            options={['כשר', 'לא כשר']}
            value={state.keeps_kosher === undefined ? null : state.keeps_kosher ? 'כשר' : 'לא כשר'}
            onChange={(v) => {
              if (!v) {
                setField('keeps_kosher', undefined);
                return;
              }
              setField('keeps_kosher', v === 'כשר');
            }}
          />
        ),
      },
      { key: 'smoker', title: 'מעשן/ת?', render: () => <ToggleRow label="מעשן/ת?" value={!!state.is_smoker} onToggle={(v) => setField('is_smoker', v)} /> },
      { key: 'relationship', title: 'מצב זוגי', render: () => <ChipSelect options={relationOptions} value={state.relationship_status || null} onChange={(v) => setField('relationship_status', v || null)} /> },
      { key: 'pet', title: 'מגיע/ה עם בעל חיים?', render: () => <ToggleRow label="מגיע/ה עם בעל חיים?" value={!!state.has_pet} onToggle={(v) => setField('has_pet', v)} /> },
      { key: 'lifestyle', title: 'האופי היומיומי שלי', render: () => <ChipSelect options={lifestyleOptions} value={state.lifestyle || null} onChange={(v) => setField('lifestyle', v || null)} /> },
      {
        key: 'cleanliness',
        title: 'כמה חשוב לי ניקיון?',
        subtitle: 'בחר/י ערך בין 1 ל-5',
        render: () => (
          <View style={{ gap: 10 }}>
            <Label text="כמה חשוב לי ניקיון? (1–5)" />
            <Scale5 value={state.cleanliness_importance || 0} onChange={(v) => setField('cleanliness_importance', v)} />
          </View>
        ),
      },
      { key: 'cleaning_frequency', title: 'תדירות ניקיון', render: () => <ChipSelect options={cleaningFrequencyOptions} value={state.cleaning_frequency || null} onChange={(v) => setField('cleaning_frequency', v || null)} /> },
      { key: 'hosting', title: 'אירוחים', render: () => <ChipSelect options={hostingOptions} value={state.hosting_preference || null} onChange={(v) => setField('hosting_preference', v || null)} /> },
      { key: 'cooking', title: 'אוכל ובישולים', render: () => <ChipSelect options={cookingOptions} value={state.cooking_style || null} onChange={(v) => setField('cooking_style', v || null)} /> },
      { key: 'home_vibe', title: 'אווירה בבית', render: () => <ChipSelect options={vibesOptions} value={state.home_vibe || null} onChange={(v) => setField('home_vibe', v || null)} /> },

      // Apartment you want
      { key: 'price', title: 'תקציב שכירות (₪)', render: () => <LabeledInput label="מחיר (₪)" keyboardType="numeric" value={state.price_range?.toString() || ''} placeholder="לדוגמה: 3500" onChangeText={(txt) => setField('price_range', toNumberOrNull(txt))} /> },
      {
        key: 'bills',
        title: 'חשבונות כלולים?',
        render: () => (
          <TriChoiceRow
            label="חשבונות כלולים?"
            value={state.bills_included ?? null}
            yesLabel="כלולים"
            noLabel="לא כלולים"
            anyLabel="לא משנה לי"
            onChange={(v) => setField('bills_included', v)}
          />
        ),
      },
      {
        key: 'preferred_city',
        title: 'עיר מועדפת',
        render: () => (
          <View style={{ gap: 10 }}>
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
                    style={[styles.suggestionItem, idx === citySuggestions.length - 1 ? styles.suggestionItemLast : null]}
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
        ),
      },
      {
        key: 'preferred_neighborhoods',
        title: 'שכונות מועדפות',
        isVisible: () => !!state.preferred_city,
        render: () => (
          <View style={{ gap: 10 }}>
            <Text style={styles.label}>שכונות מועדפות</Text>
            {neighborhoodOptions.length ? (
              <TouchableOpacity
                style={[
                  styles.chip,
                  (state.preferred_neighborhoods || []).length === neighborhoodOptions.length
                    ? styles.chipActive
                    : null,
                ]}
                activeOpacity={0.9}
                onPress={() => {
                  const isAll = (state.preferred_neighborhoods || []).length === neighborhoodOptions.length;
                  setField('preferred_neighborhoods', isAll ? [] : [...neighborhoodOptions]);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    (state.preferred_neighborhoods || []).length === neighborhoodOptions.length
                      ? styles.chipTextActive
                      : null,
                  ]}
                >
                  הכל
                </Text>
              </TouchableOpacity>
            ) : null}
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
              <Text style={styles.helperText}>בחר/י עיר כדי לראות שכונות זמינות.</Text>
            )}
          </View>
        ),
      },
      { key: 'floor', title: 'קומה מועדפת', render: () => <ChipSelect options={floorOptions} value={state.floor_preference || null} onChange={(v) => setField('floor_preference', v || null)} /> },
      {
        key: 'balcony',
        title: 'מרפסת / גינה',
        render: () => (
          <TriChoiceRow
            label="עם מרפסת / גינה"
            value={state.has_balcony ?? null}
            anyLabel="לא משנה לי"
            onChange={(v) => setField('has_balcony', v)}
          />
        ),
      },
      {
        key: 'elevator',
        title: 'מעלית',
        render: () => (
          <TriChoiceRow
            label="מעלית"
            value={state.has_elevator ?? null}
            anyLabel="לא משנה לי"
            onChange={(v) => setField('has_elevator', v)}
          />
        ),
      },
      {
        key: 'master',
        title: 'חדר מאסטר',
        render: () => (
          <TriChoiceRow
            label="חדר מאסטר"
            value={state.wants_master_room ?? null}
            anyLabel="לא משנה לי"
            onChange={(v) => setField('wants_master_room', v)}
          />
        ),
      },
      {
        key: 'is_sublet',
        title: 'סאבלט?',
        render: () => (
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
        ),
      },
      {
        key: 'sublet_period',
        title: 'טווח סאבלט',
        isVisible: () => !!state.is_sublet,
        render: () => (
          <View style={{ gap: 12 }}>
            <LabeledInput label="חודש התחלה (YYYY-MM)" value={state.sublet_month_from || ''} placeholder="לדוגמה: 2025-07" onChangeText={(txt) => setField('sublet_month_from', txt)} />
            <LabeledInput label="חודש סיום (YYYY-MM)" value={state.sublet_month_to || ''} placeholder="לדוגמה: 2025-09" onChangeText={(txt) => setField('sublet_month_to', txt)} />
          </View>
        ),
      },
      {
        key: 'move_in_month',
        title: 'חודש כניסה',
        isVisible: () => !state.is_sublet,
        render: () => (
          <SelectInput label="תאריך כניסה (חודש ושנה)" options={moveInMonthSelectOptions} value={state.move_in_month || null} placeholder="בחר חודש ושנה" onChange={(option) => setField('move_in_month', option || undefined)} />
        ),
      },
      {
        key: 'roommates',
        title: 'כמה שותפים?',
        render: () => (
          <View style={{ gap: 12 }}>
            <SelectInput
              label="מינימום שותפים"
              options={roommateCountOptions}
              value={(state as any).preferred_roommates_min != null ? String((state as any).preferred_roommates_min) : null}
              placeholder="לא משנה"
              onChange={(v) => setField('preferred_roommates_min' as any, v ? parseInt(v, 10) : null)}
            />
            <SelectInput
              label="מקסימום שותפים"
              options={roommateCountOptions}
              value={(state as any).preferred_roommates_max != null ? String((state as any).preferred_roommates_max) : null}
              placeholder="לא משנה"
              onChange={(v) => setField('preferred_roommates_max' as any, v ? parseInt(v, 10) : null)}
            />
          </View>
        ),
      },
      { key: 'pets_allowed', title: 'אפשר להביא חיות לדירה?', render: () => <ToggleRow label="אפשר להביא בעלי חיים?" value={!!state.pets_allowed} onToggle={(v) => setField('pets_allowed', v)} /> },
      {
        key: 'broker',
        title: 'תיווך',
        render: () => (
          <TriChoiceRow
            label="תיווך"
            value={state.with_broker ?? null}
            yesLabel="עם תיווך"
            noLabel="בלי תיווך"
            anyLabel="לא משנה לי"
            onChange={(v) => setField('with_broker', v)}
          />
        ),
      },

      // Partner you want
      {
        key: 'age_min',
        title: 'גיל מינימלי לשותפ/ה',
        render: () => (
          <SelectInput
            label="גיל מינימלי"
            options={minAgeSelectOptions}
            value={(state as any).preferred_age_min != null ? String((state as any).preferred_age_min) : null}
            placeholder="בחר גיל"
            onChange={(v) => setState((prev) => ({ ...(prev as any), preferred_age_min: v ? parseInt(v, 10) : undefined } as any))}
          />
        ),
      },
      {
        key: 'age_max',
        title: 'גיל מקסימלי לשותפ/ה',
        render: () => (
          <SelectInput
            label="גיל מקסימלי"
            options={maxAgeSelectOptions}
            value={(state as any).preferred_age_max != null ? String((state as any).preferred_age_max) : null}
            placeholder="בחר גיל"
            onChange={(v) => setState((prev) => ({ ...(prev as any), preferred_age_max: v ? parseInt(v, 10) : undefined } as any))}
          />
        ),
      },
      { key: 'pref_gender', title: 'מין מועדף', render: () => <ChipSelect options={genderPrefOptions} value={state.preferred_gender || null} onChange={(v) => setField('preferred_gender', v || null)} /> },
      { key: 'pref_occ', title: 'עיסוק מועדף', render: () => <ChipSelect options={occupationPrefOptions} value={state.preferred_occupation || null} onChange={(v) => setField('preferred_occupation', v || null)} /> },
      { key: 'partner_shabbat', title: 'שותפים ושבת', render: () => <ChipSelect options={partnerShabbatPrefOptions} value={state.partner_shabbat_preference || null} onChange={(v) => setField('partner_shabbat_preference', v || null)} /> },
      { key: 'partner_diet', title: 'שותפים ותזונה', render: () => <ChipSelect options={partnerDietPrefOptions} value={state.partner_diet_preference || null} onChange={(v) => setField('partner_diet_preference', v || null)} /> },
      { key: 'partner_smoking', title: 'שותפים ועישון', render: () => <ChipSelect options={partnerSmokingPrefOptions} value={state.partner_smoking_preference || null} onChange={(v) => setField('partner_smoking_preference', v || null)} /> },
      { key: 'partner_pets', title: 'שותפים וחיות', render: () => <ChipSelect options={['אין בעיה', 'מעדיפ/ה שלא']} value={state.partner_pets_preference || null} onChange={(v) => setField('partner_pets_preference', v || null)} /> },
    ];

    return q.filter((item) => (item.isVisible ? item.isVisible() : true));
  }, [
    state,
    cityQuery,
    citySuggestions,
    neighborhoodOptions,
    neighborhoodSearch,
    filteredNeighborhoods,
    moveInMonthSelectOptions,
    minAgeSelectOptions,
    maxAgeSelectOptions,
  ]);

  const totalQuestions = questions.length;
  const clampedIndex = totalQuestions > 0 ? Math.min(currentStep, totalQuestions - 1) : 0;
  const currentQuestion = totalQuestions > 0 ? questions[clampedIndex] : null;
  // Keep the popup size consistent across all questions and prevent edge clipping on small screens
  const popupCardWidth = useMemo(() => Math.min(Math.max(screenWidth - 32, 320), 420), [screenWidth]);
  const popupCardMaxHeight = useMemo(() => Math.min(Math.max(screenHeight - 180, 520), 680), [screenHeight]);

  useEffect(() => {
    if (totalQuestions === 0) return;
    if (currentStep > totalQuestions - 1) setCurrentStep(totalQuestions - 1);
  }, [totalQuestions, currentStep]);

  const goToStep = (nextStep: number) => {
    if (nextStep === currentStep) return;
    if (nextStep < 0 || nextStep > totalQuestions - 1) return;
    if (isTransitioningRef.current) return;

    isTransitioningRef.current = true;
    transitionDirRef.current = nextStep > currentStep ? 1 : -1;

    // RTL-friendly: "Next" slides in from the left (negative X), "Back" from the right (positive X)
    const outX = transitionDirRef.current === 1 ? -18 : 18;
    const inX = transitionDirRef.current === 1 ? 18 : -18;

    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animTranslate, {
        toValue: outX,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentStep(nextStep);
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });

      animTranslate.setValue(inX);
      animOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(animOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(animTranslate, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        isTransitioningRef.current = false;
      });
    });
  };

  const handleNext = () => {
    if (saving) return;
    if (currentStep < totalQuestions - 1) goToStep(currentStep + 1);
  };
  const handleBack = () => {
    if (saving) return;
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const payload = normalizePayload(user.id, state, { isCompleted: true });
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

  const saveDraft = async (): Promise<void> => {
    if (!user?.id) return;
    const payload = normalizePayload(user.id, latestStateRef.current, { isCompleted: false });
    await upsertUserSurvey(payload);
  };

  const handleExit = async () => {
    if (saving) return;
    try {
      setSaving(true);
      await saveDraft();
      router.back();
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשמור טיוטה כעת');
    } finally {
      setSaving(false);
    }
  };

  // Save draft on any navigation away (hardware back, gestures, header back, etc.)
  useEffect(() => {
    if (!user?.id) return;
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      // Prevent infinite loop when we dispatch the saved action
      if (exitingRef.current) return;
      // If we're already saving, let the navigation proceed
      if (saving) return;

      // We want to save draft before leaving
      e.preventDefault();
      exitingRef.current = true;
      (async () => {
        try {
          setSaving(true);
          await saveDraft();
        } catch {
          // Best-effort: even if draft save fails, allow leaving
        } finally {
          setSaving(false);
          navigation.dispatch(e.data.action);
          // reset in next tick
          setTimeout(() => {
            exitingRef.current = false;
          }, 0);
        }
      })();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, user?.id]);

  return (
    <View style={styles.root}>
      <LavaLamp hue="orange" intensity={60} count={5} duration={16000} backgroundColor={BG} />
      <View style={styles.container}>
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : (
        <>
          <View style={styles.popupOverlay}>
            <Animated.View style={{ opacity: animOpacity, transform: [{ translateX: animTranslate }] }}>
              <View style={styles.bgTitleWrap}>
                <Text style={styles.bgTitle}>שאלון העדפות</Text>
                <Text style={styles.bgSubtitle}>מלא/י את השאלה למטה</Text>
              </View>
              <View style={[styles.popupCard, { width: popupCardWidth, maxHeight: popupCardMaxHeight }]}>
                <TouchableOpacity
                  style={styles.exitBtn}
                  onPress={handleExit}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="יציאה ושמירה"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={PRIMARY} />
                  ) : (
                    <X size={18} color={PRIMARY} />
                  )}
                </TouchableOpacity>
                <View style={styles.popupHeader}>
                  <Text style={styles.popupTitle}>{currentQuestion?.title || ''}</Text>
                  <Text style={styles.popupMeta}>{`שאלה ${Math.min(clampedIndex + 1, totalQuestions)} מתוך ${totalQuestions}`}</Text>
                </View>
                {!!currentQuestion?.subtitle && <Text style={styles.popupSubtitle}>{currentQuestion.subtitle}</Text>}

                <ScrollView
                  ref={scrollRef}
                  style={styles.popupBody}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={false}
                >
                  {currentQuestion?.render?.()}
                </ScrollView>

                <View style={styles.inlineFooter}>
                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      onPress={handleBack}
                      disabled={clampedIndex === 0 || saving}
                      style={[styles.navBtn, clampedIndex === 0 || saving ? styles.navBtnDisabled : null]}
                    >
                      <ChevronRight size={18} color={clampedIndex === 0 || saving ? MUTED : PRIMARY} />
                      <Text style={[styles.navBtnText, clampedIndex === 0 || saving ? styles.navBtnTextDisabled : null]}>חזרה</Text>
                    </TouchableOpacity>

                    {clampedIndex < totalQuestions - 1 ? (
                      <TouchableOpacity
                        onPress={handleNext}
                        disabled={saving}
                        style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null]}
                      >
                        <Text style={styles.primaryBtnText}>הבא</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={saving}
                        style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null]}
                      >
                        {saving ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.primaryBtnText}>סיום ושמירה</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </Animated.View>
          </View>
        </>
      )}
      </View>
    </View>
  );
}

function normalizePayload(
  userId: string,
  s: SurveyState,
  opts: { isCompleted: boolean }
) {
  const coerce = opts.isCompleted; // On final submit we coerce booleans; on draft we keep nulls.
  const payload: any = {
    user_id: userId,
    is_completed: opts.isCompleted,
    is_sublet: coerce ? (s.is_sublet ?? false) : (s.is_sublet ?? null),
    occupation: s.occupation ?? null,
    student_year: s.student_year ?? null,
    works_from_home:
      s.occupation === 'עובד'
        ? coerce
          ? (s.works_from_home ?? false)
          : (s.works_from_home ?? null)
        : null,
    keeps_kosher: coerce ? (s.keeps_kosher ?? false) : (s.keeps_kosher ?? null),
    is_shomer_shabbat: coerce ? (s.is_shomer_shabbat ?? false) : (s.is_shomer_shabbat ?? null),
    diet_type: s.diet_type ?? null,
    is_smoker: coerce ? (s.is_smoker ?? false) : (s.is_smoker ?? null),
    relationship_status: s.relationship_status ?? null,
    has_pet: coerce ? (s.has_pet ?? false) : (s.has_pet ?? null),
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
    has_balcony: s.has_balcony ?? null,
    has_elevator: s.has_elevator ?? null,
    wants_master_room: s.wants_master_room ?? null,
    move_in_month: s.move_in_month ?? null,
    preferred_roommates_min: (s as any).preferred_roommates_min ?? null,
    preferred_roommates_max: (s as any).preferred_roommates_max ?? null,
    preferred_roommates:
      (s as any).preferred_roommates_max ??
      (s as any).preferred_roommates_min ??
      s.preferred_roommates ??
      null,
    pets_allowed: coerce ? (s.pets_allowed ?? false) : (s.pets_allowed ?? null),
    with_broker: s.with_broker ?? null,
    sublet_month_from: s.is_sublet ? (s.sublet_month_from ?? null) : null,
    sublet_month_to: s.is_sublet ? (s.sublet_month_to ?? null) : null,
    preferred_age_min:
      (s as any).preferred_age_min !== undefined && (s as any).preferred_age_min !== null
        ? (s as any).preferred_age_min
        : null,
    preferred_age_max:
      (s as any).preferred_age_max !== undefined && (s as any).preferred_age_max !== null
        ? (s as any).preferred_age_max
        : null,
    preferred_gender: s.preferred_gender ?? null,
    preferred_occupation: s.preferred_occupation ?? null,
    partner_shabbat_preference: s.partner_shabbat_preference ?? null,
    partner_diet_preference: s.partner_diet_preference ?? null,
    partner_smoking_preference: s.partner_smoking_preference ?? null,
    partner_pets_preference: s.partner_pets_preference ?? null,
  };
  // Ensure sanity: if both ages exist and min > max, swap them
  if (
    payload.preferred_age_min !== null &&
    payload.preferred_age_max !== null &&
    payload.preferred_age_min > payload.preferred_age_max
  ) {
    const tmp = payload.preferred_age_min;
    payload.preferred_age_min = payload.preferred_age_max;
    payload.preferred_age_max = tmp;
  }
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

function generateNumberRange(start: number, end: number): string[] {
  const arr: string[] = [];
  for (let i = start; i <= end; i++) {
    arr.push(String(i));
  }
  return arr;
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
    next.diet_type = undefined;
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

function SelectInput({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  placeholder?: string;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.input}
        activeOpacity={0.9}
        onPress={() => setOpen(true)}
        accessibilityLabel={label}
      >
        <Text style={value ? styles.selectText : styles.selectPlaceholder}>
          {value || placeholder || 'בחר'}
        </Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{label}</Text>
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              {options.map((opt) => {
                const active = value === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.pickerOption, active ? styles.pickerOptionActive : null]}
                    onPress={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pickerOptionText, active ? styles.pickerOptionTextActive : null]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setOpen(false)}>
              <Text style={styles.pickerCancelText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

function TriChoiceRow({
  label,
  value,
  onChange,
  yesLabel = 'כן',
  noLabel = 'לא',
  anyLabel = 'לא משנה לי',
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
  anyLabel?: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.toggleOptions}>
        <TouchableOpacity
          style={[styles.toggleBtn, value === true ? styles.toggleActive : null]}
          onPress={() => onChange(true)}
        >
          <Check size={16} color={value === true ? '#0F0F14' : '#9DA4AE'} />
          <Text style={[styles.toggleText, value === true ? styles.toggleTextActive : null]}>{yesLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, value === false ? styles.toggleActive : null]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.toggleText, value === false ? styles.toggleTextActive : null]}>{noLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, value === null ? styles.toggleActive : null]}
          onPress={() => onChange(null)}
        >
          <Text style={[styles.toggleText, value === null ? styles.toggleTextActive : null]}>{anyLabel}</Text>
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
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    writingDirection: 'rtl',
  },
  popupOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  bgTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  bgTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  bgSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  popupCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
    overflow: 'hidden',
  },
  exitBtn: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  popupHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  popupTitle: {
    color: PRIMARY,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  popupMeta: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  popupSubtitle: {
    marginTop: 6,
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  popupBody: {
    marginTop: 12,
    maxHeight: 560,
  },
  sheet: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    color: PRIMARY,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
  },
  sheetMeta: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
  },
  sheetSubtitle: {
    marginTop: 6,
    color: '#374151',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,231,235,0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  headerTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  backBtnText: {
    color: '#0F0F14',
    fontWeight: '900',
    fontSize: 14,
  },
  headerTextRow: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: {
    color: PRIMARY,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 10,
  },
  headerStepMeta: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
    marginTop: 10,
  },
  headerSubtitle: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 4,
  },
  progressTrack: {
    marginTop: 10,
    height: 8,
    backgroundColor: 'rgba(17,24,39,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: PRIMARY,
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
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: PRIMARY,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'right',
  },
  label: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    color: TEXT,
    fontSize: 16,
    borderWidth: 1,
    borderColor: BORDER,
    textAlign: 'right',
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
    justifyContent: 'flex-end',
  },
  toggleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleActive: {
    backgroundColor: SOFT_ACCENT,
    borderColor: 'rgba(94,63,45,0.35)',
  },
  toggleText: {
    color: MUTED,
    fontWeight: '800',
  },
  toggleTextActive: {
    color: PRIMARY,
  },
  helperText: {
    color: MUTED,
    fontSize: 13,
    textAlign: 'right',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    writingDirection: 'rtl',
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: SOFT_ACCENT,
    borderColor: 'rgba(94,63,45,0.35)',
  },
  chipText: {
    color: TEXT,
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'right',
  },
  chipTextActive: {
    color: PRIMARY,
  },
  selectText: {
    color: TEXT,
    fontSize: 16,
    textAlign: 'right',
  },
  selectPlaceholder: {
    color: MUTED,
    fontSize: 16,
    textAlign: 'right',
  },
  pickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(17,24,39,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pickerSheet: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
  },
  pickerTitle: {
    color: PRIMARY,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionActive: {
    backgroundColor: SOFT_ACCENT,
  },
  pickerOptionText: {
    color: TEXT,
    fontSize: 16,
    textAlign: 'right',
    fontWeight: '700',
  },
  pickerOptionTextActive: {
    color: PRIMARY,
  },
  pickerCancel: {
    marginTop: 8,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pickerCancelText: {
    color: PRIMARY,
    fontWeight: '800',
  },
  suggestionsBox: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionText: {
    color: TEXT,
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
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleDotActive: {
    backgroundColor: SOFT_ACCENT,
    borderColor: 'rgba(94,63,45,0.35)',
  },
  scaleDotText: {
    color: TEXT,
    fontWeight: '900',
  },
  scaleDotTextActive: {
    color: PRIMARY,
  },
  inlineFooter: {
    marginTop: 14,
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
  },
  navBtnDisabled: {
    opacity: 0.55,
  },
  navBtnText: {
    color: PRIMARY,
    fontWeight: '900',
    fontSize: 14,
  },
  navBtnTextDisabled: {
    color: MUTED,
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
});




