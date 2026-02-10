import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Dimensions,
  Alert,
  Image,
  ViewStyle,
  Share,
  useWindowDimensions,
  Platform,
  PanResponder,
  I18nManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight, ChevronDown, Heart, X, Share2, Users, RefreshCw, User as UserIcon, Search } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { User, UserSurveyResponse } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';
import RoommateCard from '@/components/RoommateCard';
import GroupCardComponent from '@/components/GroupCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cityNeighborhoods, canonicalizeCityName } from '@/assets/data/neighborhoods';
import { Apartment } from '@/types/database';
// GroupCard implemented inline below
import MatchPercentBadge from '@/components/MatchPercentBadge';
import { KeyFabPanel } from '@/components/KeyFabPanel';
import { useUiStore } from '@/stores/uiStore';
import { subscribeOpenPartnersFilters } from '@/lib/partnersFiltersBus';

import {
  calculateMatchScore,
  CompatUserSurvey,
  PartnerSmokingPref,
  PartnerShabbatPref,
  PartnerDietPref,
  PartnerPetsPref,
  DietType,
  HomeLifestyle,
  CleaningFrequency,
  HostingPreference,
  CookingStyle,
  normalizePartnerDietPreference,
} from '@/utils/matchCalculator';

// Keep swipe cards visually consistent (prevents the next card peeking below the current one)
const DEFAULT_SWIPE_CARD_MEDIA_HEIGHT = 520;
const SWIPE_CARD_RADIUS = 20;

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

const OTHER_NEIGHBORHOOD_LABEL = 'אחר';

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
  if (value && value.includes('worker')) return 'worker';
  return null;
}

function normalizeOccupationPreference(value?: string | null): 'student' | 'worker' | 'any' | null {
  const normalized = normalizeKey(value, occupationPrefAliasMap);
  if (normalized) return normalized;
  if (value && value.includes('לא סטודנט')) return 'worker';
  if (value && value.includes('סטודנט')) return 'student';
  if (value && value.includes('עובד')) return 'worker';
  return null;
}

function normalizeNeighborhoodList(value?: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((n) => String(n || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
  }
  return [];
}

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function AgeRangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChange: (minV: number, maxV: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const HANDLE = 26;

  const isRTLRef = useRef(I18nManager.isRTL);

  // X position from LEFT, in px: 0..trackWidth
  const [posMin, setPosMin] = useState(0);
  const [posMax, setPosMax] = useState(0);
  const posMinRef = useRef(0);
  const posMaxRef = useRef(0);
  const startMinRef = useRef(0);
  const startMaxRef = useRef(0);
  const trackWidthRef = useRef(1);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    trackWidthRef.current = trackWidth;
  }, [trackWidth]);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const valueToPos = (v: number) => {
    const minV = minRef.current;
    const maxV = maxRef.current;
    const tw = trackWidthRef.current;
    const clamped = clampNumber(v, minV, maxV);
    const ratio = (clamped - minV) / Math.max(1, maxV - minV);
    // In RTL we want Min on the right, Max on the left.
    const visualRatio = isRTLRef.current ? 1 - ratio : ratio;
    return visualRatio * tw;
  };
  const posToValue = (p: number) => {
    const minV = minRef.current;
    const maxV = maxRef.current;
    const tw = trackWidthRef.current;
    const rawRatio = clampNumber(p / Math.max(1, tw), 0, 1);
    const ratio = isRTLRef.current ? 1 - rawRatio : rawRatio;
    return Math.round(minV + ratio * (maxV - minV));
  };

  const setPositions = (nextMin: number, nextMax: number) => {
    posMinRef.current = nextMin;
    posMaxRef.current = nextMax;
    setPosMin(nextMin);
    setPosMax(nextMax);
  };

  useEffect(() => {
    // Prevent props-driven updates from fighting the gesture while dragging (jitter on iOS prod/TestFlight).
    if (isDraggingRef.current) return;
    setPositions(valueToPos(valueMin), valueToPos(valueMax));
  }, [trackWidth, valueMin, valueMax, min, max]);

  const minResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          isDraggingRef.current = true;
          startMinRef.current = posMinRef.current;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const tw = trackWidthRef.current;
          const rtl = isRTLRef.current;
          const unclamped = startMinRef.current + gestureState.dx;
          const minBound = rtl ? posMaxRef.current : 0;
          const maxBound = rtl ? tw : posMaxRef.current;
          const next = clampNumber(unclamped, minBound, maxBound);
          setPositions(next, posMaxRef.current);
        },
        onPanResponderRelease: () => {
          isDraggingRef.current = false;
          const a = posToValue(posMinRef.current);
          const b = posToValue(posMaxRef.current);
          onChangeRef.current(Math.min(a, b), Math.max(a, b));
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          const a = posToValue(posMinRef.current);
          const b = posToValue(posMaxRef.current);
          onChangeRef.current(Math.min(a, b), Math.max(a, b));
        },
      }),
    [],
  );

  const maxResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          isDraggingRef.current = true;
          startMaxRef.current = posMaxRef.current;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const tw = trackWidthRef.current;
          const rtl = isRTLRef.current;
          const unclamped = startMaxRef.current + gestureState.dx;
          const minBound = rtl ? 0 : posMinRef.current;
          const maxBound = rtl ? posMinRef.current : tw;
          const next = clampNumber(unclamped, minBound, maxBound);
          setPositions(posMinRef.current, next);
        },
        onPanResponderRelease: () => {
          isDraggingRef.current = false;
          const a = posToValue(posMinRef.current);
          const b = posToValue(posMaxRef.current);
          onChangeRef.current(Math.min(a, b), Math.max(a, b));
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          const a = posToValue(posMinRef.current);
          const b = posToValue(posMaxRef.current);
          onChangeRef.current(Math.min(a, b), Math.max(a, b));
        },
      }),
    [],
  );

  return (
    <View style={styles.rangeWrap}>
      <View
        style={styles.rangeTrackWrap}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w && Number.isFinite(w)) setTrackWidth(Math.max(1, Math.round(w)));
        }}
      >
        <View style={styles.rangeTrackBg} />
        <View
          style={[
            styles.rangeTrackActive,
            {
              left: clampNumber(Math.min(posMin, posMax), 0, trackWidth),
              width: Math.max(0, Math.abs(posMax - posMin)),
            },
          ]}
        />

        <View
          {...minResponder.panHandlers}
          style={[
            styles.rangeThumb,
            {
              left: clampNumber(posMin - HANDLE / 2, -HANDLE / 2, trackWidth - HANDLE / 2),
            },
          ]}
        />
        <View
          {...maxResponder.panHandlers}
          style={[
            styles.rangeThumb,
            {
              left: clampNumber(posMax - HANDLE / 2, -HANDLE / 2, trackWidth - HANDLE / 2),
            },
          ]}
        />
      </View>

      <View style={styles.rangeLabelsRow}>
        <Text style={styles.rangeLabelText}>{max}</Text>
        <Text style={styles.rangeLabelText}>{min}</Text>
      </View>
    </View>
  );
}

type BrowseItem =
  | { type: 'user'; user: User }
  | { type: 'group'; groupId: string; users: User[]; apartment?: Apartment };

export default function PartnersScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const didAutoInitCityFilterRef = useRef(false);
  const prevCitiesBeforeAllRef = useRef<string[] | null>(null);
  const [filtersReady, setFiltersReady] = useState(false);

  // Owners should not have access to the partners screen.
  if ((currentUser as any)?.role === 'owner') {
    return <Redirect href="/(tabs)/home" />;
  }

  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [gender, setGender] = useState<'any' | 'male' | 'female'>('any');
  const [ageMin, setAgeMin] = useState<number>(20);
  const [ageMax, setAgeMax] = useState<number>(40);
  const [ageActive, setAgeActive] = useState<boolean>(false);
  const [profileType, setProfileType] = useState<'all' | 'singles' | 'groups'>('all');
  const [groupGender, setGroupGender] = useState<'any' | 'male' | 'female'>('any');
  const [groupSize, setGroupSize] = useState<'any' | 2 | 3>('any');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState<string>('');
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState<string>('');
  const [isNeighborhoodPickerOpen, setIsNeighborhoodPickerOpen] = useState(false);
  const [matchScores, setMatchScores] = useState<Record<string, number | null>>({});
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [includePassed, setIncludePassed] = useState(false);

  const closePartnersFilters = useUiStore((s) => s.closePartnersFilters);

  // Fallback open signal (dev/HMR safe)
  useEffect(() => {
    return subscribeOpenPartnersFilters(() => setIsFiltersOpen(true));
  }, []);

  const closeFilters = () => {
    setIsCityPickerOpen(false);
    setCitySearch('');
    setIsNeighborhoodPickerOpen(false);
    setNeighborhoodSearch('');
    closePartnersFilters();
    setIsFiltersOpen(false);
  };

  const allCities = useMemo(() => Object.keys(cityNeighborhoods), []);
  const isAllCitiesSelected = selectedCities.length > 0 && selectedCities.length >= allCities.length;
  const selectedCityLabel =
    selectedCities.length === 0 || isAllCitiesSelected
      ? 'הכל'
      : selectedCities.length === 1
        ? selectedCities[0]
        : `${selectedCities.length} ערים`;

  const filteredCityOptions = useMemo(() => {
    const q = citySearch.trim();
    const list = allCities;
    if (!q) return list;
    return list.filter((c) => c.includes(q));
  }, [citySearch, allCities]);

  const neighborhoodOptions = useMemo(() => {
    const sourceCities =
      selectedCities.length > 0 && !isAllCitiesSelected ? selectedCities : allCities;
    const uniq = new Set<string>();
    sourceCities.forEach((c) => {
      const key = canonicalizeCityName(String(c || '').trim());
      (cityNeighborhoods[key] || []).forEach((n) => {
        const trimmed = String(n || '').trim();
        if (trimmed) uniq.add(trimmed);
      });
    });
    const list = Array.from(uniq);
    list.sort((a, b) => a.localeCompare(b, 'he'));
    list.push(OTHER_NEIGHBORHOOD_LABEL);
    return list;
  }, [selectedCities, isAllCitiesSelected, allCities]);

  const filteredNeighborhoodOptions = useMemo(() => {
    const q = neighborhoodSearch.trim();
    const list = neighborhoodOptions;
    if (!q) return list;
    return list.filter((n) => n.includes(q));
  }, [neighborhoodSearch, neighborhoodOptions]);

  const selectedNeighborhoodLabel =
    selectedNeighborhoods.length === 0
      ? 'הכל'
      : selectedNeighborhoods.length === 1
        ? selectedNeighborhoods[0]
        : `${selectedNeighborhoods.length} שכונות`;

  const neighborhoodFilterState = useMemo(() => {
    const cleaned = selectedNeighborhoods.map((n) => String(n || '').trim()).filter(Boolean);
    const selectedSet = new Set(cleaned);
    const otherSelected = selectedSet.has(OTHER_NEIGHBORHOOD_LABEL);
    const selectedList = cleaned.filter((n) => n !== OTHER_NEIGHBORHOOD_LABEL);
    const knownSet = new Set(neighborhoodOptions.filter((n) => n !== OTHER_NEIGHBORHOOD_LABEL));
    return { selectedSet, selectedList, otherSelected, knownSet };
  }, [selectedNeighborhoods, neighborhoodOptions]);

  useEffect(() => {
    if (selectedNeighborhoods.length === 0) return;
    const valid = new Set(neighborhoodOptions);
    const next = selectedNeighborhoods.filter((n) => valid.has(n));
    if (next.length !== selectedNeighborhoods.length) {
      setSelectedNeighborhoods(next);
    }
  }, [neighborhoodOptions, selectedNeighborhoods]);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const headerOffset = insets.top + 52 + -40;
  const SWIPE_THRESHOLD = 120;
  const ACTIONS_BAR_HEIGHT = 76;
  // Negative gap moves the floating buttons slightly down (closer to the bottom) while staying safe on devices with no bottom inset.
  const ACTIONS_BOTTOM_GAP = -10;
  const actionsBottom = Math.max(0, insets.bottom + ACTIONS_BOTTOM_GAP);
  const CARD_GAP_TO_ACTIONS = 14;
  const EXTRA_CARD_BOTTOM_SPACE = 52; // extra safety so the card never sits behind the bottom action buttons
  // estimate top chrome (status + logo area + small padding). We clamp so it behaves consistently across devices.
  const TOP_CHROME_ESTIMATE = Math.max(96, insets.top + 84);

  // Dynamic card height: fills most of the screen and keeps a stable gap to the bottom action buttons.
  const swipeCardHeight = Math.round(
    Math.min(
      620,
      Math.max(
        440,
        screenHeight -
          TOP_CHROME_ESTIMATE -
          (ACTIONS_BAR_HEIGHT + actionsBottom + CARD_GAP_TO_ACTIONS + EXTRA_CARD_BOTTOM_SPACE) -
          16,
      ),
    ),
  );

  const isDeckExhausted = items.length > 0 && currentIndex >= items.length;

  const onSwipe = (type: 'like' | 'pass') => {
    const item = items[currentIndex];
    if (!item) return;
    if (type === 'like') {
      if (item.type === 'user') handleLike((item as any).user, { skipSlide: true });
      else handleGroupLike((item as any).groupId, (item as any).users, { skipSlide: true });
    } else {
      if (item.type === 'user') handlePass((item as any).user, { skipSlide: true });
      else handleGroupPass((item as any).groupId, (item as any).users, { skipSlide: true });
    }
    // IMPORTANT: allow advancing past the last item so we can show a proper "end of deck" state.
    setCurrentIndex((i) => {
      const next = i + 1;
      return next >= items.length ? items.length : next;
    });
  };

  const swipeGesture = Gesture.Pan()
    .enabled(!isDeckExhausted && !isDetailsOpen)
    .onChange((e) => {
      translateX.value = e.translationX;
    })
    .onEnd(() => {
      'worklet';
      if (translateX.value > SWIPE_THRESHOLD) {
        translateX.value = withTiming(screenWidth + 200, { duration: 180 }, (finished) => {
          if (finished) {
            // Reset on the UI thread BEFORE swapping the underlying item (prevents the next card "jumping" in).
            translateX.value = 0;
            runOnJS(onSwipe)('like');
          }
        });
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-screenWidth - 200, { duration: 180 }, (finished) => {
          if (finished) {
            translateX.value = 0;
            runOnJS(onSwipe)('pass');
          }
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotateZ: `${interpolate(
          translateX.value,
          [-screenWidth, 0, screenWidth],
          [-12, 0, 12],
          Extrapolate.CLAMP,
        )}deg`,
      },
    ],
  }));

  const behindCardAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolate.CLAMP,
    );
    return {
      // Keep the next card in a stable position to avoid any perceived "jump" when swapping cards.
      // We only apply a very subtle scale/opacity change.
      transform: [{ scale: 0.99 + progress * 0.01 }],
      opacity: 0.94 + progress * 0.06,
    };
  });

  const likeOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 0.75], Extrapolate.CLAMP),
  }));

  const passOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [0.75, 0], Extrapolate.CLAMP),
  }));

  // Default: show only partners in the same city as the current logged-in user.
  // We run this once per session (unless user explicitly changes filters).
  useEffect(() => {
    if (!currentUser?.id) return;
    if (didAutoInitCityFilterRef.current) return;

    const myCity = canonicalizeCityName(String((currentUser as any)?.city || '').trim());
    if (myCity) {
      setSelectedCities([myCity]);
    }

    didAutoInitCityFilterRef.current = true;
    setFiltersReady(true);
  }, [currentUser?.id, (currentUser as any)?.city]);

  // Initial fetch happens only after we applied default filters.
  useEffect(() => {
    if (!currentUser?.id) return;
    if (!filtersReady) return;
    fetchUsersAndGroups();
  }, [currentUser?.id, filtersReady]);

  const parsePreferredAgeRange = (value?: string | null): { min: number | null; max: number | null } => {
    if (!value) return { min: null, max: null };
    const matches = (value.match(/\d+/g) || []).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
    if (!matches.length) return { min: null, max: null };
    if (matches.length === 1) {
      return { min: matches[0], max: null };
    }
    const [first, second] = matches;
    if (second !== undefined) {
      return { min: Math.min(first, second), max: Math.max(first, second) };
    }
    return { min: first, max: null };
  };

  const buildCompatSurvey = (
    userEntry: User | undefined,
    survey?: UserSurveyResponse | null,
  ): Partial<CompatUserSurvey> => {
    const compat: Partial<CompatUserSurvey> = {};
    if (typeof userEntry?.age === 'number') compat.age = userEntry.age;
    compat.gender = normalizeGenderValue(userEntry?.gender);
    if (userEntry?.city) compat.city = userEntry.city;

    if (typeof survey?.is_smoker === 'boolean') compat.is_smoker = survey.is_smoker;
    if (typeof survey?.has_pet === 'boolean') compat.has_pet = survey.has_pet;
    if (typeof survey?.is_shomer_shabbat === 'boolean') compat.is_shomer_shabbat = survey.is_shomer_shabbat;
    if (typeof survey?.keeps_kosher === 'boolean') compat.keeps_kosher = survey.keeps_kosher;
    if (survey?.diet_type) compat.diet_type = survey.diet_type as DietType;
    if ((survey as any)?.home_lifestyle) compat.home_lifestyle = (survey as any).home_lifestyle as HomeLifestyle;
    if (typeof survey?.cleanliness_importance === 'number')
      compat.cleanliness_importance = survey.cleanliness_importance;
    if (survey?.cleaning_frequency) compat.cleaning_frequency = survey.cleaning_frequency as CleaningFrequency;
    if (survey?.hosting_preference) compat.hosting_preference = survey.hosting_preference as HostingPreference;
    if (survey?.cooking_style) compat.cooking_style = survey.cooking_style as CookingStyle;
    {
      const cities = Array.isArray((survey as any)?.preferred_cities) ? ((survey as any).preferred_cities as any[]) : [];
      const primary = cities.length ? String(cities[0] ?? '').trim() : '';
      if (primary) compat.preferred_city = primary as any;
    }
    if (Array.isArray(survey?.preferred_neighborhoods)) compat.preferred_neighborhoods = survey.preferred_neighborhoods;
    if (Number.isFinite((survey as any)?.price_min as number)) compat.price_min = Number((survey as any).price_min);
    if (Number.isFinite((survey as any)?.price_max as number)) compat.price_max = Number((survey as any).price_max);
    if (Number.isFinite(survey?.price_range as number)) compat.price_range = Number((survey as any).price_range);
    if (survey?.floor_preference) compat.floor_preference = survey.floor_preference;
    if (typeof survey?.has_balcony === 'boolean') compat.has_balcony = survey.has_balcony;
    if (typeof survey?.pets_allowed === 'boolean') compat.pets_allowed = survey.pets_allowed;
    {
      const rawChoices = Array.isArray((survey as any)?.preferred_roommates_choices)
        ? ((survey as any).preferred_roommates_choices as any[])
        : [];
      const cleaned = Array.from(
        new Set(rawChoices.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0 && v <= 4))
      );
      if (cleaned.length) compat.preferred_roommates_choices = cleaned;
    }
    if ((survey as any)?.move_in_month_from) compat.move_in_month_from = (survey as any).move_in_month_from;
    if ((survey as any)?.move_in_month_to) compat.move_in_month_to = (survey as any).move_in_month_to;
    if (typeof (survey as any)?.move_in_is_flexible === 'boolean')
      compat.move_in_is_flexible = (survey as any).move_in_is_flexible;
    if (survey?.move_in_month) compat.move_in_month = survey.move_in_month; // legacy
    if (typeof survey?.is_sublet === 'boolean') compat.is_sublet = survey.is_sublet;
    if (survey?.sublet_month_from) compat.sublet_month_from = survey.sublet_month_from;
    if (survey?.sublet_month_to) compat.sublet_month_to = survey.sublet_month_to;
    if (survey?.relationship_status) compat.relationship_status = survey.relationship_status;
    const occupationValue = normalizeOccupationValue(survey?.occupation);
    if (occupationValue) compat.occupation = occupationValue;

    if (survey?.partner_smoking_preference)
      compat.partner_smoking_preference = survey.partner_smoking_preference as PartnerSmokingPref;
    if (survey?.partner_pets_preference)
      compat.partner_pets_preference = survey.partner_pets_preference as PartnerPetsPref;
    {
      const normalized = normalizePartnerDietPreference(survey?.partner_diet_preference);
      if (normalized) compat.partner_diet_preference = normalized as PartnerDietPref;
    }
    if (survey?.partner_shabbat_preference)
      compat.partner_shabbat_preference = survey.partner_shabbat_preference as PartnerShabbatPref;
    const preferredGender = normalizeGenderPreference(survey?.preferred_gender);
    if (preferredGender) compat.preferred_gender = preferredGender;
    const preferredOccupation = normalizeOccupationPreference(survey?.preferred_occupation);
    if (preferredOccupation) compat.preferred_occupation = preferredOccupation;

    const { min, max } = parsePreferredAgeRange(survey?.preferred_age_range);
    if (typeof min === 'number') compat.preferred_age_min = min;
    if (typeof max === 'number') compat.preferred_age_max = max;

    return compat;
  };

  const computeMatchPercentages = async (
    candidateIds: string[],
    userMap: Record<string, User>,
    surveysOverride?: Record<string, UserSurveyResponse>,
  ): Promise<Record<string, number | null>> => {
    const authId = useAuthStore.getState().user?.id || currentUser?.id;
    if (!authId || !candidateIds.length) return {};
    const uniqueIds = Array.from(new Set([...candidateIds, authId]));
    try {
      let surveys: Record<string, UserSurveyResponse> = surveysOverride || {};
      if (!surveysOverride) {
        const { data: surveyRows, error } = await supabase
          .from('user_survey_responses')
          .select('*')
          .in('user_id', uniqueIds);
        if (error) {
          console.error('failed to fetch survey responses for matching', error);
          return {};
        }
        surveys = Object.fromEntries(
          (surveyRows || []).map((row) => [row.user_id, row as UserSurveyResponse]),
        ) as Record<string, UserSurveyResponse>;
      }
      const mySurvey = surveys[authId];
      const results: Record<string, number | null> = {};
      if (!mySurvey) {
        candidateIds.forEach((id) => {
          if (id !== authId) results[id] = null;
        });
        return results;
      }

      if (currentUser) {
        userMap[authId] = currentUser as unknown as User;
      }
      const myCompat = buildCompatSurvey(userMap[authId], mySurvey);

      candidateIds.forEach((id) => {
        if (id === authId) return;
        const otherSurvey = surveys[id];
        if (!otherSurvey) {
          results[id] = null;
          return;
        }
        const otherCompat = buildCompatSurvey(userMap[id], otherSurvey);
        const score = calculateMatchScore(myCompat, otherCompat);
        results[id] = Number.isFinite(score) ? score : null;
      });

      return results;
    } catch (error) {
      console.error('failed to compute match percentages', error);
      return {};
    }
  };

  const userMatchesNeighborhoodFilter = (survey?: UserSurveyResponse | null) => {
    if (!neighborhoodFilterState.selectedList.length && !neighborhoodFilterState.otherSelected) return true;
    const preferred = normalizeNeighborhoodList((survey as any)?.preferred_neighborhoods);
    const hasSelected = preferred.some((n) => neighborhoodFilterState.selectedList.includes(n));
    if (hasSelected) return true;
    if (neighborhoodFilterState.otherSelected) {
      if (preferred.length === 0) return true;
      return preferred.some((n) => !neighborhoodFilterState.knownSet.has(n));
    }
    return false;
  };

  const userPassesFilters = (u: User, survey?: UserSurveyResponse | null) => {
    // Gender filter
    if (gender !== 'any') {
      if (!u.gender || u.gender !== gender) return false;
    }
    // City filter (multi-select)
    if (selectedCities.length && !isAllCitiesSelected) {
      const userCity = canonicalizeCityName(u.city || '');
      if (!selectedCities.includes(userCity)) return false;
    }
    // Age filter: only when activated by the user
    if (ageActive) {
      if (typeof u.age !== 'number') return false;
      if (u.age < ageMin || u.age > ageMax) return false;
    }
    // Neighborhoods filter (preferred neighborhoods from survey)
    if (!userMatchesNeighborhoodFilter(survey)) return false;
    return true;
  };

  const groupPassesFilters = (users: User[], surveyMap: Record<string, UserSurveyResponse | undefined>) => {
    // group size filter
    if (groupSize !== 'any') {
      if (users.length !== groupSize) return false;
    }
    // city filter: all members must be within selected cities (if any selected)
    if (selectedCities.length && !isAllCitiesSelected) {
      const allInCity = users.every((u) =>
        selectedCities.includes(canonicalizeCityName(u.city || ''))
      );
      if (!allInCity) return false;
    }
    // group gender filter: all members must be the selected gender
    if (groupGender !== 'any') {
      if (!users.every((u) => u.gender === groupGender)) return false;
    }
    // age filter: when active, require all members to be within range
    if (ageActive) {
      const allInRange = users.every((u) => typeof u.age === 'number' && u.age >= ageMin && u.age <= ageMax);
      if (!allInRange) return false;
    }
    // neighborhood filter: all members must match preferred neighborhoods (when active)
    if (neighborhoodFilterState.selectedList.length || neighborhoodFilterState.otherSelected) {
      const allMatch = users.every((u) => userMatchesNeighborhoodFilter(surveyMap[u.id]));
      if (!allMatch) return false;
    }
    return true;
  };

  const fetchSurveyMapByUserIds = async (userIds: string[]) => {
    if (!userIds.length) return {} as Record<string, UserSurveyResponse>;
    try {
      const { data, error } = await supabase
        .from('user_survey_responses')
        .select('*')
        .in('user_id', userIds);
      if (error) {
        console.error('failed to fetch survey responses for filters', error);
        return {} as Record<string, UserSurveyResponse>;
      }
      return Object.fromEntries(
        (data || []).map((row) => [row.user_id, row as UserSurveyResponse]),
      ) as Record<string, UserSurveyResponse>;
    } catch (error) {
      console.error('failed to fetch survey responses for filters', error);
      return {} as Record<string, UserSurveyResponse>;
    }
  };

  const fetchUsersAndGroups = async (opts?: { includePassed?: boolean }) => {
    const includePassedNow = typeof opts?.includePassed === 'boolean' ? opts.includePassed : includePassed;
    setIsLoading(true);
    setMatchScores({});
    try {
      const authId = useAuthStore.getState().user?.id || currentUser?.id;

      // Fetch all users (singles)
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'user')
        .order('created_at', { ascending: false });
      if (usersError) throw usersError;

      // Fetch ACTIVE groups first (public readable by RLS), then get their members
      const { data: groupsData, error: groupsErr } = await supabase
        .from('profile_groups')
        .select('id, status, created_by')
        .eq('status', 'ACTIVE');
      if (groupsErr) throw groupsErr;
      const groupIds = (groupsData || []).map((g: any) => g.id as string);
      const groupIdToCreatorId: Record<string, string> = {};
      (groupsData || []).forEach((g: any) => {
        const gid = String(g?.id || '').trim();
        const creator = String(g?.created_by || '').trim();
        if (gid && creator) groupIdToCreatorId[gid] = creator;
      });

      let members: { group_id: string; user_id: string }[] = [];
      if (groupIds.length) {
        const { data: mRows, error: mErr } = await supabase
          .from('profile_group_members')
          .select('group_id, user_id, status')
          .eq('status', 'ACTIVE')
          .in('group_id', groupIds);
        if (mErr) throw mErr;
        // Normalize members
        members = (mRows || []).map((r: any) => ({ group_id: r.group_id, user_id: r.user_id }));
      }

      // Groups that include the current user (used for interaction filtering and query scoping)
      const groupIdsWithCurrentUser = new Set(
        (authId ? members.filter((m) => m.user_id === authId) : []).map((m) => m.group_id)
      );


      // Include group creators as a fallback member source (some old groups may miss the creator row in profile_group_members)
      const creatorIds = Object.values(groupIdToCreatorId).filter(Boolean);
      const groupUserIds = Array.from(new Set([...members.map((m) => m.user_id), ...creatorIds]));
      let groupUsersById: Record<string, User> = {};
      if (groupUserIds.length) {
        const { data: gUsers, error: guErr } = await supabase
          .from('users')
          .select('*')
          .in('id', groupUserIds);
        if (guErr) throw guErr;
        groupUsersById = Object.fromEntries(((gUsers || []) as User[]).map((u) => [u.id, u]));
      }

      const allSurveyIds = Array.from(
        new Set([
          ...((usersData || []) as User[]).map((u) => u.id),
          ...Object.keys(groupUsersById),
          ...(authId ? [authId] : []),
        ]),
      );
      const surveysByUserId = await fetchSurveyMapByUserIds(allSurveyIds);

      // Build groups with their users
      const groupIdToUsers: Record<string, User[]> = {};
      members.forEach((m) => {
        const u = groupUsersById[m.user_id];
        if (!u) return;
        if (!groupIdToUsers[m.group_id]) groupIdToUsers[m.group_id] = [];
        groupIdToUsers[m.group_id].push(u);
      });
      // Ensure creator is included (deduped)
      Object.entries(groupIdToCreatorId).forEach(([gid, creatorId]) => {
        const creator = groupUsersById[creatorId];
        if (!creator) return;
        if (!groupIdToUsers[gid]) groupIdToUsers[gid] = [];
        const exists = groupIdToUsers[gid].some((u) => String(u?.id) === creatorId);
        if (!exists) groupIdToUsers[gid].push(creator);
      });

      // Filter to groups with at least 2 users, not including the current user
      // Apply UI filters: all members must pass filters (age, gender)
      const activeGroups: { groupId: string; users: User[]; apartment?: Apartment }[] = Object.entries(groupIdToUsers)
        .map(([gid, us]) => ({ groupId: gid, users: us }))
        .filter(
          (g) =>
            g.users.length >= 2 &&
            !g.users.some((u) => u.id === authId) &&
            groupPassesFilters(g.users, surveysByUserId)
        );

      // Fetch all apartments
      const { data: apartmentsData, error: aptErr } = await supabase
        .from('apartments')
        .select('*');
      
      const apartmentsForGroups: Record<string, Apartment> = {};
      
      if (!aptErr && apartmentsData) {
        // For each group, find if any member is in an apartment
        for (const group of activeGroups) {
          const groupUserIds = group.users.map(u => u.id);
          
          // Check each apartment
          for (const apt of apartmentsData as Apartment[]) {
            let partnerIds: string[] = [];
            
            // Handle partner_ids - could be array, JSON string, or PostgreSQL array string
            if (apt.partner_ids) {
              if (Array.isArray(apt.partner_ids)) {
                partnerIds = apt.partner_ids;
              } else if (typeof apt.partner_ids === 'string') {
                try {
                  // Try parsing as JSON
                  const parsed = JSON.parse(apt.partner_ids);
                  partnerIds = Array.isArray(parsed) ? parsed : [];
                } catch {
                  // Try parsing as PostgreSQL array format: {id1,id2,id3}
                  const cleaned = (apt.partner_ids as string).replace(/[{}]/g, '');
                  partnerIds = cleaned.split(',').map(s => s.trim()).filter(Boolean);
                }
              }
            }
            
            // Check if any group member is in this apartment's partner_ids
            const hasMatch = groupUserIds.some(userId => partnerIds.includes(userId));
            
            if (hasMatch) {
              apartmentsForGroups[group.groupId] = apt;
              console.log(`Found apartment ${apt.id} for group ${group.groupId}`);
              break; // Found apartment for this group
            }
          }
        }
      }
      
      // Attach apartments to groups
      activeGroups.forEach(group => {
        if (apartmentsForGroups[group.groupId]) {
          group.apartment = apartmentsForGroups[group.groupId];
        }
      });

      // Only show merged profiles (groups)
      // Also include single users not in active groups, filtered, and not already interacted with

      let matchRows: {
        id: string;
        sender_id: string;
        receiver_id: string | null;
        receiver_group_id?: string | null;
        sender_group_id?: string | null;
        status?: string | null;
      }[] = [];
      if (authId) {
        // Include interactions that involve me directly OR any of my groups
        const myGroupIds = Array.from(groupIdsWithCurrentUser);
        const inList = myGroupIds.length ? `(${myGroupIds.join(',')})` : '';
        const orParts = [
          `sender_id.eq.${authId}`,
          `receiver_id.eq.${authId}`,
        ];
        if (myGroupIds.length) {
          orParts.push(`receiver_group_id.in.${inList}`);
          orParts.push(`sender_group_id.in.${inList}`);
        }
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('id, sender_id, receiver_id, receiver_group_id, sender_group_id, status')
          .or(orParts.join(','));
        if (matchesError) throw matchesError;
        matchRows = matchesData || [];
      }

      const list = (usersData || []) as User[];
      const interacted = new Set<string>();
      const interactedGroupIds = new Set<string>();
      if (authId) {
        const myGroupIds = new Set(
          members.filter((m) => m.user_id === authId).map((m) => m.group_id),
        );

        matchRows.forEach((row) => {
          const status = String(row.status || '').trim().toUpperCase();
          const isNotRelevant = status === 'NOT_RELEVANT';
          const shouldHideForOutgoing = !(includePassedNow && isNotRelevant);

          // APPROVED is a mutual "match": hide the other side regardless of direction.
          if (status === 'APPROVED') {
            // User <-> User
            if (row.sender_id === authId && row.receiver_id) interacted.add(row.receiver_id);
            if (row.receiver_id === authId && row.sender_id) interacted.add(row.sender_id);

            // User <-> Group
            if (row.sender_id === authId && row.receiver_group_id) interactedGroupIds.add(row.receiver_group_id);
            if (row.receiver_group_id && myGroupIds.has(row.receiver_group_id) && row.sender_id) interacted.add(row.sender_id);

            // Group <-> User/Group
            if (row.sender_group_id && myGroupIds.has(row.sender_group_id)) {
              if (row.receiver_id) interacted.add(row.receiver_id);
              if (row.receiver_group_id) interactedGroupIds.add(row.receiver_group_id);
            }
            if (row.receiver_id === authId && row.sender_group_id) interactedGroupIds.add(row.sender_group_id);

            // done for APPROVED
            return;
          }

          // IMPORTANT: interaction filtering should be directional.
          // We only hide profiles that *I* (or one of my ACTIVE groups) already acted on (sent like/pass).
          // If someone acted on me (incoming request / NOT_RELEVANT), I should still be able to see them here.

          // Outgoing: User -> User
          if (row.sender_id === authId && row.receiver_id && shouldHideForOutgoing) {
            interacted.add(row.receiver_id);
          }

          // Outgoing: User -> Group
          if (row.sender_id === authId && row.receiver_group_id && shouldHideForOutgoing) {
            interactedGroupIds.add(row.receiver_group_id);
          }

          // Outgoing: My Group -> User/Group
          if (row.sender_group_id && myGroupIds.has(row.sender_group_id)) {
            if (shouldHideForOutgoing) {
              if (row.receiver_id) interacted.add(row.receiver_id);
              if (row.receiver_group_id) interactedGroupIds.add(row.receiver_group_id);
            }
          }
        });
      }

      // Exclude everyone who belongs to any merged/active group (by membership), not just visible groups
      const memberIdsInActiveGroups = new Set(members.map((m) => m.user_id));

      // Exclude members who share a group with the current user (so you don't see your own group-mates as singles)
      // already computed above as groupIdsWithCurrentUser
      const memberIdsInUsersOwnGroups = new Set(
        members
          .filter((m) => groupIdsWithCurrentUser.has(m.group_id))
          .map((m) => m.user_id)
      );
      const memberIdsToExclude = new Set<string>([
        ...Array.from(memberIdsInActiveGroups),
        ...Array.from(memberIdsInUsersOwnGroups),
      ]);

      let filteredSingles = list.filter((u) => u.id !== authId);

      filteredSingles = filteredSingles.filter((u) => !interacted.has(u.id));

      filteredSingles = filteredSingles.filter((u) => !memberIdsToExclude.has(u.id));

      filteredSingles = filteredSingles.filter((u) => userPassesFilters(u, surveysByUserId[u.id]));

      let combinedItems: BrowseItem[] = [];
      if (profileType === 'groups' || profileType === 'all') {
        const groupItems = activeGroups
          .filter((g) => !interactedGroupIds.has(g.groupId))
          .map((g) => ({ type: 'group', groupId: g.groupId, users: g.users, apartment: g.apartment }) as BrowseItem);
        combinedItems.push(...groupItems);
      }
      if (profileType === 'singles' || profileType === 'all') {
        const singleItems = filteredSingles.map((u) => ({ type: 'user', user: u }) as BrowseItem);
        combinedItems.push(...singleItems);
      }

      setItems(combinedItems);
      setCurrentIndex(0);

      const userMap: Record<string, User> = {};
      const candidateIdSet = new Set<string>();
      combinedItems.forEach((item) => {
        if (item.type === 'user') {
          const single = (item as { type: 'user'; user: User }).user;
          if (single?.id) {
            userMap[single.id] = single;
            candidateIdSet.add(single.id);
          }
        } else if (item.type === 'group') {
          const groupUsers = (item as { type: 'group'; users: User[] }).users;
          groupUsers.forEach((member) => {
            if (member?.id) {
              userMap[member.id] = member;
              candidateIdSet.add(member.id);
            }
          });
        }
      });
      if (currentUser?.id) {
        userMap[currentUser.id] = currentUser as unknown as User;
      }
      const candidateIds = Array.from(candidateIdSet);
      const newMatchScores = await computeMatchPercentages(candidateIds, userMap, surveysByUserId);
      if (Object.keys(newMatchScores).length) {
        setMatchScores(newMatchScores);
      }
    } catch (e) {
      console.error('Failed to fetch users', e);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async (opts?: { resetIncludePassed?: boolean }) => {
    setIsRefreshing(true);
    // "Refresh" on end/empty should look for new matches, not resurface NOT_RELEVANT.
    const shouldReset =
      typeof opts?.resetIncludePassed === 'boolean'
        ? opts.resetIncludePassed
        : includePassed && (isDeckExhausted || items.length === 0);

    if (shouldReset) setIncludePassed(false);
    await fetchUsersAndGroups({ includePassed: shouldReset ? false : includePassed });
    setIsRefreshing(false);
  };

  const slideTo = (nextIndex: number, direction: 'next' | 'prev') => {
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const outTarget = direction === 'next' ? -screenWidth : screenWidth;
    translateX.value = withTiming(outTarget, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(setCurrentIndex)(nextIndex);
        translateX.value = direction === 'next' ? screenWidth : -screenWidth;
        translateX.value = withSpring(0, { damping: 18, stiffness: 160 });
      }
    });
  };

  const goNext = () => slideTo(currentIndex + 1, 'next');
  const goPrev = () => slideTo(currentIndex - 1, 'prev');

  const handleLike = async (likedUser: User, opts?: { skipSlide?: boolean }) => {
    if (currentUser?.id && likedUser.id === currentUser.id) {
      goNext();
      return;
    }
    try {
      if (!currentUser?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      // If the sender is part of a merged profile, capture the sender_group_id once
      let senderGroupId: string | null = null;
      try {
        const { data: myGroup } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', currentUser.id)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        senderGroupId = (myGroup as any)?.group_id || null;
      } catch {}
      // prevent duplicate request rows
      const { data: existing, error: existingErr } = await supabase
        .from('matches')
        .select('id')
        .eq('sender_id', currentUser.id)
        .eq('receiver_id', likedUser.id)
        .maybeSingle();
      if (existingErr && !String(existingErr?.message || '').includes('PGRST')) {
        // non-not-found error
        throw existingErr;
      }
      if (existing) {
        Alert.alert('שמת לב', 'כבר שלחת בקשת שותפות למשתמש זה');
        goNext();
        return;
      }

      // create a match request in pending status
      const { error: insertErr } = await supabase.from('matches').insert({
        sender_id: currentUser.id,
        receiver_id: likedUser.id,
        sender_group_id: senderGroupId,
        status: 'PENDING',
      } as any);
      if (insertErr) throw insertErr;

      if (!opts?.skipSlide) {
        goNext();
      }
    } catch (e: any) {
      console.error('like failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח בקשה');
    }
  };
  const handlePass = async (user: User, opts?: { skipSlide?: boolean }) => {
    if (!currentUser?.id) {
      Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
      return;
    }
    if (currentUser?.id && user.id === currentUser.id) {
      goNext();
      return;
    }
    try {
      // Determine sender group once to persist it
      let senderGroupId: string | null = null;
      try {
        const { data: myGroup } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', currentUser.id)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        senderGroupId = (myGroup as any)?.group_id || null;
      } catch {}
      const { data: existing, error: existingErr } = await supabase
        .from('matches')
        .select('id')
        .eq('sender_id', currentUser.id)
        .eq('receiver_id', user.id)
        .maybeSingle();
      if (existingErr && !String(existingErr?.message || '').includes('PGRST116')) {
        throw existingErr;
      }

      if (existing?.id) {
        const updatePayload: any = {
          status: 'NOT_RELEVANT',
          updated_at: new Date().toISOString(),
        };
        if (senderGroupId) updatePayload.sender_group_id = senderGroupId;
        const { error: updateErr } = await supabase
          .from('matches')
          .update(updatePayload)
          .eq('id', existing.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('matches').insert({
          sender_id: currentUser.id,
          receiver_id: user.id,
          sender_group_id: senderGroupId,
          status: 'NOT_RELEVANT',
        } as any);
        if (insertErr) throw insertErr;
      }
    } catch (e: any) {
      console.error('pass failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לסמן כלא רלוונטי');
    } finally {
      if (!opts?.skipSlide) {
        goNext();
      }
    }
  };
  // Removed favorite action per request

  const handleGroupLike = async (groupId: string, groupUsers: User[], opts?: { skipSlide?: boolean }) => {
    try {
      if (!currentUser?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      // prevent duplicate request rows at group-level
      const { data: existing, error: existingErr } = await supabase
        .from('matches')
        .select('id')
        .eq('sender_id', currentUser.id)
        .eq('receiver_group_id', groupId)
        .maybeSingle();
      if (existingErr && !String(existingErr?.message || '').includes('PGRST')) {
        throw existingErr;
      }
      if (existing) {
        Alert.alert('שמת לב', 'כבר שלחת בקשת שותפות לפרופיל המאוחד הזה');
        goNext();
        return;
      }

      // create a single group-level match
      const { error: insertErr } = await supabase.from('matches').insert({
        sender_id: currentUser.id,
        receiver_group_id: groupId,
        status: 'PENDING',
      } as any);
      if (insertErr) throw insertErr;
      if (!opts?.skipSlide) {
        goNext();
      }
    } catch (e: any) {
      console.error('group like failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח בקשות לקבוצה');
    }
  };

  const handleGroupPass = async (groupId: string, groupUsers: User[], opts?: { skipSlide?: boolean }) => {
    try {
      if (!currentUser?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      const { data: existing, error: existingErr } = await supabase
        .from('matches')
        .select('id')
        .eq('sender_id', currentUser.id)
        .eq('receiver_group_id', groupId)
        .maybeSingle();
      if (existingErr && !String(existingErr?.message || '').includes('PGRST')) {
        throw existingErr;
      }
      if (existing?.id) {
        const { error: updateErr } = await supabase
          .from('matches')
          .update({ status: 'NOT_RELEVANT', updated_at: new Date().toISOString() } as any)
          .eq('id', existing.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('matches').insert({
          sender_id: currentUser.id,
          receiver_group_id: groupId,
          status: 'NOT_RELEVANT',
        } as any);
        if (insertErr) throw insertErr;
      }
    } catch (e: any) {
      console.error('group pass failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לסמן קבוצה כלא רלוונטית');
    } finally {
      if (!opts?.skipSlide) {
        goNext();
      }
    }
  };
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  const renderBrowseItem = (item: BrowseItem) => {
    if (item.type === 'user') {
      return (
        <RoommateCard
          user={(item as any).user}
          matchPercent={matchScores[(item as any).user.id] ?? null}
          onLike={handleLike}
          onPass={handlePass}
          style={{ marginBottom: 0 }}
          mediaHeight={swipeCardHeight}
          enableParallaxDetails
          strongTextOverlay
          onDetailsOpenChange={setIsDetailsOpen}
          onOpen={(u) =>
            router.push({
              pathname: '/(tabs)/user/[id]',
              params: { id: u.id, from: 'partners' } as any,
            })
          }
        />
      );
    }

    return (
      <GroupCardComponent
        groupId={(item as any).groupId}
        users={(item as any).users}
        apartment={(item as any).apartment}
        matchScores={matchScores}
        onLike={(groupId, users) => handleGroupLike(groupId, users)}
        onPass={(groupId, users) => handleGroupPass(groupId, users)}
        mediaHeight={swipeCardHeight}
        strongTextOverlay
        onDetailsOpenChange={setIsDetailsOpen}
        onOpen={(userId: string) =>
          router.push({
            pathname: '/(tabs)/user/[id]',
            params: { id: userId, from: 'partners' } as any,
          })
        }
        onOpenApartment={(apartmentId: string) =>
          router.push({
            pathname: '/apartment/[id]',
            params: { id: apartmentId } as any,
          })
        }
        style={{ marginBottom: 0 }}
      />
    );
  };

  const triggerSwipe = (type: 'like' | 'pass') => {
    if (isDeckExhausted) return;
    const outTarget = type === 'like' ? screenWidth + 200 : -screenWidth - 200;
    translateX.value = withTiming(outTarget, { duration: 180 }, (finished) => {
      if (finished) {
        translateX.value = 0;
        runOnJS(onSwipe)(type);
      }
    });
  };

  const onShareProfile = async () => {
    const item = items[currentIndex];
    if (!item) return;

    const message =
      item.type === 'user'
        ? (() => {
            const u = (item as any).user as User;
            const name = u?.full_name || 'פרופיל';
            const age = u?.age ? `, ${u.age}` : '';
            const city = u?.city ? `\nעיר: ${u.city}` : '';
            return `Homie – שותפים\n${name}${age}${city}`;
          })()
        : (() => {
            const users = ((item as any).users || []) as User[];
            const names = users.map((u) => u?.full_name).filter(Boolean).slice(0, 4).join(', ');
            const suffix = users.length > 4 ? ` +${users.length - 4}` : '';
            return `Homie – שותפים\nקבוצה: ${names || 'פרופיל משותף'}${suffix}`;
          })();

    try {
      await Share.share({ message });
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        scrollEnabled={!isDetailsOpen}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerOffset,
            // Reserve space so the fixed bottom buttons never overlap the card on small screens.
            // Important: tabs do NOT overlay this screen, so we only account for safe-area + our button bar.
            paddingBottom: ACTIONS_BAR_HEIGHT + actionsBottom + CARD_GAP_TO_ACTIONS + 16,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#111827" />
        }
      >
        {items.length === 0 ? (
          <View style={[styles.cardStack, { height: swipeCardHeight, justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.emptyStateCard}>
              <LinearGradient
                colors={['rgba(94,63,45,0.18)', 'rgba(94,63,45,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyStateIconWrap}
              >
                <Users size={34} color="#5e3f2d" />
              </LinearGradient>
              <Text style={styles.emptyStateTitle}>לא נמצאו שותפים להצגה</Text>
              <Text style={styles.emptyStateSubtitle}>
                כרגע אין התאמות זמינות. אפשר לנסות שוב בעוד כמה דקות או לרענן.
              </Text>
              <View style={styles.emptyStateActions}>
                {!includePassed ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.emptyStateBtn, styles.emptyStateBtnSecondary]}
                    onPress={() => {
                      const enable = () => {
                        setIncludePassed(true);
                        fetchUsersAndGroups({ includePassed: true });
                      };
                      if (Platform.OS === 'web') {
                        enable();
                        return;
                      }
                      Alert.alert(
                        'להציג שותפים שסימנת כלא רלוונטיים?',
                        'נוכל להציג שוב גם שותפים שסימנת בהחלקה שמאלה. תמיד אפשר לסמן שוב כלא רלוונטי.',
                        [{ text: 'ביטול', style: 'cancel' }, { text: 'כן, הצג שוב', onPress: enable }],
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="הצג שוב שותפים שסימנתי כלא רלוונטיים"
                  >
                    <Text style={[styles.emptyStateBtnText, styles.emptyStateBtnTextSecondary]}>
                      הצג שוב “לא רלוונטי”
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.emptyStateBtn, styles.emptyStateBtnPrimary]}
                  onPress={() => onRefresh({ resetIncludePassed: true })}
                  accessibilityRole="button"
                  accessibilityLabel="רענון שותפים"
                >
                  <RefreshCw size={16} color="#FFFFFF" />
                  <Text style={[styles.emptyStateBtnText, styles.emptyStateBtnTextPrimary]}>רענן</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : isDeckExhausted ? (
          <View style={[styles.cardStack, { height: swipeCardHeight, justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.endOfDeckCard}>
              <LinearGradient
                colors={['rgba(94,63,45,0.18)', 'rgba(94,63,45,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.endOfDeckIconWrap}
              >
                <Users size={34} color="#5e3f2d" />
              </LinearGradient>
              <Text style={styles.endOfDeckTitle}>אין יותר שותפים להציג</Text>
              <Text style={styles.endOfDeckSubtitle}>
                זה הכול לעכשיו — אפשר לרענן כדי לבדוק אם נוספו התאמות חדשות.
              </Text>
              <View style={styles.endOfDeckActions}>
                {!includePassed ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.endOfDeckBtn, styles.endOfDeckBtnSecondary]}
                    onPress={() => {
                      const enable = () => {
                        setIncludePassed(true);
                        // Reload the deck including NOT_RELEVANT profiles
                        fetchUsersAndGroups({ includePassed: true });
                      };
                      if (Platform.OS === 'web') {
                        enable();
                        return;
                      }
                      Alert.alert(
                        'להציג שותפים שסימנת כלא רלוונטיים?',
                        'נוכל להציג שוב גם שותפים שסימנת בהחלקה שמאלה. תמיד אפשר לסמן שוב כלא רלוונטי.',
                        [{ text: 'ביטול', style: 'cancel' }, { text: 'כן, הצג שוב', onPress: enable }],
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="הצג שוב שותפים שסימנתי כלא רלוונטיים"
                  >
                    <Text style={[styles.endOfDeckBtnText, styles.endOfDeckBtnTextSecondary]}>
                      הצג שוב “לא רלוונטי”
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.endOfDeckBtn, styles.endOfDeckBtnPrimary]}
                  onPress={() => onRefresh({ resetIncludePassed: true })}
                  accessibilityRole="button"
                  accessibilityLabel="רענון שותפים"
                >
                  <RefreshCw size={16} color="#FFFFFF" />
                  <Text style={[styles.endOfDeckBtnText, styles.endOfDeckBtnTextPrimary]}>רענן</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View>
            <View style={[styles.cardStack, { height: swipeCardHeight }]}>
              {items[currentIndex + 1] ? (
                <Animated.View pointerEvents="none" style={[styles.behindCard, behindCardAnimatedStyle]}>
                  {renderBrowseItem(items[currentIndex + 1])}
                </Animated.View>
              ) : null}

              <GestureDetector gesture={swipeGesture}>
                <Animated.View style={[styles.animatedCard, cardAnimatedStyle]}>
                  {renderBrowseItem(items[currentIndex])}

                  {/* Right swipe (LIKE) overlay */}
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.swipeOverlay, styles.likeOverlay, likeOverlayAnimatedStyle]}
                  >
                    <View style={styles.swipeOverlayIconWrap}>
                      <Heart size={64} color="#FFFFFF" fill="#FFFFFF" />
                    </View>
                  </Animated.View>

                  {/* Left swipe (PASS) overlay */}
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.swipeOverlay, styles.passOverlay, passOverlayAnimatedStyle]}
                  >
                    <View style={styles.swipeOverlayIconWrap}>
                      <X size={64} color="#FFFFFF" />
                    </View>
                  </Animated.View>
                </Animated.View>
              </GestureDetector>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom buttons – consistent spacing across devices */}
      {items.length && !isDeckExhausted && !isDetailsOpen ? (
        <View style={[styles.bottomActions, { bottom: actionsBottom }]} pointerEvents="box-none">
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.actionBtn, styles.actionBtnDanger]}
              accessibilityRole="button"
              accessibilityLabel="לא מתאים"
              onPress={() => triggerSwipe('pass')}
            >
              <X size={26} color="#EF4444" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.actionBtn, styles.actionBtnShare]}
              accessibilityRole="button"
              accessibilityLabel="שיתוף פרופיל"
              onPress={onShareProfile}
            >
              <Share2 size={22} color="#111827" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.actionBtn, styles.actionBtnLike]}
              accessibilityRole="button"
              accessibilityLabel="אהבתי"
              onPress={() => triggerSwipe('like')}
            >
              <Heart size={26} color={colors.success} fill={colors.success} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <KeyFabPanel
        isOpen={isFiltersOpen}
        onClose={closeFilters}
        title="סינון תוצאות"
        subtitle=""
        anchor="bottom"
        bottomOffset={Math.max(18, insets.bottom + 16)}
        openedWidth={Math.min(screenWidth * 0.94, 520)}
        panelStyle={{
          backgroundColor: 'rgba(255,255,255,0.90)',
          borderColor: 'rgba(229,231,235,0.9)',
          maxHeight: Math.round(screenHeight * 0.88),
        }}
        duration={420}
      >
        <View style={styles.filtersPanelWrap}>
          <ScrollView
            style={styles.filterScroll}
            contentContainerStyle={[
              styles.filterScrollContent,
              // Keep bottom actions reachable when content grows (e.g., many city chips)
              { paddingBottom: Math.max(18, insets.bottom + 24) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
                {/* Profile type */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>סוג פרופיל</Text>
                  <View style={styles.segmentWrap}>
                    <View
                      pointerEvents="none"
                      style={[
                        styles.segmentIndicator,
                        {
                          right:
                            `${(
                              [{ key: 'singles' }, { key: 'groups' }, { key: 'all' }]
                                .findIndex((o: any) => o.key === profileType)
                              * 33.3333
                            ).toFixed(4)}%`,
                        } as any,
                      ]}
                    />
                    {[
                      { key: 'singles', label: 'בודדים' },
                      { key: 'groups', label: 'קבוצות' },
                      { key: 'all', label: 'כולם' },
                    ].map((opt: any) => {
                      const active = profileType === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          activeOpacity={0.9}
                          style={styles.segmentBtn}
                          onPress={() => setProfileType(opt.key)}
                        >
                          <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Age */}
                <View style={styles.filterSection}>
                  <View style={styles.sectionRow}>
                    <Text style={styles.filterLabel}>טווח גילאים</Text>
                    <View style={styles.ageValuePill}>
                      <Text style={styles.ageValueText}>
                        {`${Math.min(ageMin, ageMax)} - ${Math.max(ageMin, ageMax)}`}
                      </Text>
                    </View>
                  </View>
                  <AgeRangeSlider
                    min={18}
                    max={41}
                    valueMin={Math.min(ageMin, ageMax)}
                    valueMax={Math.max(ageMin, ageMax)}
                    onChange={(minV, maxV) => {
                      setAgeMin(minV);
                      setAgeMax(maxV);
                      setAgeActive(true);
                    }}
                  />
                </View>

                {/* City */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>עיר</Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.dropdownField}
                    onPress={() => setIsCityPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="בחירת ערים"
                  >
                    <ChevronDown size={18} color="#9CA3AF" />
                    <Text style={styles.dropdownText} numberOfLines={1}>
                      {selectedCityLabel}
                    </Text>
                  </TouchableOpacity>

                  {selectedCities.length > 0 && !isAllCitiesSelected ? (
                    <View style={[styles.cityChipsWrap, { marginTop: 10 }]} accessibilityLabel="ערים נבחרות">
                      {selectedCities.map((c) => (
                        <TouchableOpacity
                          key={`city-chip-${c}`}
                          activeOpacity={0.9}
                          style={[styles.cityChip, styles.cityChipActive]}
                          accessibilityRole="button"
                          accessibilityLabel={`הסר ${c}`}
                          onPress={() => {
                            prevCitiesBeforeAllRef.current = null;
                            setSelectedCities((prev) => prev.filter((x) => x !== c));
                          }}
                        >
                          <X size={14} color="#4F46E5" />
                          <Text style={[styles.cityChipText, styles.cityChipTextActive]} numberOfLines={1}>
                            {c}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>

                {/* Neighborhood */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>שכונה</Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.dropdownField}
                    onPress={() => setIsNeighborhoodPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="בחירת שכונה"
                  >
                    <ChevronDown size={18} color="#9CA3AF" />
                    <Text style={styles.dropdownText} numberOfLines={1}>
                      {selectedNeighborhoodLabel}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Gender (singles) */}
                {profileType !== 'groups' ? (
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>מגדר (משתמשים בודדים)</Text>
                    <View style={styles.pillRow}>
                      {[
                        { key: 'female', label: 'נשים' },
                        { key: 'male', label: 'גברים' },
                        { key: 'any', label: 'כולם' },
                      ].map((g: any) => {
                        const active = gender === g.key;
                        return (
                          <TouchableOpacity
                            key={g.key}
                            activeOpacity={0.9}
                            style={[styles.pillBtn, active ? styles.pillBtnActive : styles.pillBtnInactive]}
                            onPress={() => setGender(g.key)}
                          >
                            <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                              {g.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {/* Groups filters */}
                {profileType === 'groups' ? (
                  <>
                    <View style={styles.filterSection}>
                      <Text style={styles.filterLabel}>מגדר (קבוצות)</Text>
                      <View style={styles.pillRow}>
                        {[
                          { key: 'female', label: 'רק בנות' },
                          { key: 'male', label: 'רק בנים' },
                          { key: 'any', label: 'כולם' },
                        ].map((g: any) => {
                          const active = groupGender === g.key;
                          return (
                            <TouchableOpacity
                              key={g.key}
                              activeOpacity={0.9}
                              style={[styles.pillBtn, active ? styles.pillBtnActive : styles.pillBtnInactive]}
                              onPress={() => setGroupGender(g.key)}
                            >
                              <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                                {g.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.filterSection}>
                      <Text style={styles.filterLabel}>מספר שותפים בקבוצה</Text>
                      <View style={styles.pillRow}>
                        {(['any', 2, 3] as any[]).map((sz) => {
                          const active = groupSize === sz;
                          return (
                            <TouchableOpacity
                              key={String(sz)}
                              activeOpacity={0.9}
                              style={[styles.pillBtn, active ? styles.pillBtnActive : styles.pillBtnInactive]}
                              onPress={() => setGroupSize(sz as any)}
                            >
                              <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                                {sz === 'any' ? 'הכל' : String(sz)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </>
                ) : null}

                {/* Actions (inside scroll to avoid being clipped on smaller heights) */}
                <View style={styles.filterFooter}>
                  <View style={styles.filterActions}>
                    <TouchableOpacity
                      style={[styles.filterBtn, styles.resetBtn]}
                      activeOpacity={0.9}
                      onPress={() => {
                        setGender('any');
                        setAgeMin(20);
                        setAgeMax(40);
                        setAgeActive(false);
                        setProfileType('all');
                        setGroupGender('any');
                        setGroupSize('any');
                        setSelectedCities([]);
                        setCitySearch('');
                        setIsCityPickerOpen(false);
                        setSelectedNeighborhoods([]);
                        setNeighborhoodSearch('');
                        setIsNeighborhoodPickerOpen(false);
                        prevCitiesBeforeAllRef.current = null;
                        setIncludePassed(false);
                      }}
                    >
                      <Text style={styles.resetText}>איפוס</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.filterBtn, styles.applyBtn]}
                      activeOpacity={0.9}
                      onPress={() => {
                        closeFilters();
                        fetchUsersAndGroups();
                      }}
                    >
                      <Text style={styles.applyText}>הצג תוצאות</Text>
                    </TouchableOpacity>
                  </View>
                </View>
          </ScrollView>

          {isCityPickerOpen ? (
            <View style={styles.cityPickerOverlay}>
              <TouchableOpacity
                style={styles.cityPickerBackdrop}
                activeOpacity={1}
                onPress={() => {
                  setIsCityPickerOpen(false);
                  setCitySearch('');
                }}
              />
              <View style={styles.cityPickerPanel}>
                <View style={styles.cityPickerHeader}>
                  <Text style={styles.cityPickerTitle}>בחר ערים</Text>
                  <TouchableOpacity
                    style={styles.cityPickerCloseBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      setIsCityPickerOpen(false);
                      setCitySearch('');
                    }}
                  >
                    <X size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.searchWrap}>
                  <TextInput
                    value={citySearch}
                    onChangeText={setCitySearch}
                    placeholder="חפש עיר..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.searchInput}
                  />
                  <View style={styles.searchIcon}>
                    <Search size={18} color="#9CA3AF" />
                  </View>
                </View>

                <ScrollView style={{ maxHeight: Math.min(320, Math.round(screenHeight * 0.42)) }} showsVerticalScrollIndicator={false}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[
                      styles.cityPickerRow,
                      isAllCitiesSelected ? styles.cityPickerRowActive : null,
                    ]}
                    onPress={() => {
                      // Toggle "all":
                      // - First press: select all cities
                      // - Second press: restore the previous selection (or none)
                      if (isAllCitiesSelected) {
                        setSelectedCities(prevCitiesBeforeAllRef.current ?? []);
                        prevCitiesBeforeAllRef.current = null;
                      } else {
                        prevCitiesBeforeAllRef.current = selectedCities;
                        // Selecting "all" should explicitly select all cities (but behaves like "no filter").
                        setSelectedCities(allCities);
                      }
                    }}
                  >
                    <Text style={[styles.cityPickerRowText, isAllCitiesSelected ? styles.cityPickerRowTextActive : null]}>
                      הכל
                    </Text>
                  </TouchableOpacity>
                  {filteredCityOptions.map((c) => {
                    const active = isAllCitiesSelected || selectedCities.includes(c);
                    return (
                      <TouchableOpacity
                        key={c}
                        activeOpacity={0.9}
                        style={[styles.cityPickerRow, active ? styles.cityPickerRowActive : null]}
                        onPress={() => {
                          prevCitiesBeforeAllRef.current = null;
                          setSelectedCities((prev) => {
                            // If "all" was selected, start a new explicit selection.
                            if (isAllCitiesSelected) return [c];
                            const next = new Set(prev);
                            if (next.has(c)) next.delete(c);
                            else next.add(c);
                            return Array.from(next);
                          });
                          prevCitiesBeforeAllRef.current = null;
                        }}
                      >
                        <Text style={[styles.cityPickerRowText, active ? styles.cityPickerRowTextActive : null]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          ) : null}

          {isNeighborhoodPickerOpen ? (
            <View style={styles.cityPickerOverlay}>
              <TouchableOpacity
                style={styles.cityPickerBackdrop}
                activeOpacity={1}
                onPress={() => {
                  setIsNeighborhoodPickerOpen(false);
                  setNeighborhoodSearch('');
                }}
              />
              <View style={styles.cityPickerPanel}>
                <View style={styles.cityPickerHeader}>
                  <Text style={styles.cityPickerTitle}>בחר שכונה</Text>
                  <TouchableOpacity
                    style={styles.cityPickerCloseBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      setIsNeighborhoodPickerOpen(false);
                      setNeighborhoodSearch('');
                    }}
                  >
                    <X size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.searchWrap}>
                  <TextInput
                    value={neighborhoodSearch}
                    onChangeText={setNeighborhoodSearch}
                    placeholder="חפש שכונה..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.searchInput}
                  />
                  <View style={styles.searchIcon}>
                    <Search size={18} color="#9CA3AF" />
                  </View>
                </View>

                <ScrollView style={{ maxHeight: Math.min(320, Math.round(screenHeight * 0.42)) }} showsVerticalScrollIndicator={false}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[
                      styles.cityPickerRow,
                      selectedNeighborhoods.length === 0 ? styles.cityPickerRowActive : null,
                    ]}
                    onPress={() => {
                      setSelectedNeighborhoods([]);
                    }}
                  >
                    <Text
                      style={[
                        styles.cityPickerRowText,
                        selectedNeighborhoods.length === 0 ? styles.cityPickerRowTextActive : null,
                      ]}
                    >
                      הכל
                    </Text>
                  </TouchableOpacity>
                  {filteredNeighborhoodOptions.map((n) => {
                    const active = selectedNeighborhoods.includes(n);
                    return (
                      <TouchableOpacity
                        key={`hood-${n}`}
                        activeOpacity={0.9}
                        style={[styles.cityPickerRow, active ? styles.cityPickerRowActive : null]}
                        onPress={() => {
                          setSelectedNeighborhoods((prev) => {
                            const next = new Set(prev);
                            if (next.has(n)) next.delete(n);
                            else next.add(n);
                            return Array.from(next);
                          });
                        }}
                      >
                        <Text style={[styles.cityPickerRowText, active ? styles.cityPickerRowTextActive : null]}>
                          {n}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </View>
      </KeyFabPanel>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerArea: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'right',
  },
  headerSubtitle: {
    color: '#9DA4AE',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'right',
  },
  listContent: {
    padding: 16,
  },
  cardStack: {
    position: 'relative',
  },
  behindCard: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    borderRadius: SWIPE_CARD_RADIUS,
    overflow: 'hidden',
  },
  animatedCard: {
    zIndex: 2,
    borderRadius: SWIPE_CARD_RADIUS,
    overflow: 'hidden',
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    borderRadius: SWIPE_CARD_RADIUS,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeOverlayIconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  likeOverlay: {
    backgroundColor: 'rgba(94,63,45,0.42)',
  },
  passOverlay: {
    backgroundColor: 'rgba(239,68,68,0.35)',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9DA4AE',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyStateCard: {
    width: '100%',
    borderRadius: SWIPE_CARD_RADIUS,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  emptyStateIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.22)',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  emptyStateActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyStateBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyStateBtnPrimary: {
    backgroundColor: '#5e3f2d',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
  },
  emptyStateBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
  },
  emptyStateBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  emptyStateBtnTextPrimary: {
    color: '#FFFFFF',
  },
  emptyStateBtnTextSecondary: {
    color: '#111827',
  },
  endOfDeckCard: {
    width: '100%',
    borderRadius: SWIPE_CARD_RADIUS,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  endOfDeckIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.22)',
  },
  endOfDeckTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  endOfDeckSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  endOfDeckActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  endOfDeckBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  endOfDeckBtnPrimary: {
    backgroundColor: '#5e3f2d',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
  },
  endOfDeckBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
  },
  endOfDeckBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  endOfDeckBtnTextPrimary: {
    color: '#FFFFFF',
  },
  endOfDeckBtnTextSecondary: {
    color: '#111827',
  },
  bottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
    alignItems: 'center',
  },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  actionBtnDanger: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
  },
  actionBtnLike: {
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.22)',
  },
  actionBtnShare: {
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowOpacity: 0.10,
    elevation: 10,
  },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 10,
  },
  filterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 999,
  },
  filterSheet: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.60)',
    paddingBottom: 18,
    zIndex: 1000,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  filterHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,231,235,0.65)',
  },
  filterHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,244,246,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
  },
  filterHeaderTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  filterScroll: {
    flex: 1,
  },
  filtersPanelWrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  filterScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 18 as any,
  },
  filterSection: {
    marginBottom: 0,
  },
  filterLabel: {
    color: '#6B7280',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'right',
  },
  dropdownField: {
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dropdownText: {
    flex: 1,
    marginRight: 10,
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  cityPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    justifyContent: 'flex-end',
  },
  cityPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cityPickerPanel: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  cityPickerHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cityPickerTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  cityPickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,244,246,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
  },
  cityPickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.8)',
    backgroundColor: 'rgba(243,244,246,0.6)',
    marginBottom: 8,
  },
  cityPickerRowActive: {
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderColor: 'rgba(79,70,229,0.22)',
  },
  cityPickerRowText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  cityPickerRowTextActive: {
    color: '#4F46E5',
    fontWeight: '900',
  },
  sectionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ageValuePill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ageValueText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    writingDirection: 'ltr',
  },
  rangeWrap: {
    gap: 10 as any,
  },
  rangeTrackWrap: {
    height: 34,
    justifyContent: 'center',
    position: 'relative',
  },
  rangeTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,231,235,0.95)',
  },
  rangeTrackActive: {
    position: 'absolute',
    height: 6,
    borderRadius: 999,
    backgroundColor: '#4F46E5',
  },
  rangeThumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4F46E5',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    zIndex: 10,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
        } as any)
      : null),
  },
  rangeLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeLabelText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentWrap: {
    position: 'relative',
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(243,244,246,0.95)',
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '33.3333%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  segmentBtn: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  segmentText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#111827',
    fontWeight: '900',
  },
  searchWrap: {
    position: 'relative',
  },
  searchInput: {
    height: 46,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingRight: 44,
    textAlign: 'right',
    color: '#111827',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  searchIcon: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  cityChipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8 as any,
    marginTop: 10,
    marginBottom: 10,
  },
  cityHintPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(243,244,246,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
  },
  cityHintText: {
    color: '#6B7280',
    fontWeight: '800',
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8 as any,
  },
  cityChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6 as any,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  cityChipActive: {
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderColor: 'rgba(79,70,229,0.18)',
  },
  cityChipInactive: {
    backgroundColor: 'rgba(243,244,246,0.85)',
    borderColor: 'rgba(229,231,235,0.9)',
  },
  cityChipText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  cityChipTextActive: {
    color: '#4F46E5',
  },
  cityChipTextInactive: {
    color: '#6B7280',
  },
  pillRow: {
    flexDirection: 'row-reverse',
    gap: 10 as any,
  },
  pillBtn: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  pillBtnActive: {
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderColor: '#4F46E5',
  },
  pillBtnInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(229,231,235,0.9)',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '900',
  },
  pillTextActive: {
    color: '#4F46E5',
  },
  pillTextInactive: {
    color: '#6B7280',
  },
  ageRow: {
    flexDirection: 'row-reverse',
    gap: 12 as any,
  },
  ageInputWrap: {
    flex: 1,
  },
  ageLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'right',
  },
  ageInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    paddingHorizontal: 12,
    textAlign: 'right',
  },
  filterFooter: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(229,231,235,0.65)',
  },
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  filterBtn: {
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flex: 1,
  },
  resetBtn: {
    backgroundColor: 'rgba(243,244,246,0.95)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
  },
  applyBtn: {
    backgroundColor: 'rgba(229,231,235,0.95)',
    marginLeft: 8,
    flex: 2,
    borderWidth: 1,
    borderColor: 'rgba(209,213,219,0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  resetText: {
    color: '#6B7280',
    fontWeight: '900',
    textAlign: 'center',
  },
  applyText: {
    color: '#374151',
    fontWeight: '900',
    textAlign: 'center',
  },
});

function GroupCard({
  groupId,
  users,
  apartment,
  matchScores,
  onOpen,
  onPreviewGroup,
  onLike,
  onPass,
  onOpenApartment,
  style,
  mediaHeight,
}: {
  groupId: string;
  users: User[];
  apartment?: Apartment;
  matchScores?: Record<string, number | null>;
  onOpen: (id: string) => void;
  onPreviewGroup?: (users: User[]) => void;
  onLike: (groupId: string, users: User[]) => void;
  onPass: (groupId: string, users: User[]) => void;
  onOpenApartment: (apartmentId: string) => void;
  style?: ViewStyle;
  mediaHeight?: number;
}) {
  const didLongPressRef = useRef(false);
  const displayUsers = users.slice(0, 4);
  const extra = users.length - displayUsers.length;
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const isOneRowLayout = displayUsers.length === 3 || displayUsers.length === 4;
  const resolvedMediaHeight =
    typeof mediaHeight === 'number' && Number.isFinite(mediaHeight) ? mediaHeight : DEFAULT_SWIPE_CARD_MEDIA_HEIGHT;
  const formatMatchPercent = (value: number | null | undefined) =>
    value === null || value === undefined ? '--%' : `${value}%`;

  return (
    <View style={[groupStyles.card, style]}>
      <View style={groupStyles.gridWrap}>
        {displayUsers.map((u, idx) => {
          const rows = isOneRowLayout ? 1 : Math.ceil(displayUsers.length / 2);
          const cellHeight = rows === 1 ? resolvedMediaHeight : resolvedMediaHeight / 2;
          const isLastWithExtra = idx === displayUsers.length - 1 && extra > 0;
          const matchPercent = matchScores?.[u.id] ?? null;
          return (
            <TouchableOpacity
              key={u.id}
              activeOpacity={0.9}
              onPress={() => {
                if (didLongPressRef.current) {
                  didLongPressRef.current = false;
                  return;
                }
                onOpen(u.id);
              }}
              delayLongPress={350}
              onLongPress={() => {
                didLongPressRef.current = true;
                onPreviewGroup?.(users);
              }}
              style={[
                groupStyles.cell,
                {
                  height: cellHeight,
                  width: (isOneRowLayout ? `${(100 / displayUsers.length).toFixed(4)}%` : '50%') as any,
                },
                isOneRowLayout && idx === displayUsers.length - 1 ? { borderRightWidth: 0 } : null,
              ]}
            >
              <View style={groupStyles.cellImageWrap}>
                {u.avatar_url ? (
                  <Image
                    source={{ uri: u.avatar_url || DEFAULT_AVATAR }}
                    style={groupStyles.cellImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={groupStyles.cellPlaceholder}>
                    <UserIcon size={56} color="#9CA3AF" />
                    <Text style={groupStyles.cellPlaceholderText} numberOfLines={2}>
                      למשתמש זה אין תמונות עדיין
                    </Text>
                  </View>
                )}
                <MatchPercentBadge
                  value={matchPercent}
                  triggerKey={`${groupId}-${u.id}`}
                  size={58}
                  style={[groupStyles.matchBadge, groupStyles.matchBadgeLarge]}
                />
                <View style={groupStyles.cellBottomOverlay}>
                  <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={groupStyles.cellBottomOverlayGradient}
                  />
                  <View style={groupStyles.cellBottomOverlayContent}>
                    {!!u.full_name ? (
                      <Text style={groupStyles.cellOverlayName} numberOfLines={1}>
                        {u.full_name}
                      </Text>
                    ) : null}
                    {!!u.age ? <Text style={groupStyles.cellOverlayAge}>{u.age}</Text> : null}
                    {!!u.bio ? (
                      <Text style={groupStyles.cellOverlayBio} numberOfLines={1}>
                        {u.bio}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {isLastWithExtra ? (
                  <View style={groupStyles.extraOverlay}>
                    <Text style={groupStyles.extraOverlayText}>+{extra}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary under grid removed — details shown on image overlay */}

      {/* Bottom action buttons removed — swipe to like/pass */}
    </View>
  );
}

const groupStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  cell: {
    width: '50%',
    position: 'relative',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  cellImageWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  cellPlaceholderText: {
    marginTop: 8,
    paddingHorizontal: 10,
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  cellBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  cellBottomOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cellBottomOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  cellOverlayName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  cellOverlayAge: {
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 1,
    textAlign: 'right',
  },
  cellOverlayBio: {
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'right',
  },
  matchBadge: {
    position: 'absolute',
    zIndex: 3,
  },
  matchBadgeLarge: {
    top: 12,
    right: 12,
  },
  matchBadgeSmall: {
    bottom: -6,
    right: -6,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  extraOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15,15,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraOverlayText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },
  membersSection: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  memberRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12 as any,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  memberAvatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    position: 'relative',
  },
  memberAvatar: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameAge: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
  },
  memberCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  memberCityText: {
    color: '#111827',
    fontSize: 13,
  },
  memberBio: {
    color: '#111827',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  circleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  passBtn: {
    borderColor: 'rgba(244,63,94,0.6)',
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  likeBtn: {
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  apartmentSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  apartmentTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'right',
  },
  apartmentCardContainer: {
    width: '100%',
  },
  apartmentCardCompact: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  apartmentImage: {
    width: 120,
    height: 100,
    backgroundColor: '#F3F4F6',
  },
  apartmentDetails: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  apartmentCardTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'right',
  },
  apartmentLocation: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  apartmentLocationText: {
    color: '#111827',
    fontSize: 13,
    textAlign: 'right',
  },
  apartmentPrice: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
  },
  apartmentPriceAmount: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  apartmentPriceUnit: {
    color: '#9DA4AE',
    fontSize: 12,
    marginLeft: 4,
    textAlign: 'right',
  },
});
