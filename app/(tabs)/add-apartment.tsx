import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import MapboxMap from '@/components/MapboxMap';
import type { MapboxFeatureCollection } from '@/lib/mapboxHtml';
import { autocompleteMapbox, reverseGeocodeMapbox, type MapboxGeocodingFeature } from '@/lib/mapboxAutocomplete';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatePresence, MotiText, MotiView } from 'moti';
import { Easing as ReanimatedEasing } from 'react-native-reanimated';
import { KeyFabPanel } from '@/components/KeyFabPanel';
import { getNeighborhoodsForCityName } from '@/lib/neighborhoods';
import type { Apartment } from '@/types/database';
import {
  Accessibility,
  Check,
  Snowflake,
  Fence,
  Sun,
  Sofa,
  Shield,
  Hammer,
  PawPrint,
  ArrowUpDown,
  Bed,
  Bath,
  Home,
  Info,
  Utensils,
  Users,
  Camera,
  MapPin,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Building2,
  Layers,
  Ruler,
  Trees,
} from 'lucide-react-native';

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

const { width: _screenW, height: _screenH } = Dimensions.get('window');
const _brandGreen = '#22C55E';
const _successDuration = 650;
const _successNavDelayMs = 2800;


type UpsertMode = 'create' | 'edit';

export default function AddApartmentScreen(props?: { mode?: UpsertMode; apartmentId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const addApartment = useApartmentStore((state) => state.addApartment);
  const updateApartment = useApartmentStore((state) => state.updateApartment);
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;
  const mapboxStyleUrl = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL as string | undefined;
  const insets = useSafeAreaInsets();
  const datePickerBottomOffset = useMemo(() => 92 + (insets.bottom || 0) + 14, [insets.bottom]);
  const moveInMonthOptions = useMemo(() => {
    // Month+year picker options (e.g. "ינואר 2026").
    // Show the next 48 months from the current month.
    const start = startOfToday();
    start.setDate(1);
    const out: Array<{ key: string; label: string; date: Date }> = [];
    for (let i = 0; i < 48; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      d.setHours(0, 0, 0, 0);
      out.push({ key: toISODateString(d), label: formatHebMonthYear(d), date: d });
    }
    return out;
  }, []);
  const screenWidth = Dimensions.get('window').width;
  const previewGalleryRef = useRef<ScrollView>(null);
  const [previewActiveIdx, setPreviewActiveIdx] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inferredMode: UpsertMode =
    props?.mode ?? (typeof pathname === 'string' && pathname.includes('/apartment/edit') ? 'edit' : 'create');

  const routeIdRaw = (params as any)?.id;
  const routeId = Array.isArray(routeIdRaw) ? routeIdRaw[0] : routeIdRaw;

  const mode: UpsertMode = inferredMode;
  const editingApartmentId =
    mode === 'edit' ? String(props?.apartmentId || routeId || '') : '';

  // This screen should be fullscreen (no bottom tabs). If we somehow landed in the tabs group,
  // immediately forward to the standalone route.
  useEffect(() => {
    if (mode === 'create' && pathname === '/(tabs)/add-apartment') {
      router.replace('/add-apartment' as any);
    }
  }, [pathname, router, mode]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  // Guard: each user can upload max 1 apartment. If already owns one, block entry.
  useEffect(() => {
    if (mode !== 'create') return;
    let cancelled = false;
    const checkLimit = async () => {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('apartments')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1);
        if (cancelled) return;
        if (error) throw error;
        if (data && data.length > 0) {
          Alert.alert(
            'לא ניתן להוסיף דירה',
            'אי אפשר להעלות עוד דירה כי כבר העלית דירה אחת.'
          );
          router.replace('/(tabs)/home');
        }
      } catch {
        // If we fail to verify, don't block the whole screen automatically.
        // The submit handler will re-check and prevent extra uploads safely.
      }
    };
    checkLimit();
    return () => {
      cancelled = true;
    };
  }, [user?.id, router, mode]);

  const TOTAL_STEPS = 3 as const;
  type Step = 1 | 2 | 3;
  const STEP_LABELS = ['בסיסי', 'מאפיינים', 'סיכום'] as const;
  const [step, setStep] = useState<Step>(1);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState(''); // used as "rooms" count in UI
  const [bathrooms, setBathrooms] = useState('');
  const [images, setImages] = useState<string[]>([]); // local URIs before upload
  const [moveInDate, setMoveInDate] = useState(''); // Month+year label (display only)
  const [moveInDateObj, setMoveInDateObj] = useState<Date | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [sizeSqm, setSizeSqm] = useState(''); // apartment size in square meters (digits)
  const [gardenSizeSqm, setGardenSizeSqm] = useState(''); // garden size in square meters (digits) - only for garden apartments
  const [floor, setFloor] = useState<number>(0);
  const [propertyType, setPropertyType] = useState<'building' | 'garden'>('building');
  const [propertyTypeSegmentWidth, setPropertyTypeSegmentWidth] = useState(0);
  const propertyTypeThumbX = useRef(new Animated.Value(0)).current;
  const didMeasurePropertyTypeSegment = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<MapboxGeocodingFeature[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<MapboxGeocodingFeature[]>([]);
  const [isNeighborhoodPickerOpen, setIsNeighborhoodPickerOpen] = useState(false);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');
  const [selectedGeo, setSelectedGeo] = useState<{ lng: number; lat: number } | null>(null);
  const [isResolvingNeighborhood, setIsResolvingNeighborhood] = useState(false);
  const [selectedCity, setSelectedCity] = useState<{
    name: string;
    center?: { lng: number; lat: number };
    bbox?: [number, number, number, number];
  } | null>(null);
  const [includeAsPartner, setIncludeAsPartner] = useState(false);
  const [roommateCapacity, setRoommateCapacity] = useState<number | null>(null);
  const roommateCapacityOptions = [2, 3, 4, 5];
  const [existingPartnerIds, setExistingPartnerIds] = useState<string[]>([]);

  // Property features (מאפייני הנכס)
  const [hasBalcony, setHasBalcony] = useState(false);
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false);
  const [hasAirConditioning, setHasAirConditioning] = useState(false);
  const [hasBars, setHasBars] = useState(false);
  const [hasSolarHeater, setHasSolarHeater] = useState(false);
  const [isFurnished, setIsFurnished] = useState(false);
  const [hasSafeRoom, setHasSafeRoom] = useState(false);
  const [isRenovated, setIsRenovated] = useState(false);
  const [petsAllowed, setPetsAllowed] = useState(false);
  const [hasElevator, setHasElevator] = useState(false);
  const [kosherKitchen, setKosherKitchen] = useState(false);

  const generateJoinPasscode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = city.trim();
      if (!mapboxToken) {
        if (active) setCitySuggestions([]);
        return;
      }
      if (!q || q.length < 1) {
        if (active) setCitySuggestions([]);
        return;
      }
      const t = setTimeout(async () => {
        const results = await autocompleteMapbox({
          accessToken: mapboxToken,
          query: q,
          country: 'il',
          language: 'he',
          limit: 8,
          types: 'place,locality',
        });
        if (active) setCitySuggestions(results);
      }, 250);
      return () => clearTimeout(t);
    };
    let cleanup: undefined | (() => void);
    (async () => {
      cleanup = await run();
    })();
    return () => {
      active = false;
      cleanup?.();
    };
  }, [city, mapboxToken]);

  // If user edits the city after selecting a city, invalidate the selection (so address search won't be "wrong city")
  useEffect(() => {
    const c = city.trim();
    if (!selectedCity) return;
    if (c && c === selectedCity.name) return;
    // user changed city text -> require re-selecting city from suggestions
    setSelectedCity(null);
    setSelectedGeo(null);
    setAddress('');
    setNeighborhood('');
    setAddressSuggestions([]);
  }, [city]); // intentionally not depending on selectedCity to keep logic simple

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = address.trim();
      if (!mapboxToken) {
        if (active) setAddressSuggestions([]);
        return;
      }
      if (!q || q.length < 2) {
        if (active) setAddressSuggestions([]);
        return;
      }
      const cityPart = city.trim();
      const query = cityPart ? `${q}, ${cityPart}` : q;
      const t = setTimeout(async () => {
        const results = await autocompleteMapbox({
          accessToken: mapboxToken,
          query,
          country: 'il',
          language: 'he',
          limit: 8,
          types: 'address',
        });
        if (active) setAddressSuggestions(results);
      }, 320);
      return () => clearTimeout(t);
    };
    let cleanup: undefined | (() => void);
    (async () => {
      cleanup = await run();
    })();
    return () => {
      active = false;
      cleanup?.();
    };
  }, [address, city, mapboxToken]);

  // EDIT MODE: load apartment and hydrate the same form UI.
  useEffect(() => {
    if (mode !== 'edit') return;
    if (!editingApartmentId) return;

    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError('');
      try {
        const { data: userResp } = await supabase.auth.getUser();
        const authUser = user ?? userResp.user ?? null;
        if (!authUser?.id) throw new Error('יש להתחבר כדי לערוך דירה');

        const { data: apt, error: aptErr } = await supabase
          .from('apartments')
          .select('*')
          .eq('id', editingApartmentId)
          .maybeSingle();
        if (aptErr) throw aptErr;
        if (!apt) throw new Error('הדירה לא נמצאה');
        if (apt.owner_id !== authUser.id) throw new Error('אין לך הרשאה לערוך דירה זו');

        if (cancelled) return;
        const a = apt as Apartment;

        setTitle(a.title || '');
        setDescription(a.description || '');
        setAddress(a.address || '');
        setCity(a.city || '');
        setNeighborhood(a.neighborhood || '');
        setPrice(String(a.price ?? ''));
        setBedrooms(String(a.bedrooms ?? ''));
        setBathrooms(String(a.bathrooms ?? ''));

        const aptType = (a as any)?.apartment_type as Apartment['apartment_type'] | undefined;
        setPropertyType(aptType === 'GARDEN' ? 'garden' : 'building');

        const sqm = (a as any)?.square_meters;
        setSizeSqm(typeof sqm === 'number' && sqm > 0 ? String(Math.round(sqm)) : '');

        const gardenSqm = (a as any)?.garden_square_meters;
        setGardenSizeSqm(typeof gardenSqm === 'number' && gardenSqm > 0 ? String(Math.round(gardenSqm)) : '');

        const fl = (a as any)?.floor;
        setFloor(typeof fl === 'number' && Number.isFinite(fl) ? fl : 0);

        const cap = (a as any)?.roommate_capacity;
        setRoommateCapacity(typeof cap === 'number' && cap > 0 ? cap : null);

        // Property features
        const bc =
          typeof (a as any)?.balcony_count === 'number'
            ? Math.max(0, Math.min(3, (a as any).balcony_count as number))
            : 0;
        setHasBalcony(bc > 0);
        setWheelchairAccessible(!!(a as any)?.wheelchair_accessible);
        setHasAirConditioning(!!(a as any)?.has_air_conditioning);
        setHasBars(!!(a as any)?.has_bars);
        setHasSolarHeater(!!(a as any)?.has_solar_heater);
        setIsFurnished(!!(a as any)?.is_furnished);
        setHasSafeRoom(!!(a as any)?.has_safe_room);
        setIsRenovated(!!(a as any)?.is_renovated);
        setPetsAllowed(!!(a as any)?.pets_allowed);
        setHasElevator(!!(a as any)?.has_elevator);
        setKosherKitchen(!!(a as any)?.kosher_kitchen);

        // Move-in availability
        const iso = String((a as any)?.move_in_date || '').trim();
        if (iso) {
          const d = parseISODateToLocalDate(iso);
          if (d) {
            const monthStart = normalizeToMonthStart(d);
            setMoveInDateObj(monthStart);
            setMoveInDate(formatHebMonthYear(monthStart));
          }
        }

        const partnerIds = normalizeIds((a as any)?.partner_ids);
        setExistingPartnerIds(partnerIds);
        setIncludeAsPartner(partnerIds.includes(authUser.id));

        const existingUrls = [
          ...normalizeImagesValue((a as any)?.image_urls),
          ...(a as any)?.image_url ? [String((a as any).image_url)] : [],
        ].filter(Boolean);
        setImages(Array.from(new Set(existingUrls)));
      } catch (e: any) {
        Alert.alert('שגיאה', e?.message || 'טעינת הדירה נכשלה');
        router.back();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, editingApartmentId, user, router]);

  const closeOverlays = () => {
    setCitySuggestions([]);
    setAddressSuggestions([]);
    setIsNeighborhoodPickerOpen(false);
  };

  const normalizeIds = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        // ignore
      }
      return value
        .replace(/^{|}$/g, '')
        .split(',')
        .map((s) => s.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  };

  const normalizeImagesValue = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {
        // ignore
      }
      return value
        .replace(/^{|}$/g, '')
        .split(',')
        .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  };

  const isRemoteUrl = (uri: string) => /^https?:\/\//i.test(String(uri || ''));

  function ctxText(feature: MapboxGeocodingFeature, prefix: string): string {
    const ctx = feature?.context || [];
    const hit = ctx.find((c) => String(c?.id || '').startsWith(prefix));
    return String(hit?.text || '').trim();
  }

  function formatDDMMYYYY(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseISODateToLocalDate(iso: string): Date | null {
    const s = String(iso || '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toISODateString(d: Date): string {
    const yyyy = String(d.getFullYear()).padStart(4, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function resolveMoveInDateObj(candidate?: Date | null): Date {
    const min = startOfToday();
    const d = candidate instanceof Date ? candidate : min;
    return d < min ? min : d;
  }

  function formatHebMonthYear(d: Date): string {
    const m = HEB_MONTH_NAMES[d.getMonth()] ?? '';
    return `${m} ${d.getFullYear()}`.trim();
  }

  function normalizeToMonthStart(d: Date): Date {
    const out = new Date(d.getFullYear(), d.getMonth(), 1);
    out.setHours(0, 0, 0, 0);
    return out;
  }

  function digitsOnly(s: string): string {
    return String(s || '').replace(/\D+/g, '');
  }

  function formatWithCommas(rawDigits: string): string {
    const s = digitsOnly(rawDigits);
    if (!s) return '';
    // 4500 -> 4,500
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function normalizeForHMatch(s: string): string {
    return String(s || '')
      .trim()
      // normalize quotes + dashes + whitespace for loose matching
      .replace(/[״׳"'`´]/g, '')
      .replace(/[\u2010-\u2015\-]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function inferNeighborhoodFromPlaceName(placeName: string, cityName: string): string {
    const pn = String(placeName || '').trim();
    const city = String(cityName || '').trim();
    if (!pn || !city) return '';

    const known = getNeighborhoodsForCityName(city);
    if (!known || known.length === 0) return '';

    const normPlace = normalizeForHMatch(pn);
    for (const hood of known) {
      const h = String(hood || '').trim();
      if (!h) continue;
      if (normPlace.includes(normalizeForHMatch(h))) return h;
    }
    return '';
  }

  function inferNeighborhoodFromFeature(feature: MapboxGeocodingFeature, cityName: string): string {
    const city = String(cityName || '').trim();
    const fromContext =
      ctxText(feature, 'neighborhood.') ||
      ctxText(feature, 'locality.') ||
      ctxText(feature, 'district.') ||
      '';

    const cleaned = String(fromContext || '').trim();
    if (cleaned && (!city || normalizeForHMatch(cleaned) !== normalizeForHMatch(city))) {
      return cleaned;
    }

    // Fallback: attempt to match from place_name to a known neighborhood list for that city.
    return inferNeighborhoodFromPlaceName(feature?.place_name || '', city);
  }

  const neighborhoodReqIdRef = useRef(0);

  function ctxTextFromFeatures(features: MapboxGeocodingFeature[], prefix: string): string {
    for (const f of features || []) {
      const t = ctxText(f, prefix);
      if (t) return t;
    }
    return '';
  }

  const previewPoints = useMemo<MapboxFeatureCollection | undefined>(() => {
    if (!selectedGeo) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [selectedGeo.lng, selectedGeo.lat] },
          properties: { id: 'preview', title: 'מיקום הדירה' },
        },
      ],
    };
  }, [selectedGeo]);

  const neighborhoodOptions = useMemo(() => {
    const c = String(city || '').trim();
    if (!c) return [];
    try {
      return getNeighborhoodsForCityName(c);
    } catch {
      return [];
    }
  }, [city]);

  const filteredNeighborhoodOptions = useMemo(() => {
    const q = String(neighborhoodSearch || '').trim();
    if (!q) return neighborhoodOptions;
    return neighborhoodOptions.filter((n) => String(n || '').includes(q));
  }, [neighborhoodOptions, neighborhoodSearch]);

  const selectedFeatureLabels = useMemo(() => {
    const out: string[] = [];
    if (wheelchairAccessible) out.push('גישה לנכים');
    if (hasAirConditioning) out.push('מיזוג');
    if (hasBars) out.push('סורגים');
    if (hasSolarHeater) out.push('דוד שמש');
    if (isFurnished) out.push('ריהוט');
    if (hasSafeRoom) out.push('ממ"ד');
    if (isRenovated) out.push('משופצת');
    if (petsAllowed) out.push('חיות מחמד');
    if (hasElevator) out.push('מעלית');
    if (kosherKitchen) out.push('מטבח כשר');
    return out;
  }, [
    wheelchairAccessible,
    hasAirConditioning,
    hasBars,
    hasSolarHeater,
    isFurnished,
    hasSafeRoom,
    isRenovated,
    petsAllowed,
    hasElevator,
    kosherKitchen,
  ]);

  const propertyTypeLabel = propertyType === 'garden' ? 'דירת גן' : 'בניין';
  const priceLabel = price ? `₪${formatWithCommas(price)}` : '—';
  const locationLine = [address, neighborhood, city].filter(Boolean).join(', ');
  const previewMapHeight = useMemo(() => {
    const target = screenWidth - 40; // match apartment page "more square" map card
    return Math.max(170, Math.min(260, target));
  }, [screenWidth]);

  const previewFeatureItems = useMemo(() => {
    const items: Array<{ key: string; label: string; Icon: any }> = [];
    if (propertyType === 'building' && hasBalcony) {
      items.push({
        key: 'balcony_count',
        label: 'מרפסת',
        Icon: Home,
      });
    }
    if (wheelchairAccessible) items.push({ key: 'wheelchair_accessible', label: 'גישה לנכים', Icon: Accessibility });
    if (hasAirConditioning) items.push({ key: 'has_air_conditioning', label: 'מיזוג', Icon: Snowflake });
    if (hasBars) items.push({ key: 'has_bars', label: 'סורגים', Icon: Fence });
    if (hasSolarHeater) items.push({ key: 'has_solar_heater', label: 'דוד שמש', Icon: Sun });
    if (isFurnished) items.push({ key: 'is_furnished', label: 'ריהוט', Icon: Sofa });
    if (hasSafeRoom) items.push({ key: 'has_safe_room', label: 'ממ״ד', Icon: Shield });
    if (isRenovated) items.push({ key: 'is_renovated', label: 'משופצת', Icon: Hammer });
    if (petsAllowed) items.push({ key: 'pets_allowed', label: 'חיות מחמד', Icon: PawPrint });
    if (hasElevator) items.push({ key: 'has_elevator', label: 'מעלית', Icon: ArrowUpDown });
    if (kosherKitchen) items.push({ key: 'kosher_kitchen', label: 'מטבח כשר', Icon: Utensils });
    return items;
  }, [
    propertyType,
    hasBalcony,
    wheelchairAccessible,
    hasAirConditioning,
    hasBars,
    hasSolarHeater,
    isFurnished,
    hasSafeRoom,
    isRenovated,
    petsAllowed,
    hasElevator,
    kosherKitchen,
  ]);

  const goToStep = (next: Step) => {
    closeOverlays();
    setError('');
    setStep(next);
  };

  const roomsCount = useMemo(() => {
    const n = Number(String(bedrooms || '').trim());
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }, [bedrooms]);

  const bathroomsCount = useMemo(() => {
    const n = Number(String(bathrooms || '').trim());
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }, [bathrooms]);

  // Default roommate capacity when user reaches step 2 (required later for submit).
  useEffect(() => {
    if (step !== 2) return;
    if (roommateCapacity !== null) return;
    setRoommateCapacity(roommateCapacityOptions[0] ?? 2);
  }, [step, roommateCapacity, roommateCapacityOptions.join(',')]);

  // If user switches to garden apartment, reset fields that don't apply.
  useEffect(() => {
    if (propertyType !== 'garden') return;
    setFloor(0);
    setHasBalcony(false);
  }, [propertyType]);

  useEffect(() => {
    if (propertyType !== 'building') return;
    setGardenSizeSqm('');
  }, [propertyType]);

  useEffect(() => {
    if (!propertyTypeSegmentWidth) return;
    const innerWidth = Math.max(0, propertyTypeSegmentWidth - 8); // segmentWrap padding (4*2)
    const half = innerWidth / 2;
    const targetX = propertyType === 'building' ? half : 0; // row-reverse => "building" is right side

    if (!didMeasurePropertyTypeSegment.current) {
      propertyTypeThumbX.setValue(targetX);
      didMeasurePropertyTypeSegment.current = true;
      return;
    }

    Animated.timing(propertyTypeThumbX, {
      toValue: targetX,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [propertyType, propertyTypeSegmentWidth, propertyTypeThumbX]);

  const validateCurrentStep = (): boolean => {
    // Close overlays so the UI doesn't get stuck with an open dropdown
    closeOverlays();

    if (step === 1) {
      if (!images || images.length < 3) {
        setError('אנא העלה/י לפחות 3 תמונות');
        return false;
      }
      if (!title.trim()) {
        setError('אנא מלא/י כותרת');
        return false;
      }
      if (!address.trim()) {
        setError('אנא מלא/י כתובת');
        return false;
      }
      if (!city.trim()) {
        setError('אנא בחר/י כתובת מהרשימה כדי שנזהה עיר');
        return false;
      }
      if (propertyType !== 'building' && propertyType !== 'garden') {
        setError('אנא בחר/י סוג נכס');
        return false;
      }
      if (roomsCount <= 0) {
        setError('אנא בחר/י מספר חדרים');
        return false;
      }
      if (bathroomsCount <= 0) {
        setError('אנא בחר/י מספר חדרי רחצה');
        return false;
      }
      if (!price.trim()) {
        setError('אנא מלא/י מחיר');
        return false;
      }
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        setError('מחיר לא תקין');
        return false;
      }
      return true;
    }

    if (step === 2) {
      const sqm = Number(digitsOnly(sizeSqm));
      if (!Number.isFinite(sqm) || sqm <= 0) {
        setError('אנא מלא/י גודל דירה תקין (מ״ר)');
        return false;
      }
      if (roommateCapacity === null) {
        setError('אנא בחר/י מספר שותפים');
        return false;
      }
      if (!roommateCapacityOptions.includes(roommateCapacity)) {
        setError('בחירת מספר השותפים אינה תקפה');
        return false;
      }
      return true;
    }

    if (step === 3) {
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (isLoading) return;
    if (!validateCurrentStep()) return;
    if (step < TOTAL_STEPS) {
      goToStep((step + 1) as Step);
    }
  };

  const handlePrev = () => {
    if (isLoading) return;
    if (step > 1) {
      goToStep((step - 1) as Step);
    }
  };

  const pickImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('שגיאה', 'נדרש אישור לגישה לגלריה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: 6,
      } as any);

      if (!result.canceled) {
        const picked = (result as any).assets?.map((a: any) => a.uri) ?? [];
        if (picked.length) setImages((prev) => [...prev, ...picked].slice(0, 12));
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'בחירת תמונות נכשלה');
    }
  };

  const removeImageAt = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const normalizeImageForUpload = async (
    sourceUri: string,
  ): Promise<{ uri: string; ext: string; mime: string }> => {
    const MAX_WIDTH = 1200; // Maximum width for uploaded images (height scales proportionally)
    const COMPRESSION_QUALITY = 0.8; // Compression quality (0-1)

    try {
      // First, get image info to check if resizing is needed
      const imageInfo = await ImageManipulator.manipulateAsync(sourceUri, []);
      
      // Only resize if image is larger than max width
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > MAX_WIDTH) {
        actions.push({ resize: { width: MAX_WIDTH } });
      }

      // Compress the image (with or without resize)
      const compressed = await ImageManipulator.manipulateAsync(
        sourceUri,
        actions,
        { compress: COMPRESSION_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      return { uri: compressed.uri, ext: 'jpg', mime: 'image/jpeg' };
    } catch (err) {
      console.warn('Failed to compress image', err);
      throw new Error('לא הצלחנו לעבד את התמונה, נסה שוב');
    }
  };

  const uploadImage = async (userId: string, uri: string): Promise<string> => {
    const normalized = await normalizeImageForUpload(uri);
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${normalized.ext}`;
    const path = `apartments/${userId}/${fileName}`;
    const res = await fetch(normalized.uri);
    const arrayBuffer = await res.arrayBuffer();
    const { error: upErr } = await supabase
      .storage
      .from('apartment-images')
      .upload(path, arrayBuffer, { upsert: true, contentType: normalized.mime });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('apartment-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const ensureUserProfileRow = async (userId: string, email: string | null) => {
    // Verify profile row exists to satisfy FK: apartments.owner_id -> users.id
    const { data: existing, error: selectErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectErr) {
      // Non-blocking; try to proceed to upsert in case select blocked by RLS in some envs
    }

    if (!existing) {
      const fallbackName = email || 'משתמש';
      await supabase
        .from('users')
        .upsert(
          {
            id: userId,
            email: email,
            full_name: fallbackName,
          } as any,
          { onConflict: 'id' }
        );
    }
  };

  const handleSubmit = async () => {
    if (
      !title ||
      !address ||
      !city ||
      !price ||
      !bedrooms ||
      !bathrooms ||
      roommateCapacity === null
    ) {
      setError('אנא מלא את כל השדות החובה');
      return;
    }

    const priceNum = parseFloat(price);
    const bedroomsNum = parseInt(bedrooms);
    const bathroomsNum = parseInt(bathrooms);
    const roommatesNum = roommateCapacity as number;
    const sizeSqmNum = Number(digitsOnly(sizeSqm));
    const gardenSizeSqmNum = Number(digitsOnly(gardenSizeSqm));

    if (isNaN(priceNum) || priceNum <= 0) {
      setError('מחיר לא תקין');
      return;
    }

    if (isNaN(bedroomsNum) || bedroomsNum <= 0) {
      setError('מספר חדרי שינה לא תקין');
      return;
    }

    if (isNaN(bathroomsNum) || bathroomsNum <= 0) {
      setError('מספר חדרי אמבטיה לא תקין');
      return;
    }

    if (!roommateCapacityOptions.includes(roommatesNum)) {
      setError('בחירת כמות השותפים אינה תקפה');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const isMissingMoveInColumnError = (e: any): boolean => {
        const msg = String(e?.message || e?.error || e || '');
        const code = String(e?.code || '');
        if (code === '42703') return true; // Postgres undefined_column
        if (
          msg.includes('move_in_date') ||
          msg.toLowerCase().includes('move_in_date')
        ) {
          return msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('column') || msg.toLowerCase().includes('unknown');
        }
        return false;
      };

      const withoutMoveInFields = <T extends Record<string, any>>(payload: T): Omit<T, 'move_in_date'> => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { move_in_date, ...rest } = payload as any;
        return rest as any;
      };

      // Ensure user is authenticated
      const { data: userResp } = await supabase.auth.getUser();
      const authUser = user ?? userResp.user ?? null;
      if (!authUser) {
        setError('יש להתחבר כדי להוסיף דירה');
        setIsLoading(false);
        return;
      }

      if (mode === 'create') {
        // Enforce limit: a user can own max 1 apartment (by owner_id)
        const { data: owned, error: ownedErr } = await supabase
          .from('apartments')
          .select('id')
          .eq('owner_id', authUser.id)
          .limit(1);
        if (ownedErr) throw ownedErr;
        if (owned && owned.length > 0) {
          Alert.alert('לא ניתן להוסיף דירה', 'אי אפשר להעלות עוד דירה כי כבר העלית דירה אחת.');
          setIsLoading(false);
          router.replace('/(tabs)/home');
          return;
        }
      }

      // Make sure a users-row exists for FK
      await ensureUserProfileRow(authUser.id, authUser.email ?? null);

      // Upload images:
      // - In create: all images are local URIs.
      // - In edit: we may have existing remote URLs + new local URIs.
      const existingRemote = mode === 'edit' ? images.filter((u) => isRemoteUrl(u)) : [];
      const localUris = mode === 'edit' ? images.filter((u) => !isRemoteUrl(u)) : images;

      const uploadedUrls: string[] = [];
      for (const uri of localUris) {
        const url = await uploadImage(authUser.id, uri);
        uploadedUrls.push(url);
      }

      const finalImageUrls = Array.from(new Set([...(existingRemote || []), ...uploadedUrls].filter(Boolean)));
      const moveInDateIso =
        moveInDateObj ? toISODateString(normalizeToMonthStart(moveInDateObj)) : null;
      let supportsMoveInColumns = true;

      if (mode === 'edit') {
        if (!editingApartmentId) throw new Error('חסר מזהה דירה לעריכה');

        // Preserve existing partner_ids; only toggle owner inclusion if user changed it
        const base = normalizeIds(existingPartnerIds);
        const withoutOwner = base.filter((pid) => pid !== authUser.id);
        const nextPartnerIds = includeAsPartner ? Array.from(new Set([...withoutOwner, authUser.id])) : withoutOwner;

        const updatePayload = {
            partner_ids: nextPartnerIds,
            title,
            description: description || null,
            address,
            city,
            neighborhood: neighborhood || null,
            price: priceNum,
            apartment_type: propertyType === 'garden' ? 'GARDEN' : 'REGULAR',
            bedrooms: bedroomsNum,
            bathrooms: bathroomsNum,
            square_meters: Number.isFinite(sizeSqmNum) && sizeSqmNum > 0 ? sizeSqmNum : null,
            floor: propertyType === 'building' ? floor : null,
            garden_square_meters:
              propertyType === 'garden' && Number.isFinite(gardenSizeSqmNum) && gardenSizeSqmNum > 0
                ? gardenSizeSqmNum
                : null,
            roommate_capacity: roommatesNum,
            image_urls: finalImageUrls.length ? finalImageUrls : null,

            // Property features
            balcony_count: hasBalcony ? 1 : 0,
            wheelchair_accessible: wheelchairAccessible,
            has_air_conditioning: hasAirConditioning,
            has_bars: hasBars,
            has_solar_heater: hasSolarHeater,
            is_furnished: isFurnished,
            has_safe_room: hasSafeRoom,
            is_renovated: isRenovated,
            pets_allowed: petsAllowed,
            has_elevator: hasElevator,
            kosher_kitchen: kosherKitchen,

            // Move-in availability
            move_in_date: moveInDateIso,
        };

        let updated: any = null;
        let updateErr: any = null;
        {
          const res = await supabase
            .from('apartments')
            .update(supportsMoveInColumns ? updatePayload : withoutMoveInFields(updatePayload))
            .eq('id', editingApartmentId)
            .select()
            .single();
          updated = res.data;
          updateErr = res.error;
        }

        if (updateErr && supportsMoveInColumns && isMissingMoveInColumnError(updateErr)) {
          supportsMoveInColumns = false;
          const res2 = await supabase
            .from('apartments')
            .update(withoutMoveInFields(updatePayload))
            .eq('id', editingApartmentId)
            .select()
            .single();
          updated = res2.data;
          updateErr = res2.error;
        }

        if (updateErr) throw updateErr;
        updateApartment(updated as Apartment);
        Alert.alert('הצלחה', 'הדירה עודכנה בהצלחה');
        router.replace(`/apartment/${editingApartmentId}` as any);
      } else {
        // Generate a 6-digit passcode for joining the apartment.
        // Retry a few times in case of rare collision (unique index in DB).
        const maxAttempts = 6;
        let lastErr: any = null;
        let data: any = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const joinPasscode = generateJoinPasscode();
          const insertPayload = {
              owner_id: authUser.id,
              partner_ids: includeAsPartner ? [authUser.id] : [],
              title,
              description: description || null,
              address,
              city,
              neighborhood: neighborhood || null,
              price: priceNum,
              join_passcode: joinPasscode,
              // New schema fields
              apartment_type: propertyType === 'garden' ? 'GARDEN' : 'REGULAR',
              bedrooms: bedroomsNum,
              bathrooms: bathroomsNum,
              square_meters: Number.isFinite(sizeSqmNum) && sizeSqmNum > 0 ? sizeSqmNum : null,
              floor: propertyType === 'building' ? floor : null,
              garden_square_meters:
                propertyType === 'garden' && Number.isFinite(gardenSizeSqmNum) && gardenSizeSqmNum > 0
                  ? gardenSizeSqmNum
                  : null,
              roommate_capacity: roommatesNum,
              image_urls: finalImageUrls.length ? finalImageUrls : null,

              // Property features
              balcony_count: hasBalcony ? 1 : 0,
              wheelchair_accessible: wheelchairAccessible,
              has_air_conditioning: hasAirConditioning,
              has_bars: hasBars,
              has_solar_heater: hasSolarHeater,
              is_furnished: isFurnished,
              has_safe_room: hasSafeRoom,
              is_renovated: isRenovated,
              pets_allowed: petsAllowed,
              has_elevator: hasElevator,
              kosher_kitchen: kosherKitchen,

              // Move-in availability
              move_in_date: moveInDateIso,
          };

          let inserted: any = null;
          let insertError: any = null;
          {
            const res = await supabase
              .from('apartments')
              .insert(supportsMoveInColumns ? insertPayload : withoutMoveInFields(insertPayload))
              .select()
              .single();
            inserted = res.data;
            insertError = res.error;
          }

          // If the remote DB doesn't have move-in columns yet, retry once without them and continue.
          if (insertError && supportsMoveInColumns && isMissingMoveInColumnError(insertError)) {
            supportsMoveInColumns = false;
            const res2 = await supabase
              .from('apartments')
              .insert(withoutMoveInFields(insertPayload))
              .select()
              .single();
            inserted = res2.data;
            insertError = res2.error;
          }

          if (!insertError) {
            data = inserted;
            lastErr = null;
            break;
          }

          const msg = String((insertError as any)?.message || '');
          const isDuplicatePasscode =
            msg.includes('apartments_join_passcode_unique') ||
            msg.toLowerCase().includes('duplicate key value') ||
            msg.toLowerCase().includes('unique constraint');

          if (!isDuplicatePasscode) {
            lastErr = insertError;
            break;
          }

          lastErr = insertError;
        }

        if (lastErr) throw lastErr;

        // Ensure partner_ids contains the creator if user chose to be a partner (fallback if DB ignored the field)
        let apartmentRow = data;
        if (includeAsPartner && (!apartmentRow.partner_ids || apartmentRow.partner_ids.length === 0)) {
          const { data: fixed, error: fixErr } = await supabase
            .from('apartments')
            .update({ partner_ids: [authUser.id] })
            .eq('id', apartmentRow.id)
            .select()
            .single();
          if (!fixErr && fixed) {
            apartmentRow = fixed;
          }
        }

        addApartment(apartmentRow);
        // Use the same success animation as join-passcode.
        setIsSuccess(true);
        successTimeoutRef.current = setTimeout(() => {
          router.replace('/(tabs)/home');
        }, _successNavDelayMs);
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בהוספת דירה');
    } finally {
      setIsLoading(false);
    }
  };

  const isUiLocked = isLoading || isSuccess;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { paddingTop: (insets.top || 0) + 10 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
              <ArrowRight size={22} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{mode === 'edit' ? 'עריכת דירה' : 'הוספת דירה חדשה'}</Text>
            {/* Spacer to keep the title centered */}
            <View style={styles.headerSideSpacer} />
          </View>
        </View>

        <View style={styles.progressMetaRow}>
          <Text style={styles.progressMetaText}>{`הושלם ${Math.round((step / TOTAL_STEPS) * 100)}%`}</Text>
          <Text style={styles.progressMetaText}>{`שלב ${step} מתוך ${TOTAL_STEPS}`}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((step / TOTAL_STEPS) * 100)}%` }]} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
        >

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            {step === 1 ? (
              <>
                <Text style={styles.sectionTitle}>
                  תמונות הדירה <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.uploadCard}>
                  <View style={styles.uploadIconWrap}>
                    <Camera size={22} color="#5e3f2d" />
                  </View>
                  <Text style={styles.uploadTitle}>העלה תמונות</Text>
                  <Text style={styles.uploadSubtitle}>העלה לפחות 3 תמונות להראות את הדירה</Text>
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={pickImages}
                    disabled={isLoading}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.uploadBtnText}>בחירת תמונות</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.galleryBox}>
                  {images.length ? (
                    <>
                      <View style={styles.galleryGrid}>
                        {images.map((uri, idx) => (
                          <View key={uri + idx} style={styles.thumbWrap}>
                            <Image source={{ uri }} style={styles.thumb} />
                            <TouchableOpacity
                              style={styles.removeThumb}
                              onPress={() => removeImageAt(idx)}
                              disabled={isLoading}
                            >
                              <Text style={styles.removeThumbText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>

                      <View style={styles.galleryCountCenterWrap}>
                        <View style={styles.galleryCountTag}>
                          <Text style={styles.galleryCountTagText}>{`נבחרו ${images.length}/12`}</Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={styles.galleryPlaceholder}>
                      <Text style={styles.galleryPlaceholderText}>לא נבחרו תמונות עדיין</Text>
                      <Text style={styles.galleryPlaceholderSubText}>0/12 תמונות</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 8 }]}>פרטים בסיסיים</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    סוג הנכס <Text style={styles.required}>*</Text>
                  </Text>
                  <View
                    style={styles.segmentWrap}
                    onLayout={(e) => setPropertyTypeSegmentWidth(e.nativeEvent.layout.width)}
                  >
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.segmentThumb,
                        {
                          width: Math.max(0, (propertyTypeSegmentWidth - 8) / 2),
                          transform: [{ translateX: propertyTypeThumbX }],
                        },
                      ]}
                    />
                    <TouchableOpacity
                      style={[
                        styles.segmentBtn,
                        propertyType === 'building' ? styles.segmentBtnActive : null,
                      ]}
                      onPress={() => setPropertyType('building')}
                      disabled={isLoading}
                      activeOpacity={0.9}
                    >
                      <Building2
                        size={18}
                        color={propertyType === 'building' ? '#5e3f2d' : '#6B7280'}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          propertyType === 'building' ? styles.segmentTextActive : null,
                        ]}
                      >
                        בניין
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.segmentBtn,
                        propertyType === 'garden' ? styles.segmentBtnActive : null,
                      ]}
                      onPress={() => setPropertyType('garden')}
                      disabled={isLoading}
                      activeOpacity={0.9}
                    >
                      <Trees
                        size={18}
                        color={propertyType === 'garden' ? '#5e3f2d' : '#6B7280'}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          propertyType === 'garden' ? styles.segmentTextActive : null,
                        ]}
                      >
                        דירת גן
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    כותרת הדירה <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="לדוגמה: דירת 3 חדרים בתל אביב"
                    value={title}
                    onChangeText={setTitle}
                    editable={!isLoading}
                    placeholderTextColor="#9AA0A6"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    כתובת הדירה <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={styles.inputWithIcon}>
                    <MapPin size={18} color="#9CA3AF" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.inputFlex]}
                      placeholder="רחוב, מספר, עיר"
                      value={address}
                      onChangeText={(t) => {
                        setAddress(t);
                        if (neighborhood) setNeighborhood('');
                      }}
                      editable={!isLoading}
                      placeholderTextColor="#9AA0A6"
                    />
                  </View>
                  {addressSuggestions.length > 0 ? (
                    <View style={styles.suggestionsBox}>
                      {addressSuggestions.map((f) => (
                        <TouchableOpacity
                          key={f.id}
                          style={styles.suggestionItem}
                          onPress={() => {
                            const street = String(f.text || '').trim();
                            const house = String(f.address || '').trim();
                            const nextAddress = `${street}${house ? ` ${house}` : ''}`.trim();
                            setAddress(nextAddress || street || address);
                            setAddressSuggestions([]);
                            Keyboard.dismiss();

                            // derive city from context when possible
                            const derivedCity =
                              ctxText(f, 'place.') ||
                              ctxText(f, 'locality.') ||
                              ctxText(f, 'district.') ||
                              '';
                            if (derivedCity) {
                              setCity(derivedCity);
                              const center = Array.isArray(f.center) && f.center.length === 2 ? { lng: f.center[0], lat: f.center[1] } : undefined;
                              setSelectedCity({ name: derivedCity, center, bbox: undefined });
                            }

                            const inferredNeighborhood = inferNeighborhoodFromFeature(f, derivedCity || city);
                            if (inferredNeighborhood) setNeighborhood(inferredNeighborhood);

                            if (Array.isArray(f.center) && f.center.length === 2) {
                              const geo = { lng: f.center[0], lat: f.center[1] };
                              setSelectedGeo(geo);
                            }
                          }}
                        >
                          <Text style={styles.suggestionText}>{f.place_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>שכונה</Text>
                  {neighborhoodOptions.length > 0 ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        Keyboard.dismiss();
                        setNeighborhoodSearch('');
                        setIsNeighborhoodPickerOpen(true);
                      }}
                      disabled={isUiLocked || !String(city || '').trim()}
                      style={styles.inputWithIcon}
                    >
                      <Home size={18} color="#9AA0A6" style={styles.inputIcon} />
                      <View style={[styles.input, styles.inputFlex, styles.dateField]}>
                        <Text
                          style={[
                            styles.dateFieldText,
                            !String(neighborhood || '').trim() ? styles.dateFieldPlaceholder : null,
                          ]}
                        >
                          {String(neighborhood || '').trim() ? neighborhood : 'בחר/י שכונה'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TextInput
                      style={styles.input}
                      placeholder={String(city || '').trim() ? 'הקלד/י שכונה' : 'בחר/י כתובת כדי לזהות עיר'}
                      value={neighborhood}
                      onChangeText={setNeighborhood}
                      editable={!isUiLocked && !!String(city || '').trim()}
                      placeholderTextColor="#9AA0A6"
                    />
                  )}
                </View>

                <View style={styles.row}>
                  <View style={[styles.inputGroup, styles.halfWidth]}>
                    <Text style={styles.label}>תאריך כניסה</Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        Keyboard.dismiss();
                        setIsDatePickerOpen(true);
                      }}
                      disabled={isUiLocked}
                      style={styles.inputWithIcon}
                    >
                      <Calendar size={18} color="#9AA0A6" style={styles.inputIcon} />
                      <View style={[styles.input, styles.inputFlex, styles.dateField]}>
                        <Text
                          style={[
                            styles.dateFieldText,
                            !moveInDate ? styles.dateFieldPlaceholder : null,
                          ]}
                        >
                          {moveInDate || 'בחר/י חודש ושנה'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputGroup, styles.halfWidth]}>
                    <Text style={styles.label}>
                      שכר דירה (לשותף) <Text style={styles.required}>*</Text>
                    </Text>
                    <View style={styles.moneyWrap}>
                      <Text style={styles.moneySuffix}>₪</Text>
                      <TextInput
                        style={styles.moneyInput}
                        placeholder="4,500"
                        value={formatWithCommas(price)}
                        onChangeText={(t) => setPrice(digitsOnly(t))}
                        keyboardType="number-pad"
                        editable={!isLoading}
                        placeholderTextColor="#9AA0A6"
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.stepperCard}>
                  <View style={styles.stepperRow}>
                    <View style={styles.stepperControl} pointerEvents={isLoading ? 'none' : 'auto'}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, styles.stepperBtnPrimary]}
                        onPress={() => setBedrooms(String(Math.min(12, roomsCount + 1)))}
                        disabled={isLoading}
                      >
                        <Text style={styles.stepperBtnPrimaryText}>+</Text>
                      </TouchableOpacity>
                      <View style={styles.stepperValue}>
                        <Text style={styles.stepperValueText}>{roomsCount}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.stepperBtn, styles.stepperBtnSecondary]}
                        onPress={() => setBedrooms(String(Math.max(0, roomsCount - 1)))}
                        disabled={isLoading}
                      >
                        <Text style={styles.stepperBtnSecondaryText}>−</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.stepperLabels}>
                      <Text style={styles.stepperTitle}>
                        מספר חדרים <Text style={styles.required}>*</Text>
                      </Text>
                      <Text style={styles.stepperSubtitle}>כולל סלון</Text>
                    </View>
                  </View>

                  <View style={styles.stepperDivider} />

                  <View style={styles.stepperRow}>
                    <View style={styles.stepperControl} pointerEvents={isLoading ? 'none' : 'auto'}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, styles.stepperBtnPrimary]}
                        onPress={() => setBathrooms(String(Math.min(12, bathroomsCount + 1)))}
                        disabled={isLoading}
                      >
                        <Text style={styles.stepperBtnPrimaryText}>+</Text>
                      </TouchableOpacity>
                      <View style={styles.stepperValue}>
                        <Text style={styles.stepperValueText}>{bathroomsCount}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.stepperBtn, styles.stepperBtnSecondary]}
                        onPress={() => setBathrooms(String(Math.max(0, bathroomsCount - 1)))}
                        disabled={isLoading}
                      >
                        <Text style={styles.stepperBtnSecondaryText}>−</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.stepperLabels}>
                      <Text style={styles.stepperTitle}>
                        מספר חדרי רחצה <Text style={styles.required}>*</Text>
                      </Text>
                      <Text style={styles.stepperSubtitle}>חדרי אמבטיה/שירותים</Text>
                    </View>
                  </View>

                  <View style={styles.stepperDivider} />

                  {propertyType === 'building' ? (
                    <>
                      <View style={styles.stepperRow}>
                        <View style={styles.stepperControl} pointerEvents={isLoading ? 'none' : 'auto'}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, styles.stepperBtnPrimary]}
                            onPress={() => setFloor((v) => Math.min(60, v + 1))}
                            disabled={isLoading}
                          >
                            <Text style={styles.stepperBtnPrimaryText}>+</Text>
                          </TouchableOpacity>
                          <View style={styles.stepperValue}>
                            <Text style={styles.stepperValueText}>{floor}</Text>
                          </View>
                          <TouchableOpacity
                            style={[styles.stepperBtn, styles.stepperBtnSecondary]}
                            onPress={() => setFloor((v) => Math.max(0, v - 1))}
                            disabled={isLoading}
                          >
                            <Text style={styles.stepperBtnSecondaryText}>−</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.stepperLabels}>
                          <Text style={styles.stepperTitle}>קומה</Text>
                          <Text style={styles.stepperSubtitle}>מתוך סה״כ בבניין</Text>
                        </View>
                      </View>

                      <View style={styles.stepperDivider} />

                      <View style={styles.stepperRow}>
                        <View pointerEvents={isLoading ? 'none' : 'auto'}>
                          <Switch
                            value={hasBalcony}
                            onValueChange={setHasBalcony}
                            disabled={isLoading}
                            trackColor={{ false: '#E5E7EB', true: '#5e3f2d' }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                        <View style={styles.stepperLabels}>
                          <Text style={styles.stepperTitle}>מרפסת</Text>
                          <Text style={styles.stepperSubtitle}>יש / אין</Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View style={styles.step2Header}>
                  <Text style={styles.step2Title}>מאפיינים נוספים</Text>
                  <Text style={styles.step2Subtitle}>ספר לנו על החוויה ומה יש בדירה.</Text>
                </View>

                {propertyType === 'garden' ? (
                  <View style={styles.row}>
                    <View style={styles.halfWidth}>
                      <Text style={styles.fieldLabel}>גודל הגינה (מ״ר)</Text>
                      <View style={styles.unitWrap}>
                        <Text style={styles.unitSuffix}>מ״ר</Text>
                        <TextInput
                          style={styles.unitInput}
                          placeholder="אופציונלי"
                          value={digitsOnly(gardenSizeSqm)}
                          onChangeText={(t) => setGardenSizeSqm(digitsOnly(t))}
                          keyboardType="number-pad"
                          editable={!isLoading}
                          placeholderTextColor="#9AA0A6"
                        />
                      </View>
                    </View>

                    <View style={styles.halfWidth}>
                      <Text style={styles.fieldLabel}>
                        גודל הדירה (מ״ר) <Text style={styles.required}>*</Text>
                      </Text>
                      <View style={styles.unitWrap}>
                        <Text style={styles.unitSuffix}>מ״ר</Text>
                        <TextInput
                          style={styles.unitInput}
                          placeholder="למשל: 85"
                          value={digitsOnly(sizeSqm)}
                          onChangeText={(t) => setSizeSqm(digitsOnly(t))}
                          keyboardType="number-pad"
                          editable={!isLoading}
                          placeholderTextColor="#9AA0A6"
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>
                      גודל הדירה (מ״ר) <Text style={styles.required}>*</Text>
                    </Text>
                    <View style={styles.unitWrap}>
                      <Text style={styles.unitSuffix}>מ״ר</Text>
                      <TextInput
                        style={styles.unitInput}
                        placeholder="למשל: 85"
                        value={digitsOnly(sizeSqm)}
                        onChangeText={(t) => setSizeSqm(digitsOnly(t))}
                        keyboardType="number-pad"
                        editable={!isLoading}
                        placeholderTextColor="#9AA0A6"
                      />
                    </View>
                  </>
                )}

                <Text style={[styles.fieldLabel, styles.fieldLabelTight]}>קצת על הדירה</Text>
                <View style={styles.textCard}>
                  <TextInput
                    style={styles.textCardInput}
                    placeholder="דירה מוארת ומרווחת, משופצת חדשה. במיקום מעולה קרוב לתחבורה ציבורית ומרכזי קניות..."
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={6}
                    editable={!isLoading}
                    placeholderTextColor="#9AA0A6"
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.dividerLine} />

                <Text style={styles.fieldLabel}>מה יש בדירה?</Text>

                <View style={styles.featuresGrid}>
                    {(
                      [
                        {
                          key: 'wheelchairAccessible',
                          label: 'גישה לנכים',
                          Icon: Accessibility,
                          value: wheelchairAccessible,
                          set: setWheelchairAccessible,
                        },
                        {
                          key: 'hasAirConditioning',
                          label: 'מיזוג',
                          Icon: Snowflake,
                          value: hasAirConditioning,
                          set: setHasAirConditioning,
                        },
                        {
                          key: 'hasBars',
                          label: 'סורגים',
                          Icon: Fence,
                          value: hasBars,
                          set: setHasBars,
                        },
                        {
                          key: 'hasSolarHeater',
                          label: 'דוד שמש',
                          Icon: Sun,
                          value: hasSolarHeater,
                          set: setHasSolarHeater,
                        },
                        {
                          key: 'isFurnished',
                          label: 'ריהוט',
                          Icon: Sofa,
                          value: isFurnished,
                          set: setIsFurnished,
                        },
                        {
                          key: 'hasSafeRoom',
                          label: 'ממ"ד',
                          Icon: Shield,
                          value: hasSafeRoom,
                          set: setHasSafeRoom,
                        },
                        {
                          key: 'isRenovated',
                          label: 'משופצת',
                          Icon: Hammer,
                          value: isRenovated,
                          set: setIsRenovated,
                        },
                        {
                          key: 'petsAllowed',
                          label: 'חיות מחמד',
                          Icon: PawPrint,
                          value: petsAllowed,
                          set: setPetsAllowed,
                        },
                        {
                          key: 'hasElevator',
                          label: 'מעלית',
                          Icon: ArrowUpDown,
                          value: hasElevator,
                          set: setHasElevator,
                        },
                        {
                          key: 'kosherKitchen',
                          label: 'מטבח כשר',
                          Icon: Utensils,
                          value: kosherKitchen,
                          set: setKosherKitchen,
                        },
                      ] as const
                    ).map((item) => {
                      const active = item.value;
                      const Icon = item.Icon;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[styles.featureCard, active ? styles.featureCardActive : null]}
                          onPress={() => item.set(!item.value)}
                          activeOpacity={0.85}
                          disabled={isLoading}
                        >
                          <View style={[styles.featureIconWrap, active ? styles.featureIconWrapActive : null]}>
                            <Icon size={18} color={active ? '#5e3f2d' : '#6B7280'} />
                          </View>
                          <Text
                            style={[
                              styles.featureText,
                              active ? styles.featureTextActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                <View style={styles.dividerLine} />

                <View style={styles.stepperCard}>
                  <View style={styles.stepperRow}>
                    <View style={styles.stepperControl} pointerEvents={isLoading ? 'none' : 'auto'}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, styles.stepperBtnPrimary]}
                        onPress={() =>
                          setRoommateCapacity((prev) => {
                            const current = prev ?? (roommateCapacityOptions[0] ?? 2);
                            const idx = roommateCapacityOptions.indexOf(current);
                            const nextIdx = idx >= 0 ? Math.min(roommateCapacityOptions.length - 1, idx + 1) : 0;
                            return roommateCapacityOptions[nextIdx] ?? current;
                          })
                        }
                        disabled={isLoading}
                      >
                        <Text style={styles.stepperBtnPrimaryText}>+</Text>
                      </TouchableOpacity>
                      <View style={styles.stepperValue}>
                        <Text style={styles.stepperValueText}>{roommateCapacity ?? roommateCapacityOptions[0]}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.stepperBtn, styles.stepperBtnSecondary]}
                        onPress={() =>
                          setRoommateCapacity((prev) => {
                            const current = prev ?? (roommateCapacityOptions[0] ?? 2);
                            const idx = roommateCapacityOptions.indexOf(current);
                            const nextIdx = idx >= 0 ? Math.max(0, idx - 1) : 0;
                            return roommateCapacityOptions[nextIdx] ?? current;
                          })
                        }
                        disabled={isLoading}
                      >
                        <Text style={styles.stepperBtnSecondaryText}>−</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.stepperLabels}>
                      <Text style={styles.stepperTitle}>מתאים לכמות שותפים</Text>
                      <Text style={styles.stepperSubtitle}>2–5</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.inputGroup, styles.switchRow, { marginTop: 0 }]}>
                  <Text style={[styles.label, styles.switchLabel]}>האם אתה שותף בדירה?</Text>
                  <Switch
                    value={includeAsPartner}
                    onValueChange={setIncludeAsPartner}
                    disabled={isLoading}
                    trackColor={{ false: '#D1D5DB', true: '#5e3f2d' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#D1D5DB"
                  />
                </View>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <View style={styles.previewHeader}>
                  <Text style={styles.step2Title}>{mode === 'edit' ? 'סיכום ועדכון' : 'סיכום ופרסום'}</Text>
                  <Text style={styles.step2Subtitle}>תצוגה מקדימה כמו עמוד דירה רגיל.</Text>
                </View>

                <View style={styles.aptPreviewPage}>
                  <View style={styles.aptGalleryContainer}>
                    {images?.length ? (
                      <>
                        <ScrollView
                          ref={previewGalleryRef}
                          horizontal
                          pagingEnabled
                          showsHorizontalScrollIndicator={false}
                          onMomentumScrollEnd={(e) => {
                            const idx = Math.round(
                              e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
                            );
                            setPreviewActiveIdx(idx);
                          }}
                        >
                          {images.map((uri, idx) => (
                            <View key={`${uri}-${idx}`} style={[styles.aptSlide, { width: screenWidth }]}>
                              <Image source={{ uri }} style={styles.aptImage} resizeMode="cover" />
                            </View>
                          ))}
                        </ScrollView>
                        {images.length > 1 ? (
                          <View style={styles.aptDotsWrap} pointerEvents="none">
                            <View style={styles.aptDotsPill}>
                              {images.map((_, i) => (
                                <View
                                  key={`dot-${i}`}
                                  style={[
                                    styles.aptDotLight,
                                    i === previewActiveIdx ? styles.aptDotActiveLight : null,
                                  ]}
                                />
                              ))}
                            </View>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <View style={styles.previewEmpty}>
                        <Text style={styles.previewEmptyText}>לא נבחרו תמונות</Text>
                      </View>
                    )}
                  </View>

                  {/* Match apartment details layout (price -> title -> location) */}
                  <View style={styles.aptTopHeader}>
                    <View style={styles.aptHeroPriceRow}>
                      <View style={styles.aptHeroPriceMeta}>
                        <Text style={styles.aptHeroPriceValue}>
                          <Text style={styles.aptHeroCurrency}>₪</Text>
                          {price ? formatWithCommas(price) : '—'}
                        </Text>
                        <Text style={styles.aptHeroPricePer}>שכר דירה (לשותף)</Text>
                      </View>
                    </View>

                    <Text style={styles.aptHeroTitle} numberOfLines={2}>
                      {title?.trim() ? title.trim() : 'כותרת הדירה'}
                    </Text>

                    <View style={styles.aptHeroLocationRow}>
                      <View style={styles.aptHeroLocationIcon}>
                        <MapPin size={16} color="#6B7280" />
                      </View>
                      <Text style={styles.aptHeroLocationText} numberOfLines={1}>
                        {locationLine || 'כתובת לא מלאה'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.aptContent}>
                  {/* light stats row */}
                  <View style={styles.aptStatsRowLight}>
                    <View style={styles.aptStatLight}>
                      <View style={styles.aptStatIconCircle}>
                        <Users size={22} color="#5e3f2d" />
                      </View>
                      <View style={styles.aptStatLabelRow}>
                        {typeof roommateCapacity === 'number' ? (
                          <Text numberOfLines={1} ellipsizeMode="clip" style={{ color: '#111827' }}>
                            <Text style={styles.aptStatLabel}>{`מתאימה\u00A0ל`}</Text>
                            <Text style={styles.aptStatNumber}>{roommateCapacity}</Text>
                          </Text>
                        ) : (
                          <Text style={styles.aptStatLabel} numberOfLines={1} ellipsizeMode="clip">
                            קיבולת לא צוינה
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.aptStatLight}>
                      <View style={styles.aptStatIconCircle}>
                        <Bed size={22} color="#5e3f2d" />
                      </View>
                      <View style={styles.aptStatLabelRow}>
                        <Text style={styles.aptStatNumber}>{roomsCount || '—'}</Text>
                        <Text style={styles.aptStatLabel}>חדרים</Text>
                      </View>
                    </View>
                    <View style={styles.aptStatLight}>
                      <View style={styles.aptStatIconCircle}>
                        <Bath size={22} color="#5e3f2d" />
                      </View>
                      <View style={styles.aptStatLabelRow}>
                        <Text style={styles.aptStatNumber}>{bathroomsCount || '—'}</Text>
                        <Text style={styles.aptStatLabel}>מקלחות</Text>
                      </View>
                    </View>
                  </View>

                  {/* Description ("על המקום") */}
                  <View style={styles.aptSection}>
                    <View style={styles.aptWhiteCard}>
                      <Text style={styles.aptSectionTitle}>על המקום</Text>
                      <View style={styles.aptTagsRow}>
                        <View style={styles.aptTagPill}>
                          {propertyType === 'garden' ? (
                            <Trees size={14} color="#5e3f2d" />
                          ) : (
                            <Building2 size={14} color="#5e3f2d" />
                          )}
                          <Text style={styles.aptTagText}>{propertyTypeLabel}</Text>
                        </View>
                        {propertyType === 'building' ? (
                          <View style={styles.aptTagPill}>
                            <Layers size={14} color="#5e3f2d" />
                            <Text style={styles.aptTagText}>{`קומה ${floor}`}</Text>
                          </View>
                        ) : null}
                        {propertyType === 'garden' && digitsOnly(gardenSizeSqm) ? (
                          <View style={styles.aptTagPill}>
                            <Trees size={14} color="#5e3f2d" />
                            <Text style={styles.aptTagText}>{`${digitsOnly(gardenSizeSqm)} מ״ר גינה`}</Text>
                          </View>
                        ) : null}
                        {digitsOnly(sizeSqm) ? (
                          <View style={styles.aptTagPill}>
                            <Ruler size={14} color="#5e3f2d" />
                            <Text style={styles.aptTagText}>{`${digitsOnly(sizeSqm)} מ״ר`}</Text>
                          </View>
                        ) : null}
                        {moveInDate ? (
                          <View style={styles.aptTagPill}>
                            <Calendar size={14} color="#5e3f2d" />
                            <Text style={styles.aptTagText}>
                              {`כניסה ${moveInDate}`}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text style={styles.aptDescriptionLight}>
                        {description?.trim() ? description.trim() : 'לא נוסף תיאור עדיין.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.aptSection}>
                    <View style={styles.aptWhiteCard}>
                      <Text style={styles.aptSectionTitle}>מה יש בדירה?</Text>
                      <View style={styles.aptFeaturesGrid}>
                        {previewFeatureItems.length ? (
                          previewFeatureItems.map(({ key, label, Icon }) => (
                            <View key={`feat-${key}`} style={styles.aptFeatureLine}>
                              <Icon size={20} color="#5e3f2d" />
                              <Text style={styles.aptFeatureText}>{label}</Text>
                            </View>
                          ))
                        ) : (
                          <View style={styles.aptFeaturesEmptyWrap}>
                            <View style={styles.aptFeaturesEmptyIconPill}>
                              <Info size={18} color="#5e3f2d" />
                            </View>
                            <Text style={styles.aptFeaturesEmptyTitle}>לא צוינו מאפיינים</Text>
                            <Text style={styles.aptFeaturesEmptyText}>אפשר להמשיך גם בלי לבחור מאפיינים.</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.aptSection}>
                    <View style={styles.aptWhiteCard}>
                      <Text style={[styles.aptSectionTitle, { marginBottom: 0 }]}>מיקום</Text>
                      <View style={[styles.aptMapCard, { height: previewMapHeight, marginTop: 10 }]}>
                        {!selectedGeo ? (
                          <View style={styles.previewMapFallback}>
                            <Text style={styles.previewMapFallbackText}>בחר/י כתובת כדי שנציג מפה.</Text>
                          </View>
                        ) : (
                          <View style={styles.aptMapInner}>
                            {/* Non-interactive map so scroll works */}
                            <View pointerEvents="none" style={{ flex: 1, alignSelf: 'stretch' }}>
                              <MapboxMap
                                accessToken={mapboxToken}
                                styleUrl={mapboxStyleUrl}
                                center={selectedGeo ? ([selectedGeo.lng, selectedGeo.lat] as const) : undefined}
                                zoom={selectedGeo ? 15 : 11}
                                points={selectedGeo ? previewPoints : { type: 'FeatureCollection', features: [] }}
                                pointColor="#5e3f2d"
                                pulsePoints
                              />
                            </View>
                            {locationLine ? (
                              <View pointerEvents="none" style={styles.aptMapLocationBadge}>
                                <View style={styles.aptMapLocationIconPill}>
                                  <MapPin size={14} color="#5e3f2d" />
                                </View>
                                <View style={styles.aptMapLocationTextWrap}>
                                  <Text style={styles.aptMapLocationCity} numberOfLines={1}>
                                    {String(city || '').trim()}
                                  </Text>
                                  <Text style={styles.aptMapLocationAddress} numberOfLines={1}>
                                    {String(address || '').trim()}
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
              </>
            ) : null}

            {/* Navigation buttons moved to fixed bottom CTA (like the reference design). */}
          </View>
          <View style={[styles.footerSpacer, { height: 92 + (insets.bottom || 0) }]} />
        </ScrollView>

        <KeyFabPanel
          isOpen={isDatePickerOpen}
          onClose={() => setIsDatePickerOpen(false)}
          title="בחר תאריך כניסה"
          subtitle=""
          anchor="bottom"
          bottomOffset={datePickerBottomOffset}
        >
          <ScrollView style={styles.monthPickerList} showsVerticalScrollIndicator={false}>
            {moveInMonthOptions.map((opt, idx) => {
              const active = !!moveInDateObj && toISODateString(normalizeToMonthStart(moveInDateObj)) === opt.key;
              return (
                <TouchableOpacity
                  key={`movein-${opt.key}-${idx}`}
                  style={[styles.monthPickerOption, active ? styles.monthPickerOptionActive : null]}
                  activeOpacity={0.85}
                  onPress={() => {
                    const monthStart = normalizeToMonthStart(opt.date);
                    setMoveInDateObj(monthStart);
                    setMoveInDate(formatHebMonthYear(monthStart));
                    setIsDatePickerOpen(false);
                  }}
                >
                  <Text style={[styles.monthPickerOptionText, active ? styles.monthPickerOptionTextActive : null]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setIsDatePickerOpen(false)}>
              <Text style={styles.modalDoneText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </KeyFabPanel>

        <KeyFabPanel
          isOpen={isNeighborhoodPickerOpen}
          onClose={() => setIsNeighborhoodPickerOpen(false)}
          title={String(city || '').trim() ? `בחר שכונה (${city})` : 'בחר שכונה'}
          subtitle=""
          anchor="bottom"
          bottomOffset={datePickerBottomOffset}
        >
          <View style={{ gap: 10 }}>
            <TextInput
              style={[styles.input, styles.neighborhoodSearchInput]}
              placeholder="חיפוש שכונה…"
              value={neighborhoodSearch}
              onChangeText={setNeighborhoodSearch}
              editable={!isUiLocked}
              placeholderTextColor="#9AA0A6"
            />

            <ScrollView style={styles.monthPickerList} showsVerticalScrollIndicator={false}>
              {filteredNeighborhoodOptions.map((opt, idx) => {
                const active = String(neighborhood || '').trim() === opt;
                return (
                  <TouchableOpacity
                    key={`hood-${opt}-${idx}`}
                    style={[styles.monthPickerOption, active ? styles.monthPickerOptionActive : null]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setNeighborhood(opt);
                      setIsNeighborhoodPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.monthPickerOptionText, active ? styles.monthPickerOptionTextActive : null]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              {String(neighborhood || '').trim() ? (
                <TouchableOpacity
                  style={[styles.modalDoneBtn, styles.modalDoneBtnSecondary]}
                  onPress={() => {
                    setNeighborhood('');
                    setIsNeighborhoodPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalDoneText, styles.modalDoneTextSecondary]}>נקה</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setIsNeighborhoodPickerOpen(false)}>
                <Text style={styles.modalDoneText}>סגור</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyFabPanel>

        <View
          style={[
            styles.footerBar,
            {
              paddingBottom: 12 + (insets.bottom || 0),
            },
          ]}
          pointerEvents="box-none"
        >
          {step === 1 ? (
            <TouchableOpacity
              style={[styles.footerCtaBtn, isUiLocked && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={isUiLocked}
              activeOpacity={0.92}
            >
              <ArrowLeft size={20} color="#FFFFFF" />
              <Text style={styles.footerCtaText}>המשך לשלב הבא</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerCtaRow}>
              {step < TOTAL_STEPS ? (
                <TouchableOpacity
                  style={[styles.footerCtaBtn, isUiLocked && styles.buttonDisabled]}
                  onPress={handleNext}
                  disabled={isUiLocked}
                  activeOpacity={0.92}
                >
                  <ArrowLeft size={20} color="#FFFFFF" />
                  <Text style={styles.footerCtaText}>המשך לשלב הבא</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.footerCtaBtn,
                    mode !== 'edit' ? styles.footerCtaBtnPublish : null,
                    isUiLocked && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={isUiLocked}
                  activeOpacity={0.92}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : mode !== 'edit' ? (
                    <Check size={20} color="#FFFFFF" />
                  ) : (
                    <ArrowLeft size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.footerCtaText}>{mode === 'edit' ? 'עדכן דירה' : 'פרסם דירה'}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.footerSecondaryBtn, isUiLocked && styles.buttonDisabled]}
                onPress={handlePrev}
                disabled={isUiLocked}
                activeOpacity={0.92}
              >
                <ArrowRight size={20} color="#111827" />
                <Text style={styles.footerSecondaryText}>הקודם</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Success overlay (same style as join-passcode) */}
        <AnimatePresence>
          {isSuccess ? (
            <MotiView
              key="success"
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'timing', duration: 220 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            >
              <MotiView
                from={{ scale: 0.1 }}
                animate={{ scale: 12 }}
                transition={{
                  type: 'timing',
                  duration: _successDuration * 1.8,
                  easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
                }}
                style={styles.successBgCircle}
              />
              <MotiView
                from={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'timing', duration: 420, delay: 180 }}
                style={styles.successCenter}
              >
                <View style={styles.successBadge}>
                  <Check size={64} color={_brandGreen} />
                </View>
                <MotiText
                  from={{ opacity: 0, translateY: 6 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 420, delay: 360 }}
                  style={styles.successText}
                >
                  הדירה הועלתה בהצלחה
                </MotiText>
              </MotiView>
            </MotiView>
          ) : null}
        </AnimatePresence>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  header: {
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    flex: 1,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  headerSideSpacer: {
    width: 40,
    height: 40,
  },
  progressMetaRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  progressTrack: {
    marginHorizontal: 16,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    marginBottom: 10,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#5e3f2d',
    borderRadius: 999,
  },
  backBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: '#5e3f2d',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 10,
  },
  step2Header: {
    marginTop: 4,
    marginBottom: 10,
    alignItems: 'flex-end',
    gap: 4,
  },
  step2Title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  step2Subtitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'right',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
  },
  fieldLabelTight: {
    marginBottom: 4,
  },
  textCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textCardInput: {
    minHeight: 110,
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  uploadCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(94,63,45,0.22)',
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  uploadIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  uploadSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  uploadBtn: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  uploadBtnText: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '900',
  },
  stepHintBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  stepHintText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
    position: 'relative',
  },
  inputGroupRaised: {
    zIndex: 1000,
    elevation: 16,
  },
  segmentWrap: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 4,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  segmentThumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  segmentBtn: {
    flex: 1,
    minHeight: 48,
    backgroundColor: 'transparent',
    borderRadius: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 2,
  },
  segmentBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#5e3f2d',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B3556',
    textAlign: 'right',
  },
  required: {
    color: '#F87171',
  },
  input: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: 52,
    fontSize: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  inputWithIcon: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  inputIcon: {
    position: 'absolute',
    right: 14,
    zIndex: 2,
  },
  inputFlex: {
    flex: 1,
    paddingRight: 44,
  },
  dateField: {
    justifyContent: 'center',
  },
  dateFieldText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  dateFieldPlaceholder: {
    color: '#9AA0A6',
  },
  moneyWrap: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Keep currency on the left and numbers aligned properly regardless of RTL layout
    ...(Platform.OS !== 'web' ? ({ direction: 'ltr' } as const) : {}),
  },
  moneySuffix: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '900',
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  unitWrap: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS !== 'web' ? ({ direction: 'ltr' } as const) : {}),
  },
  unitSuffix: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '900',
  },
  unitInput: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  suggestionsBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    maxHeight: 220,
    shadowColor: '#111827',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1ECFF',
  },
  suggestionText: {
    color: '#111827',
    fontSize: 14,
    textAlign: 'right',
  },
  mapPreviewCard: {
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  mapPreviewBody: {
    height: 230,
    backgroundColor: '#FFFFFF',
  },
  autoFieldEmpty: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    textAlign: 'right',
  },
  halfWidth: {
    flex: 1,
  },
  button: {
    backgroundColor: '#5e3f2d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  resetButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7E2F5',
  },
  resetButtonText: {
    color: '#5e3f2d',
    fontSize: 16,
    fontWeight: '700',
  },
  navRow: {
    marginTop: 6,
    gap: 10,
  },
  navButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  navBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPrimaryButton: {
    backgroundColor: '#5e3f2d',
  },
  navPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  navStepText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  navSecondaryButton: {
    backgroundColor: '#E5E7EB',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#111827',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  navSecondaryText: {
    color: '#5e3f2d',
    fontSize: 16,
    fontWeight: '800',
  },
  error: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  footerSpacer: {
    height: 120,
  },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 18,
  },
  footerCtaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerCtaBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#5e3f2d',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#111827',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  footerCtaBtnPublish: {
    backgroundColor: '#16A34A',
  },
  footerCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  footerSecondaryBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  footerSecondaryText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },

  modalFooter: {
    marginTop: 10,
    gap: 10,
  },
  modalDoneBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#5e3f2d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneBtnSecondary: {
    backgroundColor: '#E5E7EB',
  },
  modalDoneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  modalDoneTextSecondary: {
    color: '#111827',
  },

  neighborhoodSearchInput: {
    marginBottom: 0,
  },

  monthPickerList: {
    maxHeight: 320,
    marginTop: 6,
  },
  monthPickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginBottom: 10,
  },
  monthPickerOptionActive: {
    backgroundColor: '#5e3f2d',
  },
  monthPickerOptionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  monthPickerOptionTextActive: {
    color: '#FFFFFF',
  },

  successBgCircle: {
    position: 'absolute',
    width: _screenW * 0.35,
    height: _screenW * 0.35,
    borderRadius: (_screenW * 0.35) / 2,
    backgroundColor: _brandGreen,
    top: _screenH * 0.45,
    left: _screenW * 0.325,
  },
  successCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadge: {
    width: _screenW * 0.42,
    height: _screenW * 0.42,
    borderRadius: (_screenW * 0.42) / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  stepperCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  stepperRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperDivider: {
    height: 1,
    backgroundColor: '#EEF2F7',
  },
  stepperLabels: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  stepperTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  stepperSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    // Keep +/- order stable like the screenshot (plus on the left, minus on the right)
    ...(Platform.OS !== 'web' ? ({ direction: 'ltr' } as const) : {}),
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 38,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPrimary: {
    backgroundColor: '#5e3f2d',
  },
  stepperBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: -1,
  },
  stepperBtnSecondary: {
    backgroundColor: '#EEF2F7',
  },
  stepperBtnSecondaryText: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: -1,
  },
  stepperValue: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },
  galleryBox: {
    marginTop: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 12,
  },
  galleryCountCenterWrap: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryCountTag: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  galleryCountTagText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  galleryGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    marginTop: 10,
    justifyContent: 'space-between',
  },
  thumbWrap: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F3F4F6',
    marginBottom: 10,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  removeThumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeThumbText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 16,
    marginTop: -1,
  },
  galleryPlaceholder: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginTop: 0,
  },
  galleryPlaceholderText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  galleryPlaceholderSubText: {
    marginTop: 6,
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
  },
  selectButtonPlaceholder: {
    color: '#9AA0A6',
  },
  selectButtonArrow: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 8,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
    marginHorizontal: 8,
    marginTop: 8,
  },
  dropdownScroll: {
    maxHeight: 200,
  },

  section: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1ECFF',
    gap: 10,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderColor: '#5e3f2d',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  chipTextActive: {
    color: '#5e3f2d',
  },
  featuresGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  featureCard: {
    width: '48%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  featureCardActive: {
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderColor: 'rgba(94,63,45,0.40)',
  },
  previewHeader: {
    marginTop: 4,
    marginBottom: 10,
    alignItems: 'flex-end',
    gap: 4,
  },
  // Step 3 "Apartment details-like" preview styles (match app/apartment/[id].tsx)
  aptPreviewPage: {
    marginHorizontal: -16,
    backgroundColor: '#FAFAFA',
  },
  aptGalleryContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  aptSlide: {
    width: '100%',
  },
  aptImage: {
    width: '100%',
    height: 480,
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  aptDotsWrap: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aptDotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  aptDotLight: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  aptDotActiveLight: {
    backgroundColor: '#FFFFFF',
  },
  aptTopHeader: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    writingDirection: 'rtl',
  },
  aptHeroPriceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  aptHeroPriceMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'flex-start',
    gap: 8,
  },
  aptHeroPriceValue: {
    color: '#5e3f2d',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    writingDirection: 'ltr',
  },
  aptHeroCurrency: {
    color: '#5e3f2d',
    fontSize: 22,
    fontWeight: '900',
  },
  aptHeroPricePer: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  aptHeroTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptHeroLocationRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  aptHeroLocationIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  aptHeroLocationText: {
    flex: 1,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptContent: {
    padding: 20,
  },
  aptStatsRowLight: { flexDirection: 'row-reverse', gap: 12, marginBottom: 12 },
  aptStatLight: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    aspectRatio: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }
      : { elevation: 4 }),
  },
  aptStatIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,63,45,0.08)',
    marginBottom: 8,
  },
  aptStatLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  aptStatLabel: { color: '#111827', fontWeight: '800', fontSize: 14 },
  aptStatNumber: { color: '#111827', fontWeight: '900', fontSize: 16 },
  aptSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  aptWhiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        }
      : { elevation: 4 }),
  },
  aptSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptTagsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  aptTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  aptTagText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptDescriptionLight: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptFeaturesGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 10,
    gap: 12,
  },
  aptFeatureLine: {
    width: '48%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  aptFeatureText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptFeaturesEmptyWrap: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aptFeaturesEmptyIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.14)',
    marginBottom: 10,
  },
  aptFeaturesEmptyTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  aptFeaturesEmptyText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  aptMapCard: {
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  aptMapInner: {
    flex: 1,
    alignSelf: 'stretch',
  },
  aptMapLocationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.10)',
    maxWidth: '92%',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        }
      : { elevation: 6 }),
  },
  aptMapLocationIconPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.14)',
  },
  aptMapLocationTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  aptMapLocationCity: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptMapLocationAddress: {
    marginTop: 2,
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewGalleryContainer: {
    marginHorizontal: -16,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    height: 240,
    marginBottom: 12,
  },
  previewSlide: {
    height: 240,
    backgroundColor: '#F3F4F6',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewDotsWrap: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  previewDotsPill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,24,39,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  previewDotActive: {
    backgroundColor: '#FFFFFF',
  },
  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
  },
  previewTopHeader: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 6,
  },
  previewLocationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  previewLocationText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  previewPriceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: 'flex-end',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  previewPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  previewPriceSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'right',
  },
  previewStatsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginBottom: 12,
  },
  previewStat: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  previewStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStatTextCol: {
    alignItems: 'flex-end',
  },
  previewStatNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  previewStatLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6B7280',
    textAlign: 'right',
    marginTop: 2,
  },
  previewSection: {
    marginBottom: 12,
  },
  previewWhiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  previewBodyText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 20,
  },
  previewMetaRow: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewMetaPill: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  previewMetaText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  previewFeaturesGrid: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 14,
  },
  previewFeatureTile: {
    width: '47%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  previewFeatureTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFeatureTileText: {
    flex: 1,
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  previewFeaturesEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  previewFeaturesEmptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFeaturesEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  previewFeaturesEmptyBody: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  previewMapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    height: 210,
  },
  previewMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  previewMapFallbackText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  previewMapInner: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  previewMapLocationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
  },
  previewMapLocationIconPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMapLocationCity: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  previewMapLocationAddress: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 2,
  },
  summaryHero: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    height: 190,
    marginBottom: 12,
  },
  summaryHeroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  summaryHeroEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeroEmptyText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  summaryCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 10,
  },
  summaryTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  summaryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  summaryPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5e3f2d',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  summaryLine: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  summaryLineText: {
    flex: 1,
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  summaryGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryItem: {
    width: '48%',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  summaryItemLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6B7280',
    textAlign: 'right',
    marginBottom: 4,
  },
  summaryItemValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  summaryBodyText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 20,
  },
  summaryBodyMuted: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  summaryPills: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryPill: {
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  summaryPillText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconWrapActive: {
    backgroundColor: 'rgba(94,63,45,0.12)',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  featureTextActive: {
    color: '#5e3f2d',
  },
});

