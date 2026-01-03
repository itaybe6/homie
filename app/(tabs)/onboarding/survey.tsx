import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Modal,
  I18nManager,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Sparkles, Check, ChevronRight, X } from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuthStore } from '@/stores/authStore';
import { UserSurveyResponse } from '@/types/database';
import { fetchUserSurvey, upsertUserSurvey } from '@/lib/survey';
import { getNeighborhoodsForCityName, searchCitiesWithNeighborhoods } from '@/lib/neighborhoods';
import { autocompleteMapbox } from '@/lib/mapboxAutocomplete';
import LavaLamp from '@/components/LavaLamp';
import { KeyFabPanel } from '@/components/KeyFabPanel';
import MaskedView from '@react-native-masked-view/masked-view';
import { Circle, Defs, RadialGradient, Stop, Svg } from 'react-native-svg';
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';


type SurveyState = Partial<UserSurveyResponse>;

type CitySuggestion = { id: string; text: string };

const PRIMARY = '#5e3f2d';
// Match the login screen dark background
const BG = '#2B1A12';
const CARD = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT = '#111827';
const MUTED = '#6B7280';
const SOFT_ACCENT = 'rgba(94,63,45,0.10)';

// (Animation removed) Survey is rendered as a single static card.
const PROGRESS_RING_LINES = 100;

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
// Roommates are now selected via sliders (1–5) in two separate steps.
const HEB_MONTH_NAMES = [
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

export default function SurveyScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = String(params?.mode || '') === 'edit';
  const router = useRouter();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<SurveyState>({});
  const [resumeStepKey, setResumeStepKey] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const [measuredBodyHeight, setMeasuredBodyHeight] = useState<number>(44);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [editSelectedPart, setEditSelectedPart] = useState<1 | 2 | 3 | null>(null);
  const editSnapshotRef = useRef<SurveyState | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  // Month picker (shared KeyFabPanel) — must live outside the clipped card.
  type MonthPickerTarget = 'sublet_month_from' | 'sublet_month_to' | 'move_in_month';
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerTarget, setMonthPickerTarget] = useState<MonthPickerTarget>('move_in_month');
  const [monthPickerTitle, setMonthPickerTitle] = useState<string>('בחר חודש');
  const [monthPickerTempDate, setMonthPickerTempDate] = useState<Date>(() => new Date());
  const [monthPickerPendingDate, setMonthPickerPendingDate] = useState<Date | null>(null);

  // List picker (KeyFabPanel) for select-style questions (e.g. age).
  type ListPickerTarget = 'preferred_age_min' | 'preferred_age_max';
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [listPickerTarget, setListPickerTarget] = useState<ListPickerTarget>('preferred_age_min');
  const [listPickerTitle, setListPickerTitle] = useState<string>('בחר');

  const latestStateRef = useRef<SurveyState>({});
  const exitingRef = useRef(false);
  const latestStepKeyRef = useRef<string | null>(null);
  const didResumeRef = useRef(false);
  const transitionDirRef = useRef<1 | -1>(1);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
          setResumeStepKey(existing.is_completed ? null : (existing.draft_step_key ?? null));
          didResumeRef.current = false;
        } else {
          setState({ is_completed: false });
          setCityQuery('');
          setNeighborhoodSearch('');
          setResumeStepKey(null);
          didResumeRef.current = true;
          setCurrentStep(0);
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
    const run = async () => {
      const query = cityQuery.trim();
      if (!query || query.length < 1) {
        if (!cancelled) setCitySuggestions([]);
        return;
      }

      // Prefer Mapbox autocomplete (same UX as registration city picker). Fallback to local list if token missing.
      if (mapboxToken) {
        const results = await autocompleteMapbox({
          accessToken: mapboxToken,
          query,
          country: 'il',
          language: 'he',
          limit: 8,
          types: 'place,locality',
        });
        if (cancelled) return;
        setCitySuggestions(results.map((f) => ({ id: f.id, text: f.text })));
        return;
      }

      const names = searchCitiesWithNeighborhoods(query, 8);
      if (!cancelled) setCitySuggestions(names.map((name) => ({ id: `local:${name}`, text: name })));
    };

    const t = setTimeout(() => {
      run();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cityQuery, mapboxToken]);

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

  // Keep roommates min/max consistent (1–5). If max is set and falls below min, bump it up.
  useEffect(() => {
    const min = (state as any).preferred_roommates_min;
    const max = (state as any).preferred_roommates_max;
    if (typeof min === 'number' && typeof max === 'number' && max < min) {
      setState((prev) => ({ ...(prev as any), preferred_roommates_max: min } as any));
    }
  }, [(state as any).preferred_roommates_min]);

  const setField = (key: keyof SurveyState, value: any) => {
    setState((prev) => ({ ...prev, [key]: value } as any));
  };

  const openListPicker = (target: ListPickerTarget, title: string) => {
    Keyboard.dismiss();
    setListPickerTarget(target);
    setListPickerTitle(title);
    setListPickerOpen(true);
  };

  const commitListPicker = (option: string) => {
    if (listPickerTarget === 'preferred_age_min') {
      const num = parseInt(option, 10);
      setState((prev) => ({ ...(prev as any), preferred_age_min: Number.isFinite(num) ? num : undefined } as any));
      setListPickerOpen(false);
      return;
    }
    if (listPickerTarget === 'preferred_age_max') {
      const num = parseInt(option, 10);
      setState((prev) => ({ ...(prev as any), preferred_age_max: Number.isFinite(num) ? num : undefined } as any));
      setListPickerOpen(false);
      return;
    }
    setListPickerOpen(false);
  };

  const openMonthPicker = (target: MonthPickerTarget, title: string, currentValue?: string | null) => {
    Keyboard.dismiss();
    const parsed = parseYYYYMM(currentValue ?? null);
    const base = parsed ?? new Date();
    setMonthPickerTarget(target);
    setMonthPickerTitle(title);
    setMonthPickerTempDate(new Date(base.getFullYear(), base.getMonth(), 1));
    setMonthPickerPendingDate(null);
    setMonthPickerOpen(true);
  };

  const commitMonthPicker = (picked: Date) => {
    const yyyymm = formatDateToYYYYMM(new Date(picked.getFullYear(), picked.getMonth(), 1));

    if (monthPickerTarget === 'move_in_month') {
      setField('move_in_month', yyyymm);
      setMonthPickerOpen(false);
      return;
    }

    if (monthPickerTarget === 'sublet_month_from') {
      setState((prev) => {
        const next: SurveyState = { ...prev, sublet_month_from: yyyymm };
        const from = parseYYYYMM(yyyymm);
        const to = parseYYYYMM(next.sublet_month_to);
        if (from && to && to < from) next.sublet_month_to = yyyymm;
        return next;
      });
      setMonthPickerOpen(false);
      return;
    }

    if (monthPickerTarget === 'sublet_month_to') {
      setState((prev) => {
        const next: SurveyState = { ...prev, sublet_month_to: yyyymm };
        const from = parseYYYYMM(next.sublet_month_from);
        const to = parseYYYYMM(yyyymm);
        if (from && to && to < from) next.sublet_month_from = yyyymm;
        return next;
      });
      setMonthPickerOpen(false);
    }
  };

  const clearMonthPicker = () => {
    if (monthPickerTarget === 'move_in_month') setField('move_in_month', undefined);
    if (monthPickerTarget === 'sublet_month_from') setField('sublet_month_from', undefined as any);
    if (monthPickerTarget === 'sublet_month_to') setField('sublet_month_to', undefined as any);
    setMonthPickerOpen(false);
  };

  type Question = {
    key: string;
    title: string;
    subtitle?: string;
    isVisible?: () => boolean;
    render: () => React.ReactNode;
  };

type SurveyItem =
  | {
      type: 'section';
      key: string;
      partNumber: 1 | 2 | 3;
      title: string;
      subtitle: string;
    }
  | {
      type: 'question';
      key: string;
      partNumber: 1 | 2 | 3;
      question: Question;
    };

type CarouselDotProps = {
  activeIndex: SharedValue<number>;
  index: number;
  dotSize: number;
};

function CarouselDot({ activeIndex, index, dotSize }: CarouselDotProps) {
  const isActive = useDerivedValue(() => activeIndex.value === index);
  const anim = useDerivedValue(() => (isActive.value ? withSpring(1) : withSpring(0)));

  const stylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(anim.value, [0, 1], [0.5, 1]),
      width: interpolate(anim.value, [0, 1], [dotSize, dotSize * 3.5]),
      height: dotSize,
      borderRadius: dotSize / 2,
      overflow: 'hidden',
    };
  });

  const fillStylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(anim.value, [0, 1], [0, 1]),
      width: `${interpolate(anim.value, [0, 1], [0, 100])}%`,
    };
  });

  return (
    <Animated.View style={[stylez, { backgroundColor: '#242424' }]}>
      <Animated.View style={[fillStylez, { backgroundColor: '#fff', height: '100%' }]} />
    </Animated.View>
  );
}

function PartCarouselPagination({
  partNumber,
  count,
  index,
  onJump,
}: {
  partNumber: 1 | 2 | 3;
  count: number;
  index: number;
  onJump: (index: number) => void;
}) {
  const activeIndex = useSharedValue(index);
  useEffect(() => {
    if (activeIndex.value !== index) {
      activeIndex.value = withTiming(index, { duration: 180 });
    }
  }, [index, activeIndex]);

  const dotSize = 9;
  const maxDots = 7;
  const start = count <= maxDots ? 0 : Math.min(Math.max(index - Math.floor(maxDots / 2), 0), count - maxDots);
  const visible = Array.from({ length: Math.min(count, maxDots) }).map((_, i) => start + i);

  return (
    <View style={styles.carouselWrap}>
      <View style={styles.carouselDotsPill}>
        <View style={styles.carouselDotsRow}>
          {visible.map((dotIndex) => (
            <TouchableOpacity
              key={`dot-${dotIndex}`}
              onPress={() => onJump(dotIndex)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`עבור לשאלה ${dotIndex + 1} בחלק`}
            >
              <CarouselDot activeIndex={activeIndex} index={dotIndex} dotSize={dotSize} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

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
      // Title is already displayed in the card header; avoid repeating it inside the toggle row.
      { key: 'shabbat', title: 'שומר/ת שבת?', render: () => <ToggleRow value={!!state.is_shomer_shabbat} onToggle={(v) => setField('is_shomer_shabbat', v)} centerOptions showYesIcon={false} /> },
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
      // Title is already displayed in the card header; avoid repeating it inside the toggle row.
      { key: 'smoker', title: 'מעשן/ת?', render: () => <ToggleRow value={!!state.is_smoker} onToggle={(v) => setField('is_smoker', v)} centerOptions showYesIcon={false} /> },
      { key: 'relationship', title: 'מצב זוגי', render: () => <ChipSelect options={relationOptions} value={state.relationship_status || null} onChange={(v) => setField('relationship_status', v || null)} /> },
      // Title is already displayed in the card header; avoid repeating it inside the toggle row.
      { key: 'pet', title: 'מגיע/ה עם בעל חיים?', render: () => <ToggleRow value={!!state.has_pet} onToggle={(v) => setField('has_pet', v)} centerOptions showYesIcon={false} /> },
      { key: 'lifestyle', title: 'האופי היומיומי שלי', render: () => <ChipSelect options={lifestyleOptions} value={state.lifestyle || null} onChange={(v) => setField('lifestyle', v || null)} /> },
      {
        key: 'cleanliness',
        title: 'כמה חשוב לי ניקיון?',
        subtitle: 'בחר/י ערך בין 1 ל-5',
        render: () => (
          <View style={{ gap: 10 }}>
            <BalloonSlider5
              value={state.cleanliness_importance || 3}
              onChange={(v) => setField('cleanliness_importance', v)}
            />
          </View>
        ),
      },
      { key: 'cleaning_frequency', title: 'תדירות ניקיון', render: () => <ChipSelect options={cleaningFrequencyOptions} value={state.cleaning_frequency || null} onChange={(v) => setField('cleaning_frequency', v || null)} /> },
      { key: 'hosting', title: 'אוהבים לארח?', render: () => <ChipSelect options={hostingOptions} value={state.hosting_preference || null} onChange={(v) => setField('hosting_preference', v || null)} /> },
      { key: 'cooking', title: 'אוכל ובישולים', render: () => <ChipSelect options={cookingOptions} value={state.cooking_style || null} onChange={(v) => setField('cooking_style', v || null)} /> },
      { key: 'home_vibe', title: 'אווירה בבית', render: () => <ChipSelect options={vibesOptions} value={state.home_vibe || null} onChange={(v) => setField('home_vibe', v || null)} /> },

      // Apartment you want
      {
        key: 'price',
        title: 'תקציב שכירות (₪)',
        render: () => (
          <View style={{ gap: 8 }}>
            <View style={styles.currencyInputWrap}>
              <View style={styles.currencySymbolWrap}>
                <Text style={styles.currencySymbol}>₪</Text>
              </View>
              <TextInput
                value={state.price_range?.toString() || ''}
                onChangeText={(txt) => setField('price_range', toNumberOrNull(txt))}
                placeholder="לדוגמה: 3500"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                style={[styles.input, styles.currencyInput]}
              />
            </View>
          </View>
        ),
      },
      {
        key: 'bills',
        title: 'חשבונות כלולים?',
        render: () => (
          <TriChoiceRow
            // Title is already displayed in the card header; avoid repeating it inside the row.
            value={state.bills_included ?? null}
            yesLabel="כלולים"
            noLabel="לא כלולים"
            anyLabel="לא משנה לי"
            centerOptions
            showYesIcon={false}
            onChange={(v) => setField('bills_included', v)}
          />
        ),
      },
      {
        key: 'preferred_city',
        title: 'עיר מועדפת',
        render: () => (
          <View style={{ gap: 10 }}>
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
                {citySuggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.suggestionItem, idx === citySuggestions.length - 1 ? styles.suggestionItemLast : null]}
                    onPress={() => {
                      setCityQuery(s.text);
                      setCitySuggestions([]);
                      setNeighborhoodSearch('');
                      setField('preferred_city', s.text);
                      setField('preferred_neighborhoods', []);
                      Keyboard.dismiss();
                    }}
                  >
                    <Text style={styles.suggestionText}>{s.text}</Text>
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
            {neighborhoodOptions.length ? (
              <TouchableOpacity
                style={[
                  styles.chip,
                  styles.allChipBtn,
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
                maxHeight={170}
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
        title: 'עם מרפסת/גינה?',
        render: () => (
          <TriChoiceRow
            value={state.has_balcony ?? null}
            anyLabel="לא משנה לי"
            centerOptions
            showYesIcon={false}
            onChange={(v) => setField('has_balcony', v)}
          />
        ),
      },
      {
        key: 'elevator',
        title: 'חשוב שתהיה מעלית?',
        render: () => (
          <TriChoiceRow
            value={state.has_elevator ?? null}
            anyLabel="לא משנה לי"
            centerOptions
            showYesIcon={false}
            onChange={(v) => setField('has_elevator', v)}
          />
        ),
      },
      {
        key: 'master',
        title: 'חדר מאסטר?',
        render: () => (
          <TriChoiceRow
            value={state.wants_master_room ?? null}
            anyLabel="לא משנה לי"
            centerOptions
            showYesIcon={false}
            onChange={(v) => setField('wants_master_room', v)}
          />
        ),
      },
      {
        key: 'is_sublet',
        title: 'האם מדובר בסאבלט?',
        render: () => (
          <ToggleRow
            value={!!state.is_sublet}
            centerOptions
            showYesIcon={false}
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
        title: 'בחרו את טווח הסאבלט',
        isVisible: () => !!state.is_sublet,
        render: () => (
          <View style={{ gap: 12 }}>
            <MonthPickerInput
              label="תאריך כניסה"
              placeholder="בחר/י תאריך"
              value={state.sublet_month_from || null}
              onPress={() =>
                openMonthPicker('sublet_month_from', 'בחר תאריך כניסה', state.sublet_month_from || null)
              }
            />
            <MonthPickerInput
              label="תאריך סיום"
              placeholder="בחר/י תאריך"
              value={state.sublet_month_to || null}
              onPress={() =>
                openMonthPicker('sublet_month_to', 'בחר תאריך סיום', state.sublet_month_to || null)
              }
            />
          </View>
        ),
      },
      {
        key: 'move_in_month',
        title: 'תאריך כניסה',
        isVisible: () => !state.is_sublet,
        render: () => (
          <MonthPickerInput
            placeholder="בחר/י תאריך"
            value={state.move_in_month || null}
            accessibilityLabel="תאריך כניסה"
            onPress={() => openMonthPicker('move_in_month', 'בחר תאריך כניסה', state.move_in_month || null)}
          />
        ),
      },
      {
        key: 'roommates_min',
        title: 'מינימום שותפים',
        subtitle: 'בחר/י בין 1 ל-5',
        render: () => (
          <View style={{ gap: 10 }}>
            <BalloonSlider5
              value={Math.max(1, Math.min(5, (state as any).preferred_roommates_min ?? 1))}
              onChange={(v) => setField('preferred_roommates_min' as any, v)}
            />
          </View>
        ),
      },
      {
        key: 'roommates_max',
        title: 'מקסימום שותפים',
        subtitle: 'בחר/י בין 1 ל-5',
        render: () => (
          <View style={{ gap: 10 }}>
            <BalloonSlider5
              value={Math.max(1, Math.min(5, (state as any).preferred_roommates_max ?? Math.max(1, Math.min(5, (state as any).preferred_roommates_min ?? 1))))}
              onChange={(v) => setField('preferred_roommates_max' as any, v)}
            />
          </View>
        ),
      },
      {
        key: 'pets_allowed',
        title: 'אפשר להביא חיות לדירה?',
        render: () => (
          <ToggleRow
            value={!!state.pets_allowed}
            centerOptions
            showYesIcon={false}
            onToggle={(v) => setField('pets_allowed', v)}
          />
        ),
      },
      {
        key: 'broker',
        title: 'משנה לך תיווך?',
        render: () => (
          <TriChoiceRow
            value={state.with_broker ?? null}
            yesLabel="עם תיווך"
            noLabel="בלי תיווך"
            anyLabel="לא משנה לי"
            centerOptions
            showYesIcon={false}
            onChange={(v) => setField('with_broker', v)}
          />
        ),
      },

      // Partner you want
      {
        key: 'age_min',
        title: 'גיל מינימלי לשותפ/ה',
        render: () => (
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={styles.input}
              activeOpacity={0.9}
              onPress={() => openListPicker('preferred_age_min', 'בחר גיל מינימלי')}
              accessibilityRole="button"
              accessibilityLabel="בחר גיל מינימלי"
            >
              <Text
                style={
                  (state as any).preferred_age_min != null ? styles.selectText : styles.selectPlaceholder
                }
              >
                {(state as any).preferred_age_min != null ? String((state as any).preferred_age_min) : 'בחר גיל'}
              </Text>
            </TouchableOpacity>
          </View>
        ),
      },
      {
        key: 'age_max',
        title: 'גיל מקסימלי לשותפ/ה',
        render: () => (
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={styles.input}
              activeOpacity={0.9}
              onPress={() => openListPicker('preferred_age_max', 'בחר גיל מקסימלי')}
              accessibilityRole="button"
              accessibilityLabel="בחר גיל מקסימלי"
            >
              <Text style={(state as any).preferred_age_max != null ? styles.selectText : styles.selectPlaceholder}>
                {(state as any).preferred_age_max != null ? String((state as any).preferred_age_max) : 'בחר גיל'}
              </Text>
            </TouchableOpacity>
          </View>
        ),
      },
      { key: 'pref_gender', title: 'מגדר מועדף של השותפ/ה?', render: () => <ChipSelect options={genderPrefOptions} value={state.preferred_gender || null} onChange={(v) => setField('preferred_gender', v || null)} /> },
      { key: 'pref_occ', title: 'עיסוק מועדף של השותפ/ה?', render: () => <ChipSelect options={occupationPrefOptions} value={state.preferred_occupation || null} onChange={(v) => setField('preferred_occupation', v || null)} /> },
      { key: 'partner_shabbat', title: 'שותפים שומרי שבת?', render: () => <ChipSelect options={partnerShabbatPrefOptions} value={state.partner_shabbat_preference || null} onChange={(v) => setField('partner_shabbat_preference', v || null)} /> },
      { key: 'partner_diet', title: 'שותפים עם תזונה מתאימה?', render: () => <ChipSelect options={partnerDietPrefOptions} value={state.partner_diet_preference || null} onChange={(v) => setField('partner_diet_preference', v || null)} /> },
      { key: 'partner_smoking', title: 'שותפים שמעשנים?', render: () => <ChipSelect options={partnerSmokingPrefOptions} value={state.partner_smoking_preference || null} onChange={(v) => setField('partner_smoking_preference', v || null)} /> },
      { key: 'partner_pets', title: 'שותפים שמגיעים עם בעלי חיים?', render: () => <ChipSelect options={['אין בעיה', 'מעדיפ/ה שלא']} value={state.partner_pets_preference || null} onChange={(v) => setField('partner_pets_preference', v || null)} /> },
    ];

    return q.filter((item) => (item.isVisible ? item.isVisible() : true));
  }, [
    state,
    cityQuery,
    citySuggestions,
    neighborhoodOptions,
    neighborhoodSearch,
    filteredNeighborhoods,
    minAgeSelectOptions,
    maxAgeSelectOptions,
  ]);

  const totalQuestions = questions.length;

  const questionIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((q, idx) => map.set(q.key, idx));
    return map;
  }, [questions]);

  // Split questions into 3 parts based on the user's requested boundaries.
  // Part 1: "קצת עליי" - from first question up to (excluding) "תקציב שכירות" (price)
  // Part 2: "מה שאני מחפש בדירה" - from "תקציב שכירות" (price) up to (excluding) "גיל מינימלי לשותפ/ה" (age_min)
  // Part 3: "שותפים שאני מחפש" - from "גיל מינימלי לשותפ/ה" (age_min) to the end
  const items: SurveyItem[] = useMemo(() => {
    const idxPrice = questions.findIndex((q) => q.key === 'price');
    const idxAgeMin = questions.findIndex((q) => q.key === 'age_min');

    const part1Questions = idxPrice > 0 ? questions.slice(0, idxPrice) : questions.slice(0, Math.max(0, idxPrice));
    const part2Questions =
      idxPrice >= 0 && (idxAgeMin < 0 || idxAgeMin > idxPrice)
        ? questions.slice(idxPrice, idxAgeMin < 0 ? undefined : idxAgeMin)
        : [];
    const part3Questions = idxAgeMin >= 0 ? questions.slice(idxAgeMin) : [];

    const out: SurveyItem[] = [];
    if (part1Questions.length) {
      out.push({
        type: 'section',
        key: '__section_about',
        partNumber: 1,
        title: 'קצת עליי',
        subtitle: 'כמה שאלות קצרות כדי שנכיר אותך ונבין את הוייב שלך.',
      });
      for (const q of part1Questions) out.push({ type: 'question', key: q.key, partNumber: 1, question: q });
    }
    if (part2Questions.length) {
      out.push({
        type: 'section',
        key: '__section_apartment',
        partNumber: 2,
        title: 'הדירה שאני מחפש/ת',
        subtitle: 'בוא/י נבין מה חשוב לך בדירה – עיר, שכונה, תאריך כניסה ועוד.',
      });
      for (const q of part2Questions) out.push({ type: 'question', key: q.key, partNumber: 2, question: q });
    }
    if (part3Questions.length) {
      out.push({
        type: 'section',
        key: '__section_partners',
        partNumber: 3,
        title: 'השותפים שאני מחפש/ת',
        subtitle: 'ספרו לנו מי השותפים שהכי יכולים להתאים לכם – כדי שנוכל לדייק את ההתאמה.',
      });
      for (const q of part3Questions) out.push({ type: 'question', key: q.key, partNumber: 3, question: q });
    }

    return out;
  }, [questions]);

  const totalItems = items.length;
  const clampedIndex = totalItems > 0 ? Math.min(currentStep, totalItems - 1) : 0;
  const activeItem = totalItems > 0 ? items[clampedIndex] : null;

  const activeQuestionKey = useMemo(() => {
    if (!activeItem) return null;
    if (activeItem.type === 'question') return activeItem.question.key;
    // If we're on a section card, report the next question key (so progress/draft behaves nicely).
    for (let i = clampedIndex + 1; i < items.length; i++) {
      const it = items[i];
      if (it.type === 'question') return it.question.key;
    }
    // Fallback to previous question if needed.
    for (let i = clampedIndex - 1; i >= 0; i--) {
      const it = items[i];
      if (it.type === 'question') return it.question.key;
    }
    return null;
  }, [activeItem, clampedIndex, items]);

  const activeQuestionNumber = useMemo(() => {
    if (!activeQuestionKey) return 0;
    const idx = questionIndexByKey.get(activeQuestionKey);
    return typeof idx === 'number' ? idx + 1 : 0;
  }, [activeQuestionKey, questionIndexByKey]);

  const progressPercent = useMemo(() => {
    if (!totalQuestions) return 0;
    // "Reached" semantics: question 1 => 0%, then ramps up; final completion handled on submit.
    const reached = Math.max(0, Math.min(totalQuestions, (activeQuestionNumber || 1) - 1));
    return Math.round((reached / totalQuestions) * 100);
  }, [activeQuestionNumber, totalQuestions]);

  const progressRingSize = useMemo(() => {
    // Bigger, hero-like ring (similar to the reference). Clamp for small/large screens.
    const scaled = Math.round(Math.min(screenWidth, screenHeight) * 0.34);
    return Math.max(180, Math.min(240, scaled));
  }, [screenWidth, screenHeight]);
  // Keep the popup size consistent across all questions and prevent edge clipping on small screens
  const popupCardWidth = useMemo(() => Math.min(Math.max(screenWidth - 32, 320), 420), [screenWidth]);
  const popupCardMaxHeight = useMemo(() => Math.min(Math.max(screenHeight - 180, 520), 680), [screenHeight]);
  // Dynamic height: let the card shrink to its content (chips/questions), but cap it so long questions scroll.
  const cardMaxHeight = useMemo(() => Math.min(popupCardMaxHeight, Math.round(screenHeight * 0.72)), [popupCardMaxHeight, screenHeight]);
  const bodyMaxHeight = useMemo(() => Math.min(360, Math.round(screenHeight * 0.36)), [screenHeight]);

  useLayoutEffect(() => {
    // Reset body height to a small value so it doesn't "carry over" a tall height from previous questions.
    setMeasuredBodyHeight(44);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex, bodyMaxHeight]);

  const partQuestionItemIndicesByPart = useMemo(() => {
    const map = new Map<1 | 2 | 3, number[]>();
    items.forEach((it, idx) => {
      if (it.type !== 'question') return;
      const arr = map.get(it.partNumber) ?? [];
      arr.push(idx);
      map.set(it.partNumber, arr);
    });
    return map;
  }, [items]);

  useEffect(() => {
    if (totalItems === 0) return;
    if (currentStep > totalItems - 1) setCurrentStep(totalItems - 1);
  }, [totalItems, currentStep]);

  // Track the user's current question so "exit & save" can resume next time.
  useEffect(() => {
    latestStepKeyRef.current = activeQuestionKey ?? null;
  }, [activeQuestionKey]);

  // Resume draft at the last seen question (once per screen mount).
  useEffect(() => {
    if (loading) return;
    if (isEditMode) return;
    if (didResumeRef.current) return;
    const key = resumeStepKey;
    didResumeRef.current = true;
    if (!key) return;
    const idx = items.findIndex((it) => it.type === 'question' && it.question.key === key);
    if (idx >= 0) setCurrentStep(idx);
  }, [loading, resumeStepKey, items]);

  const goToStep = (nextStep: number) => {
    if (nextStep === currentStep) return;
    if (nextStep < 0 || nextStep > totalItems - 1) return;
    transitionDirRef.current = nextStep > currentStep ? 1 : -1;
    // (Animation removed) Immediately switch steps.
    setCurrentStep(nextStep);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  };

  const handleNext = () => {
    if (saving) return;
    if (currentStep < totalItems - 1) goToStep(currentStep + 1);
  };
  const handleBack = () => {
    if (saving) return;
    if (isEditMode && editSelectedPart) {
      const firstIdx = items.findIndex((it) => it.type === 'question' && it.partNumber === editSelectedPart);
      if (firstIdx >= 0 && currentStep === firstIdx) {
        setEditSelectedPart(null);
        setCurrentStep(0);
        return;
      }
    }
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const payload = normalizePayload(user.id, state, { isCompleted: true, draftStepKey: null, coerceBooleans: true });
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
    const payload = normalizePayload(user.id, latestStateRef.current, {
      isCompleted: false,
      draftStepKey: latestStepKeyRef.current,
      coerceBooleans: false,
    });
    await upsertUserSurvey(payload);
  };

  const saveEdit = async (): Promise<void> => {
    if (!user?.id) return;
    // In edit mode we keep is_completed=true but DO NOT coerce missing booleans to false.
    const payload = normalizePayload(user.id, latestStateRef.current, {
      isCompleted: true,
      draftStepKey: null,
      coerceBooleans: false,
    });
    await upsertUserSurvey(payload);
  };

  const promptSaveEditPart = () => setEditConfirmOpen(true);

  const handleExit = async () => {
    if (saving) return;
    if (isEditMode && editSelectedPart) {
      promptSaveEditPart();
      return;
    }
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
    if (isEditMode) return;
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
  }, [navigation, user?.id, isEditMode]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <LavaLamp hue="orange" intensity={60} count={5} duration={16000} backgroundColor={BG} />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : (
          <View style={styles.popupOverlay}>
            {/* Dismiss keyboard only when tapping the background (outside the card).
                This prevents "double tap to select" on suggestion items. */}
            {keyboardVisible ? (
              <Pressable
                style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
                onPress={Keyboard.dismiss}
                pointerEvents="box-only"
                accessible={false}
              />
            ) : null}

            {/* Top-right close button on the brown background (edit landing screen) */}
            {isEditMode && !editSelectedPart ? (
              <TouchableOpacity
                style={styles.overlayCloseBtn}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="סגור עריכת שאלון"
                activeOpacity={0.9}
              >
                <X size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
            <View style={styles.bgTitleWrap}>
              {isEditMode && !editSelectedPart ? (
                <>
                  <View style={styles.introIconCircle}>
                    <Sparkles size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.bgTitle}>עריכת שאלון העדפות</Text>
                  <Text style={styles.bgSubtitle}>בחרו איזה חלק תרצו לערוך.</Text>
                </>
              ) : activeItem?.type === 'question' ? (
                <ProgressRing size={progressRingSize} value={progressPercent} />
              ) : activeItem?.partNumber === 1 ? (
                <>
                  <View style={styles.introIconCircle}>
                    <Sparkles size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.bgTitle}>שאלון העדפות</Text>
                  <Text style={styles.bgSubtitle}>
                    שאלון קצר עם כמה שאלות שיעזרו לנו להכיר אותך טוב יותר ולהתאים לך שותפים שבאמת מתאימים לך.
                  </Text>
                </>
              ) : (
                <ProgressRing size={progressRingSize} value={progressPercent} />
              )}
            </View>

            <View
              style={[
                styles.popupCard,
                {
                  width: popupCardWidth,
                  maxHeight: cardMaxHeight,
                  // Prevent collapse on section cards (no header/scroll measuring).
                  minHeight: 200,
                },
              ]}
            >
              {!(isEditMode && !editSelectedPart) ? (
                <TouchableOpacity
                  style={styles.exitBtn}
                  onPress={handleExit}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="יציאה ושמירה"
                >
                  {saving ? <ActivityIndicator size="small" color={PRIMARY} /> : <X size={18} color={PRIMARY} />}
                </TouchableOpacity>
              ) : null}

              {isEditMode && !editSelectedPart ? (
                <View style={[styles.popupBody, styles.editPartsWrap]}>
                  {[
                    {
                      partNumber: 1 as const,
                      title: 'קצת עליי',
                      subtitle: 'עריכת שאלות עלייך וההרגלים שלך.',
                    },
                    {
                      partNumber: 2 as const,
                      title: 'הדירה שאני מחפש/ת',
                      subtitle: 'עריכת העדפות דירה – תקציב, עיר, כניסה ועוד.',
                    },
                    {
                      partNumber: 3 as const,
                      title: 'השותפים שאני מחפש/ת',
                      subtitle: 'עריכת העדפות השותפים – גיל, מגדר ועוד.',
                    },
                  ].map((p) => (
                    <TouchableOpacity
                      key={`edit-part-${p.partNumber}`}
                      style={styles.editPartCard}
                      activeOpacity={0.9}
                      onPress={() => {
                        // Snapshot current saved state so we can discard changes for this edit session.
                        editSnapshotRef.current = JSON.parse(JSON.stringify(state || {})) as SurveyState;
                        const firstIdx = items.findIndex(
                          (it) => it.type === 'question' && it.partNumber === p.partNumber
                        );
                        if (firstIdx >= 0) {
                          setEditSelectedPart(p.partNumber);
                          setCurrentStep(firstIdx);
                        }
                      }}
                    >
                      <View style={styles.editPartPill}>
                        <Text style={styles.editPartPillText}>{`חלק ${p.partNumber}`}</Text>
                      </View>
                      <Text style={styles.editPartTitle}>{p.title}</Text>
                      <Text style={styles.editPartSubtitle}>{p.subtitle}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : activeItem?.type === 'question' ? (
                <Animated.View
                  // Key forces re-mount so entering/exiting animations run on each question change.
                  key={activeQuestionKey ?? String(clampedIndex)}
                  entering={(transitionDirRef.current === 1 ? SlideInRight : SlideInLeft).duration(220)}
                  exiting={(transitionDirRef.current === 1 ? SlideOutLeft : SlideOutRight).duration(200)}
                >
                  <View style={styles.popupHeader}>
                    <View style={styles.partPill}>
                      <Text style={styles.partPillText}>{`חלק ${activeItem.partNumber}`}</Text>
                    </View>
                    <Text style={styles.popupTitle}>{activeItem.question.title}</Text>
                  </View>
                  {!!activeItem.question.subtitle && <Text style={styles.popupSubtitle}>{activeItem.question.subtitle}</Text>}

                  {activeItem.question.key === 'cleanliness' ||
                  activeItem.question.key === 'preferred_neighborhoods' ||
                  activeItem.question.key === 'floor' ||
                  activeItem.question.key === 'sublet_period' ||
                  activeItem.question.key === 'move_in_month' ||
                  activeItem.question.key === 'roommates_min' ||
                  activeItem.question.key === 'roommates_max' ||
                  activeItem.question.key === 'age_min' ||
                  activeItem.question.key === 'age_max' ||
                  activeItem.question.key === 'cooking' ||
                  activeItem.question.key === 'home_vibe' ? (
                    // Render without ScrollView so horizontal pan gestures are never stolen.
                    <View style={[styles.popupBody, { maxHeight: bodyMaxHeight }]}>
                      <View style={styles.questionContentWrap}>{activeItem.question.render?.()}</View>
                    </View>
                  ) : (
                    <ScrollView
                      ref={scrollRef}
                      style={[
                        styles.popupBody,
                        {
                          height: measuredBodyHeight,
                          minHeight: 44,
                          maxHeight: bodyMaxHeight,
                        },
                      ]}
                      contentContainerStyle={styles.popupBodyContent}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="always"
                      onContentSizeChange={(_, h) => {
                        // Clamp to keep the footer visible and prevent tall empty space.
                        const next = Math.min(Math.max(44, Math.round(h)), bodyMaxHeight);
                        if (next !== measuredBodyHeight) setMeasuredBodyHeight(next);
                      }}
                    >
                      <View style={styles.questionContentWrap}>{activeItem.question.render?.()}</View>
                    </ScrollView>
                  )}
                </Animated.View>
              ) : (
                <View style={[styles.popupBody, styles.sectionBody, { maxHeight: bodyMaxHeight }]}>
                  <View style={styles.sectionHero}>
                    <View style={styles.sectionTag}>
                      <Text style={styles.sectionTagText}>{`חלק ${activeItem?.partNumber ?? 1}`}</Text>
                    </View>
                    <Text style={styles.sectionHeroTitle}>{activeItem?.title ?? ''}</Text>
                    <Text style={styles.sectionHeroSubtitle}>{activeItem?.subtitle ?? ''}</Text>
                    {activeItem?.partNumber === 1 ? (
                      <TouchableOpacity
                        onPress={handleNext}
                        disabled={saving}
                        style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null, styles.sectionPrimaryBtn]}
                        accessibilityRole="button"
                        accessibilityLabel="מתחילים"
                        activeOpacity={0.9}
                      >
                        <Text style={styles.primaryBtnText}>מתחילים</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.sectionCtasRow}>
                        <TouchableOpacity
                          onPress={() => {
                            // Go back to the previous step the user was on (typically the last question of the previous part).
                            handleBack();
                          }}
                          disabled={saving}
                          style={[styles.navBtn, saving ? styles.navBtnDisabled : null, styles.sectionSecondaryBtn]}
                          accessibilityRole="button"
                          accessibilityLabel="חזרה"
                          activeOpacity={0.9}
                        >
                          <ChevronRight size={18} color={saving ? MUTED : PRIMARY} />
                          <Text style={[styles.navBtnText, saving ? styles.navBtnTextDisabled : null]}>חזרה</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleNext}
                          disabled={saving}
                          style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null, styles.sectionPrimaryBtn]}
                          accessibilityRole="button"
                          accessibilityLabel="ממשיכים"
                          activeOpacity={0.9}
                        >
                          <Text style={styles.primaryBtnText}>ממשיכים</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.inlineFooter}>
                {isEditMode && !editSelectedPart ? (
                  <Text style={styles.questionIndicator}>{''}</Text>
                ) : activeItem?.type === 'question' ? (() => {
                  const part = (isEditMode && editSelectedPart ? editSelectedPart : activeItem.partNumber) as 1 | 2 | 3;
                  const indices = partQuestionItemIndicesByPart.get(part) ?? [];

                  // Robust prev/next detection for the current part (indexes shift when questions appear/disappear).
                  const findPrevInPart = () => {
                    for (let i = clampedIndex - 1; i >= 0; i--) {
                      const it = items[i];
                      if (it?.type === 'question' && it.partNumber === part) return i;
                    }
                    return null;
                  };
                  const findNextInPart = () => {
                    for (let i = clampedIndex + 1; i < items.length; i++) {
                      const it = items[i];
                      if (it?.type === 'question' && it.partNumber === part) return i;
                    }
                    return null;
                  };
                  const prevInPartIdx = findPrevInPart();
                  const nextInPartIdx = findNextInPart();

                  // Pagination index: prefer direct match on clampedIndex; fallback to matching by activeQuestionKey.
                  const directLocalIndex = indices.indexOf(clampedIndex);
                  const localIndex =
                    directLocalIndex >= 0
                      ? directLocalIndex
                      : Math.max(
                          0,
                          indices.findIndex((idx) => {
                            const it = items[idx];
                            return it?.type === 'question' && it.question?.key === activeQuestionKey;
                          })
                        );

                  const isEditingThisPart = !!(isEditMode && editSelectedPart && part === editSelectedPart);
                  const isLastInPart = nextInPartIdx === null;

                  return (
                    <>
                      <View style={styles.footerRow}>
                        <TouchableOpacity
                          onPress={() => {
                            if (saving) return;
                            if (isEditMode && editSelectedPart) {
                              if (typeof prevInPartIdx === 'number') goToStep(prevInPartIdx);
                              else {
                                // back to part cards
                                setEditSelectedPart(null);
                                setCurrentStep(0);
                              }
                              return;
                            }
                            handleBack();
                          }}
                          disabled={saving || (isEditMode && editSelectedPart ? false : clampedIndex === 0)}
                          style={[styles.navBtn, saving || clampedIndex === 0 ? styles.navBtnDisabled : null]}
                        >
                          <ChevronRight size={18} color={saving || clampedIndex === 0 ? MUTED : PRIMARY} />
                          <Text style={[styles.navBtnText, saving || clampedIndex === 0 ? styles.navBtnTextDisabled : null]}>חזרה</Text>
                        </TouchableOpacity>

                        {isEditingThisPart && isLastInPart ? (
                          <TouchableOpacity
                            onPress={promptSaveEditPart}
                            disabled={saving}
                            style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null]}
                          >
                            {saving ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.primaryBtnText}>שמור שינויים</Text>
                            )}
                          </TouchableOpacity>
                        ) : clampedIndex >= totalItems - 1 ? (
                          <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={saving}
                            style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null]}
                          >
                            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>סיום</Text>}
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => {
                              if (saving) return;
                              if (isEditMode && editSelectedPart) {
                                if (typeof nextInPartIdx === 'number') goToStep(nextInPartIdx);
                                else promptSaveEditPart();
                                return;
                              }
                              handleNext();
                            }}
                            disabled={saving}
                            style={[styles.primaryBtn, saving ? styles.primaryBtnDisabled : null]}
                          >
                            <Text style={styles.primaryBtnText}>הבא</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <PartCarouselPagination
                        partNumber={part}
                        count={indices.length || 1}
                        index={localIndex}
                        onJump={(targetLocal) => {
                          const targetItemIdx = indices[targetLocal];
                          if (typeof targetItemIdx === 'number') goToStep(targetItemIdx);
                        }}
                      />

                      <Text style={styles.questionIndicator}>{`שאלה ${Math.min(localIndex + 1, indices.length || 1)} מתוך ${indices.length || 1}`}</Text>
                    </>
                  );
                })() : (
                  <Text style={styles.questionIndicator}>{''}</Text>
                )}
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Shared month picker panel (outside the clipped card) */}
      <KeyFabPanel
        isOpen={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        title={monthPickerTitle}
        subtitle=""
        anchor="bottom"
        bottomOffset={120}
      >
        {Platform.OS === 'android' ? (
          <DateTimePicker
            value={monthPickerTempDate}
            mode="date"
            display="default"
            onChange={(event: any, selected?: Date) => {
              const type = event?.type;
              if (type === 'dismissed') {
                setMonthPickerOpen(false);
                return;
              }
              if (type === 'set') {
                const picked = selected ?? monthPickerTempDate;
                commitMonthPicker(picked);
              }
            }}
          />
        ) : (
          <>
            <DateTimePicker
              value={monthPickerPendingDate ?? monthPickerTempDate}
              mode="date"
              display="spinner"
              locale="he-IL"
              onChange={(_, selected) => {
                if (!selected) return;
                setMonthPickerPendingDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
              }}
            />
            <View style={{ flexDirection: 'row-reverse', gap: 10, justifyContent: 'space-between' }}>
              <TouchableOpacity style={[styles.pickerCancel, { marginTop: 0 }]} onPress={clearMonthPicker}>
                <Text style={styles.pickerCancelText}>נקה</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { minWidth: 120 }]}
                onPress={() => commitMonthPicker(monthPickerPendingDate ?? monthPickerTempDate)}
              >
                <Text style={styles.primaryBtnText}>אישור</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyFabPanel>

      {/* Shared list picker panel (outside the clipped card) */}
      <KeyFabPanel
        isOpen={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        title={listPickerTitle}
        subtitle=""
        anchor="bottom"
        bottomOffset={120}
      >
        <ScrollView
          style={{ maxHeight: 320 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
        >
          {listPickerTarget === 'preferred_age_min'
            ? minAgeSelectOptions.map((opt) => {
                const active = String((state as any).preferred_age_min ?? '') === opt;
                return (
                  <TouchableOpacity
                    key={`age-min-${opt}`}
                    style={[styles.pickerOption, active ? styles.pickerOptionActive : null]}
                    onPress={() => commitListPicker(opt)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.pickerOptionText, active ? styles.pickerOptionTextActive : null]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })
            : listPickerTarget === 'preferred_age_max'
              ? maxAgeSelectOptions.map((opt) => {
                  const active = String((state as any).preferred_age_max ?? '') === opt;
                  return (
                    <TouchableOpacity
                      key={`age-max-${opt}`}
                      style={[styles.pickerOption, active ? styles.pickerOptionActive : null]}
                      onPress={() => commitListPicker(opt)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.pickerOptionText, active ? styles.pickerOptionTextActive : null]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })
            : null}
        </ScrollView>
      </KeyFabPanel>

      {/* Edit confirm panel (replaces native Alert to avoid missing buttons on some devices) */}
      <KeyFabPanel
        isOpen={editConfirmOpen}
        onClose={() => setEditConfirmOpen(false)}
        title="לשמור שינויים?"
        subtitle=""
        anchor="bottom"
        bottomOffset={120}
      >
        <Text style={styles.confirmBodyText}>לשמור ולעדכן את החלק או לצאת בלי לשמור?</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 14 }}>
          <TouchableOpacity
            style={[styles.navBtn, { flex: 1 }, saving ? styles.navBtnDisabled : null]}
            disabled={saving}
            onPress={() => {
              setEditConfirmOpen(false);
              if (editSnapshotRef.current) setState(editSnapshotRef.current);
              setEditSelectedPart(null);
              setCurrentStep(0);
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.navBtnText}>צא בלי לשמור</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1, minWidth: undefined }, saving ? styles.primaryBtnDisabled : null]}
            disabled={saving}
            onPress={async () => {
              try {
                setSaving(true);
                await saveEdit();
                editSnapshotRef.current = null;
                setEditConfirmOpen(false);
                setEditSelectedPart(null);
                setCurrentStep(0);
              } catch (e: any) {
                Alert.alert('שגיאה', e?.message || 'לא ניתן לשמור כעת');
              } finally {
                setSaving(false);
              }
            }}
            activeOpacity={0.9}
          >
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>שמור ועדכן</Text>}
          </TouchableOpacity>
        </View>
      </KeyFabPanel>
    </GestureHandlerRootView>
  );
}

function normalizePayload(
  userId: string,
  s: SurveyState,
  opts: { isCompleted: boolean; draftStepKey: string | null; coerceBooleans?: boolean }
) {
  const coerce = typeof opts.coerceBooleans === 'boolean' ? opts.coerceBooleans : opts.isCompleted; // default legacy behavior
  const payload: any = {
    user_id: userId,
    is_completed: opts.isCompleted,
    draft_step_key: opts.isCompleted ? null : (opts.draftStepKey ?? null),
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
  const now = new Date();
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    const current = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${HEB_MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}`;
    list.push(label);
  }
  return list;
}

function parseYYYYMM(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return new Date(year, monthIndex, 1);
}

function formatDateToYYYYMM(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatYYYYMMToHebrewMonthYear(value: string): string {
  const d = parseYYYYMM(value);
  if (!d) return value;
  return `${HEB_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
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

function MonthPickerInput({
  label,
  value,
  placeholder,
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const labelText = value ? formatYYYYMMToHebrewMonthYear(value) : (placeholder || 'בחר');
  return (
    <View style={{ gap: 8 }}>
      {!!label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={styles.input}
        activeOpacity={0.9}
        onPress={onPress}
        accessibilityLabel={(accessibilityLabel || label || 'בחירת חודש').trim()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        pressRetentionOffset={{ top: 14, bottom: 14, left: 14, right: 14 }}
      >
        <Text style={value ? styles.selectText : styles.selectPlaceholder}>{labelText}</Text>
      </TouchableOpacity>
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

function ToggleRow({
  label,
  value,
  onToggle,
  centerOptions,
  showYesIcon = true,
}: {
  label?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  centerOptions?: boolean;
  showYesIcon?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, centerOptions ? styles.toggleRowCentered : null]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.toggleOptions, centerOptions ? styles.toggleOptionsCentered : null]}>
        <TouchableOpacity
          style={[styles.toggleBtn, value ? styles.toggleActive : null]}
          onPress={() => onToggle(true)}
        >
          {showYesIcon ? <Check size={16} color={value ? '#0F0F14' : '#9DA4AE'} /> : null}
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
  centerOptions,
  showYesIcon = true,
}: {
  label?: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
  anyLabel?: string;
  centerOptions?: boolean;
  showYesIcon?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, centerOptions ? styles.toggleRowCentered : null]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.toggleOptions, centerOptions ? styles.toggleOptionsCentered : null]}>
        <TouchableOpacity
          style={[styles.toggleBtn, value === true ? styles.toggleActive : null]}
          onPress={() => onChange(true)}
        >
          {showYesIcon ? <Check size={16} color={value === true ? '#0F0F14' : '#9DA4AE'} /> : null}
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
              activeOpacity={0.9}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              pressRetentionOffset={{ top: 14, bottom: 14, left: 14, right: 14 }}
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
  maxHeight,
}: {
  label?: string;
  options: string[];
  values: string[];
  onToggle: (option: string, isActive: boolean) => void;
  maxHeight?: number;
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
        maxHeight ? (
          <ScrollView
            style={{ maxHeight }}
            contentContainerStyle={styles.chipsWrap}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
          >
            {uniqueOptions.map((opt) => {
              const active = selectedSet.has(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => onToggle(opt, !active)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.chipsWrap}>
            {uniqueOptions.map((opt) => {
              const active = selectedSet.has(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => onToggle(opt, !active)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )
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

const clamp = (a: number, min = 0, max = 1) => {
  'worklet';
  return Math.min(max, Math.max(min, a));
};

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function AnimatedNumber({ value }: { value: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    return { text: String(Math.round(value.value)) } as any;
  });
  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      value={String(Math.round(value.value))}
      style={styles.sliderNumber}
      animatedProps={animatedProps}
    />
  );
}

function AnimatedPercent({ value }: { value: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    return { text: `${Math.round(value.value)}%` } as any;
  });
  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      value={`${Math.round(value.value)}%`}
      style={styles.progressPercent}
      animatedProps={animatedProps}
    />
  );
}

const ProgressRingLine = memo(function ProgressRingLine({
  progress,
  size,
  index,
}: {
  progress: SharedValue<number>;
  size: number;
  index: number;
}) {
  const step = 360 / PROGRESS_RING_LINES;

  const stylez = useAnimatedStyle(() => {
    const inputRange = [
      ((index - 2) * 100) / PROGRESS_RING_LINES,
      (index * 100) / PROGRESS_RING_LINES,
      ((index + 2) * 100) / PROGRESS_RING_LINES,
    ];

    return {
      transform: [
        {
          translateY: interpolate(progress.value, inputRange, [size * 0.06, size * 0.06, 0], Extrapolation.CLAMP),
        },
      ],
      backgroundColor: interpolateColor(progress.value, inputRange, [
        'rgba(255,255,255,0.18)',
        'rgba(255,255,255,0.18)',
        '#FFFFFF',
      ]),
    };
  });

  return (
    <View
      style={{
        width: 3,
        height: size,
        position: 'absolute',
        overflow: 'hidden',
        justifyContent: 'flex-start',
        transform: [{ rotateZ: `${step * index}deg` }],
      }}
      pointerEvents="none"
    >
      <Animated.View style={[stylez, { height: '50%', borderRadius: 6, overflow: 'hidden' }]} />
    </View>
  );
});

const ProgressMask = ({ size }: { size: number }) => (
  <Svg height={size} width={size} style={{ position: 'absolute' }}>
    <Defs>
      <RadialGradient
        id="grad"
        cx={size / 2}
        cy={size / 2}
        rx={size / 2}
        ry={size / 2}
        fx={size / 2}
        fy={size / 2}
        gradientUnits="userSpaceOnUse"
      >
        {/* Center is transparent, outer ring is opaque */}
        <Stop offset="0.62" stopColor="#000" stopOpacity="0" />
        <Stop offset="1" stopColor="#000" stopOpacity="1" />
      </RadialGradient>
    </Defs>
    <Circle r={size / 2} cx={size / 2} cy={size / 2} fill="url(#grad)" />
  </Svg>
);

function ProgressRing({ value, size }: { value: number; size: number }) {
  const progress = useSharedValue(-1);
  useDerivedValue(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, value)), { duration: 1200 });
  }, [value]);

  return (
    <View style={[styles.progressRingWrap, { width: size, height: size }]} pointerEvents="none">
      <MaskedView
        renderToHardwareTextureAndroid
        style={StyleSheet.absoluteFillObject}
        maskElement={<ProgressMask size={size} />}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {Array.from({ length: PROGRESS_RING_LINES }).map((_, i) => (
            <ProgressRingLine key={`ring-${i}`} progress={progress} size={size} index={i} />
          ))}
        </View>
      </MaskedView>

      <View style={styles.progressRingCenter} pointerEvents="none">
        <AnimatedPercent value={progress} />
        <Text style={styles.progressLabel}>התקדמות</Text>
      </View>
    </View>
  );
}

function BalloonSlider5({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const KNOB_SIZE = 22;
  const BALLOON_W = 44;
  const trackWidth = useSharedValue(1);
  const x = useSharedValue(0);

  // RTL slider: 1 is on the RIGHT, 5 is on the LEFT.
  // Derived 1..5 value from position.
  const v = useDerivedValue(() => {
    const w = trackWidth.value;
    if (w <= 1) return 1;
    const raw = 5 - (x.value / w) * 4;
    return clamp(Math.round(raw), 1, 5);
  });

  // Push value changes up to React state (only when the integer changes).
  useAnimatedReaction(
    () => v.value,
    (next, prev) => {
      if (next !== prev) runOnJS(onChange)(next);
    }
  );

  // Keep slider in sync when value changes externally.
  useEffect(() => {
    const vv = clamp(Math.round(value || 1), 1, 5);
    const w = trackWidth.value;
    if (w > 1) {
      // value 1 => x=w (right), value 5 => x=0 (left)
      x.value = withTiming(((5 - vv) / 4) * w, { duration: 140 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const panGesture = Gesture.Pan()
    .minDistance(1)
    // Prefer horizontal drags (slider) and let vertical drags go to the ScrollView.
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .shouldCancelWhenOutside(false)
    .hitSlop({ left: 25, right: 25, top: 25, bottom: 25 })
    .onChange((ev) => {
      const w = trackWidth.value;
      if (w <= 1) return;
      x.value = clamp(x.value + ev.changeX, 0, w);
    })
    .onEnd(() => {
      const w = trackWidth.value;
      if (w <= 1) return;
      const step = w / 4;
      const snapped = Math.round(x.value / step) * step;
      x.value = withSpring(snapped, { damping: 16, stiffness: 180 });
    });

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: Math.max(0, trackWidth.value - x.value),
    };
  });

  const knobStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: x.value - KNOB_SIZE / 2 }],
    };
  });

  const balloonX = useDerivedValue(() => withSpring(x.value));
  const balloonStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: balloonX.value - BALLOON_W / 2 }],
      opacity: 1,
    };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Balloon slot is part of normal layout so it won't get clipped by ScrollView/card sizing */}
      <View style={styles.sliderBalloonSlot} pointerEvents="none">
        <Animated.View style={[styles.sliderBalloon, balloonStyle]}>
          <View style={styles.sliderBalloonBubble}>
            <AnimatedNumber value={v} />
          </View>
        </Animated.View>
      </View>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.sliderTrack}
          onLayout={(e) => {
            const w = Math.max(1, e.nativeEvent.layout.width);
            trackWidth.value = w;
            const vv = clamp(Math.round(value || 1), 1, 5);
            x.value = ((5 - vv) / 4) * w;
          }}
        >
          <Animated.View style={[styles.sliderProgress, progressStyle]} />
          <Animated.View style={[styles.sliderKnob, knobStyle]} />
        </View>
      </GestureDetector>
      <View style={styles.sliderLabelsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Text key={`lbl-${n}`} style={styles.sliderLabelText}>
            {n}
          </Text>
        ))}
      </View>
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
    // Slightly lift the whole card+footer (questions + dots/indicator) away from the bottom edge.
    paddingTop: 24,
    paddingBottom: 160,
    backgroundColor: 'rgba(0,0,0,0.18)',
    position: 'relative',
  },
  overlayCloseBtn: {
    position: 'absolute',
    top: 55,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 20,
  },
  bgTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
    gap: 10,
    zIndex: 2,
    position: 'relative',
  },
  progressRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercent: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 26,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    lineHeight: 28,
  },
  progressLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  bgTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  bgSubtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  introIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 6,
  },
  popupCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
    overflow: 'hidden',
    zIndex: 3,
    position: 'relative',
  },
  sectionBody: {
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sectionHero: {
    alignItems: 'center',
    gap: 10,
  },
  editPartsWrap: {
    marginTop: 8,
    gap: 12,
  },
  editPartCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.95)',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  editPartPill: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.18)',
    marginBottom: 8,
  },
  editPartPillText: {
    color: PRIMARY,
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  editPartTitle: {
    color: PRIMARY,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  editPartSubtitle: {
    marginTop: 6,
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  sectionTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.18)',
  },
  sectionTagText: {
    color: PRIMARY,
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  sectionPrimaryBtn: {
    marginTop: 6,
    alignSelf: 'stretch',
    minWidth: undefined,
  },
  sectionCtasRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 6,
    alignItems: 'center',
  },
  sectionSecondaryBtn: {
    flex: 1,
  },
  sectionHeroTitle: {
    color: PRIMARY,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  sectionHeroSubtitle: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 19,
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
    gap: 4,
  },
  partPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.18)',
  },
  partPillText: {
    color: PRIMARY,
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
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
  questionIndicator: {
    marginTop: 10,
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  carouselWrap: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  carouselDotsPill: {
    backgroundColor: 'rgba(17,24,39,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  carouselDotsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  carouselMeta: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
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
    marginTop: 8,
  },
  popupBodyContent: {
    // Give the last row of chips some breathing room so taps near the bottom edge don't get cancelled.
    paddingBottom: 44,
  },
  questionContentWrap: {
    paddingTop: 4,
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
    minHeight: 48,
    borderRadius: 10,
    color: TEXT,
    fontSize: 16,
    borderWidth: 1,
    borderColor: BORDER,
    textAlign: 'right',
  },
  currencyInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencySymbolWrap: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
    pointerEvents: 'none',
  },
  currencySymbol: {
    includeFontPadding: false,
    color: MUTED,
    fontSize: 16,
    fontWeight: '900',
  },
  currencyInput: {
    paddingLeft: 40,
  },
  toggleRow: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 12,
  },
  toggleRowCentered: {
    alignItems: 'center',
  },
  toggleOptions: {
    // Center the answer "tags" (buttons) horizontally.
    flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse',
    gap: 8,
    justifyContent: 'center',
  },
  toggleOptionsCentered: {
    // If the parent aligns children to the end (RTL-like layouts), stretch the options row
    // so the internal justifyContent:'center' can truly center the buttons.
    alignSelf: 'stretch',
    width: '100%',
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
    // Ensure chips read naturally from right-to-left for Hebrew even if the app isn't running in RTL mode.
    // If the app is already RTL, keep the natural row direction; otherwise force row-reverse.
    flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center',
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
  allChipBtn: {
    // Prevent the "הכל" chip from stretching full-width in a column layout.
    alignSelf: 'center',
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
  confirmBodyText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
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
  sliderTrack: {
    width: '90%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(94,63,45,0.20)',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  sliderProgress: {
    position: 'absolute',
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
  sliderKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: PRIMARY,
    position: 'absolute',
    left: 0,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sliderBalloonSlot: {
    width: '90%',
    height: 62,
    justifyContent: 'flex-end',
  },
  sliderBalloon: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    alignItems: 'center',
  },
  sliderBalloonBubble: {
    width: 44,
    height: 50,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  sliderNumber: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  sliderLabelsRow: {
    width: '90%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabelText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '800',
  },
  inlineFooter: {
    marginTop: 6,
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




