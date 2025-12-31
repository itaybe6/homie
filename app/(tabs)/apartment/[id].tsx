import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import { BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Bed,
  Bath,
  Users,
  Building2,
  Trees,
  Ruler,
  Layers,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  UserPlus,
  Search,
  Heart,
  Share2,
  Snowflake,
  Utensils,
  Home,
  Accessibility,
  Fence,
  Sun,
  Sofa,
  Shield,
  Hammer,
  PawPrint,
  ArrowUpDown,
  Info,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { Apartment, User } from '@/types/database';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxMap from '@/components/MapboxMap';
import type { MapboxFeatureCollection } from '@/lib/mapboxHtml';
import { geocodeApartmentAddress } from '@/lib/mapboxGeocoding';
import Ticker from '@/components/Ticker';
import { fetchUserSurvey } from '@/lib/survey';
import { calculateMatchScore } from '@/utils/matchCalculator';
import { buildCompatSurvey } from '@/lib/compatSurvey';

export default function ApartmentDetailsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id, returnTo } = useLocalSearchParams();
  const { user } = useAuthStore();
  const removeApartment = useApartmentStore((state) => state.removeApartment);

  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [owner, setOwner] = useState<User | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [imageCandidateIndex, setImageCandidateIndex] = useState<Record<number, number>>({});
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addCandidates, setAddCandidates] = useState<User[]>([]);
  const [sharedGroups, setSharedGroups] = useState<{ id: string; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRequestingJoin, setIsRequestingJoin] = useState(false);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [isAssignedAnywhere, setIsAssignedAnywhere] = useState<boolean | null>(null);
  const [ownerMatchPercent, setOwnerMatchPercent] = useState<number | null>(null);
  const [ownerMatchDisplay, setOwnerMatchDisplay] = useState<string>('--%');
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [navDestination, setNavDestination] = useState<string>('');
  const [confirmState, setConfirmState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
  });
  const galleryRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const insets = useSafeAreaInsets();
  const [isViewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;
  const mapboxStyleUrl = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL as string | undefined;
  const [aptGeo, setAptGeo] = useState<{ lng: number; lat: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string>('');
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  useEffect(() => {
    fetchApartmentDetails();
  }, [id]);

  // Compute match percent between current user and apartment owner (if surveys exist)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const myId = String((user as any)?.id || '').trim();
      const ownerId = String((owner as any)?.id || '').trim();
      if (!myId || !ownerId || myId === ownerId) {
        setOwnerMatchPercent(null);
        return;
      }
      try {
        const [mySurvey, ownerSurvey] = await Promise.all([fetchUserSurvey(myId), fetchUserSurvey(ownerId)]);
        if (cancelled) return;
        if (!mySurvey || !ownerSurvey) {
          setOwnerMatchPercent(null);
          return;
        }
        const myCompat = buildCompatSurvey(user as any, mySurvey as any);
        const ownerCompat = buildCompatSurvey(owner as any, ownerSurvey as any);
        const score = calculateMatchScore(myCompat, ownerCompat);
        const rounded =
          Number.isFinite(score) && !Number.isNaN(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
        setOwnerMatchPercent(rounded);
      } catch {
        if (!cancelled) setOwnerMatchPercent(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, owner?.id]);

  // Animate match % display like the user profile "match tab"
  useEffect(() => {
    let t: any;
    if (typeof ownerMatchPercent !== 'number' || !Number.isFinite(ownerMatchPercent)) {
      setOwnerMatchDisplay('--%');
      return () => {};
    }
    const digitsLen = String(ownerMatchPercent).length;
    const start = `${'0'.repeat(digitsLen)}%`;
    const end = `${ownerMatchPercent}%`;
    setOwnerMatchDisplay(start);
    t = setTimeout(() => setOwnerMatchDisplay(end), 120);
    return () => {
      try {
        clearTimeout(t);
      } catch {}
    };
  }, [ownerMatchPercent]);

  // Geocode apartment address -> show on Mapbox map (bottom map card)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setGeoError('');
      setAptGeo(null);
      const token = (mapboxToken || '').trim();
      if (!token) return;
      const address = String((apartment as any)?.address || '').trim();
      const city = String((apartment as any)?.city || '').trim();
      if (!address || !city) return;
      setIsGeocoding(true);
      try {
        const geo = await geocodeApartmentAddress({ accessToken: token, address, city, country: 'il' });
        if (cancelled) return;
        if (geo) setAptGeo(geo);
      } catch (e: any) {
        if (cancelled) return;
        setGeoError(e?.message || 'לא הצלחתי לאתר מיקום למפה');
      } finally {
        if (!cancelled) setIsGeocoding(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [apartment?.id, (apartment as any)?.address, (apartment as any)?.city, mapboxToken]);

  const aptMapPoints: MapboxFeatureCollection = useMemo(() => {
    if (!aptGeo) return { type: 'FeatureCollection', features: [] };
    const aptId = String((apartment as any)?.id || 'apt');
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [aptGeo.lng, aptGeo.lat] },
          properties: {
            id: aptId,
            title: String((apartment as any)?.title || 'דירה'),
            address: String((apartment as any)?.address || ''),
            city: String((apartment as any)?.city || ''),
          },
        },
      ],
    };
  }, [aptGeo, (apartment as any)?.id, (apartment as any)?.title, (apartment as any)?.address, (apartment as any)?.city]);

  const mapCardHeight = useMemo(() => {
    // Aim for a "more square" card: approx (screenWidth - horizontal padding) capped for large screens
    const target = screenWidth - 40; // content padding is 20 on each side
    // Slightly shorter than before so the map doesn't dominate the page.
    return Math.max(170, Math.min(260, target));
  }, [screenWidth]);

  const openNavigationPicker = () => {
    const city = String((apartment as any)?.city || '').trim();
    const address = String((apartment as any)?.address || '').trim();
    const destination = [address, city].filter(Boolean).join(', ');
    if (!destination) {
      Alert.alert('אין כתובת', 'לא ניתן לפתוח ניווט כי חסרים עיר/כתובת.');
      return;
    }
    setNavDestination(destination);
    setIsNavOpen(true);
  };

  const openNavUrl = async (url: string) => {
    try {
      setIsNavOpen(false);
      await Linking.openURL(url);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לפתוח את אפליקציית הניווט');
    }
  };

  // Persist "join request sent" per apartment + user (fixes refresh + navigation state bleed)
  useEffect(() => {
    let cancelled = false;
    const aptId = Array.isArray(id) ? id[0] : id;

    // Reset immediately when changing apartment/user
    setHasRequestedJoin(false);

    if (!aptId || !user?.id) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const { count, error } = await supabase
          .from('apartments_request')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', user.id)
          .eq('apartment_id', String(aptId))
          .eq('type', 'JOIN_APT')
          // If a request exists (pending/approved), treat as "already requested"
          .in('status', ['PENDING', 'APPROVED'] as any);
        if (error) throw error;
        if (!cancelled) setHasRequestedJoin((count || 0) > 0);
      } catch {
        if (!cancelled) setHasRequestedJoin(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  // Ensure Android hardware back returns to previous screen (or Home), and
  // closes the fullscreen viewer first if open.
  useEffect(() => {
    const onBack = () => {
      if (isViewerOpen) {
        setViewerOpen(false);
        return true;
      }
      const returnToStr = Array.isArray(returnTo) ? returnTo[0] : returnTo;
      if (typeof returnToStr === 'string' && returnToStr.trim()) {
        router.replace(returnToStr as any);
        return true;
      }
      // Use React Navigation's canGoBack() (reliable on iOS) so coming from Map returns to Map.
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace('/(tabs)/home');
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [isViewerOpen, router, navigation, returnTo]);

  useEffect(() => {
    const checkAssigned = async () => {
      try {
        if (!user?.id) {
          setIsAssignedAnywhere(false);
          return;
        }
        const currentUserId = user.id;
        const [{ data: own, error: ownErr }, { data: asPartner, error: partnerErr }] = await Promise.all([
          supabase.from('apartments').select('id').eq('owner_id', currentUserId).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [currentUserId] as any).limit(1),
        ]);
        if (ownErr) throw ownErr;
        if (partnerErr) throw partnerErr;
        const assigned = !!((own && own.length > 0) || (asPartner && asPartner.length > 0));
        setIsAssignedAnywhere(assigned);
        
      } catch (e) {
        setIsAssignedAnywhere(false);
        
      }
    };
    checkAssigned();
  }, [user?.id]);

  useEffect(() => {
    setImageCandidateIndex({});
    setActiveIdx(0);
  }, [apartment?.id]);

  const fetchApartmentDetails = async () => {
    try {
      // Reset dependent state to avoid stale data when navigating between apartments
      setMembers([]);
      const { data: aptData, error: aptError } = await supabase
        .from('apartments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (aptError) throw aptError;
      if (!aptData) {
        Alert.alert('שגיאה', 'דירה לא נמצאה');
        router.back();
        return;
      }
      setApartment(aptData);

      const { data: ownerData, error: ownerError } = await supabase
        .from('users')
        .select('*')
        .eq('id', aptData.owner_id)
        .maybeSingle();

      if (ownerError) throw ownerError;
      setOwner(ownerData);

      

      const partnerIds = normalizeIds((aptData as any).partner_ids);
      if (partnerIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .in('id', partnerIds);
        if (usersError) throw usersError;
        setMembers(usersData || []);
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error('Error fetching apartment:', error);
      Alert.alert('שגיאה', 'לא ניתן לטעון את פרטי הדירה');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteApartment = async () => {
    if (!apartment) return;
    Alert.alert('מחיקת דירה', 'האם אתה בטוח שברצונך למחוק את הדירה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            const imageUrls = normalizeImages((apartment as any).image_urls);
            await deleteApartmentImages(imageUrls);

            const { error } = await supabase
              .from('apartments')
              .delete()
              .eq('id', apartment.id);
            if (error) throw error;
            removeApartment(apartment.id);
            Alert.alert('הצלחה', 'הדירה נמחקה בהצלחה');
            router.replace('/(tabs)/home');
          } catch (error: any) {
            Alert.alert('שגיאה', error.message || 'לא ניתן למחוק את הדירה');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#5e3f2d" />
      </View>
    );
  }

  if (!apartment) {
    return null;
  }

  const isOwner = !!(
    user?.id &&
    String(user.id).toLowerCase() === String(apartment.owner_id || '').toLowerCase()
  );
  const PLACEHOLDER =
    'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  const normalizeImages = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .map((v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
            .filter(Boolean);
        }
      } catch {
        try {
          return value
            .replace(/^\s*\{|\}\s*$/g, '')
            .split(',')
            .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  const extractStoragePathsFromUrls = (urls: string[]): string[] => {
    const marker = '/apartment-images/';
    const unique = new Set<string>();

    urls.forEach((url) => {
      if (!url) return;
      try {
        const decoded = decodeURIComponent(url);
        const idx = decoded.indexOf(marker);
        if (idx === -1) return;
        const fragment = decoded.slice(idx + marker.length).split('?')[0];
        const path = fragment.replace(/^public\//, '').trim();
        if (path) unique.add(path);
      } catch {
        const fallbackIdx = url.indexOf(marker);
        if (fallbackIdx === -1) return;
        const fragment = url.slice(fallbackIdx + marker.length).split('?')[0];
        const path = fragment.replace(/^public\//, '').trim();
        if (path) unique.add(path);
      }
    });

    return Array.from(unique);
  };

  const deleteApartmentImages = async (urls: string[]): Promise<void> => {
    if (!urls?.length) return;
    const paths = extractStoragePathsFromUrls(urls);
    if (!paths.length) return;

    const chunkSize = 30;
    for (let i = 0; i < paths.length; i += chunkSize) {
      const chunk = paths.slice(i, i + chunkSize);
      try {
        const { error } = await supabase.storage.from('apartment-images').remove(chunk);
        if (error) {
          console.error('Failed to remove apartment images chunk', error);
        }
      } catch (err) {
        console.error('Failed to remove apartment images chunk', err);
      }
    }
  };

  const transformSupabaseImageUrl = (value: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.includes('/storage/v1/object/public/')) {
      const [base, query] = trimmed.split('?');
      const transformed = base.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const params: string[] = [];
      if (query) params.push(query);
      params.push('width=1200', 'quality=90', 'format=webp');
      return `${transformed}?${params.join('&')}`;
    }
    return trimmed;
  };

  const galleryImages: string[][] = (() => {
    const raw = normalizeImages((apartment as any).image_urls);
    const candidates = raw.map((original) => {
      const set = new Set<string>();
      const transformed = transformSupabaseImageUrl(original);
      [transformed, original, PLACEHOLDER].forEach((url) => {
        const trimmed = (url || '').trim();
        if (trimmed) set.add(trimmed);
      });
      return Array.from(set);
    });
    if (candidates.length === 0) {
      return [[PLACEHOLDER]];
    }
    return candidates;
  })();

  const getImageForIndex = (idx: number): string => {
    const candidates = galleryImages[idx] || [PLACEHOLDER];
    const useIdx = imageCandidateIndex[idx] ?? 0;
    return candidates[Math.min(useIdx, candidates.length - 1)] || PLACEHOLDER;
  };

  function normalizeIds(value: any): string[] {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {}
      return value
        .replace(/^{|}$/g, '')
        .split(',')
        .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  }

  const currentPartnerIds: string[] = normalizeIds((apartment as any).partner_ids);
  // Count should reflect what's stored on the apartment row (partner_ids),
  // not only the successfully fetched user rows (members).
  const roommatesCount = currentPartnerIds.length;
  const partnerSlotsUsed = currentPartnerIds.length;

  // Prefer roommate_capacity (the value set in "upload/edit apartment"),
  // fallback to max_roommates if it exists in some environments.
  const maxRoommates: number | null =
    typeof apartment.roommate_capacity === 'number'
      ? apartment.roommate_capacity
      : typeof (apartment as any)?.max_roommates === 'number'
        ? ((apartment as any).max_roommates as number)
        : null;

  const capacityLabel =
    typeof maxRoommates === 'number'
      ? `מתאימה לעד ${maxRoommates} שותפים`
      : 'קיבולת שותפים לא צוינה';

  const availableRoommateSlots =
    maxRoommates !== null ? Math.max(0, maxRoommates - partnerSlotsUsed) : null;
  const isMember = !!(
    user?.id &&
    currentPartnerIds.map((v) => String(v).toLowerCase()).includes(String(user.id).toLowerCase())
  );
  const isAddPartnerDisabled = availableRoommateSlots !== null && availableRoommateSlots <= 0;

  const address = String((apartment as any)?.address || '').trim();
  const city = String((apartment as any)?.city || '').trim();
  const neighborhood = String((apartment as any)?.neighborhood || '').trim();
  const locationLabel = (() => {
    const primary = (address || neighborhood || '').trim();
    if (!primary && !city) return '';
    if (primary && !city) return primary;
    if (!primary && city) return city;
    const a = primary.toLowerCase();
    const c = city.toLowerCase();
    if (c && a.includes(c)) return primary;
    return `${city} · ${primary}`;
  })();

  const apartmentType = String((apartment as any)?.apartment_type || '').toUpperCase();
  const floorRaw = (apartment as any)?.floor;
  const floor = typeof floorRaw === 'number' && Number.isFinite(floorRaw) ? floorRaw : null;
  const sqmRaw = (apartment as any)?.square_meters;
  const sqm = typeof sqmRaw === 'number' && Number.isFinite(sqmRaw) ? sqmRaw : null;
  const gardenSqmRaw = (apartment as any)?.garden_square_meters;
  const gardenSqm = typeof gardenSqmRaw === 'number' && Number.isFinite(gardenSqmRaw) ? gardenSqmRaw : null;

  const formatSqm = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return '';
    const rounded = Math.round(n);
    if (Math.abs(n - rounded) < 0.01) return String(rounded);
    return n.toFixed(1).replace(/\.0$/, '');
  };

  const typeTagLabel =
    apartmentType === 'GARDEN'
      ? 'דירת גן'
      : apartmentType === 'REGULAR' || !apartmentType
        ? 'בניין'
        : null;

  const sqmTagLabel = sqm !== null && sqm > 0 ? `${formatSqm(sqm)} מ״ר` : null;
  const gardenSqmTagLabel =
    apartmentType === 'GARDEN' && gardenSqm !== null && gardenSqm > 0 ? `${formatSqm(gardenSqm)} מ״ר גינה` : null;
  const floorTagLabel = floor !== null ? `קומה ${floor}` : null;

  const descriptionText = String((apartment as any)?.description || '').trim();
  const shouldShowReadMore = descriptionText.length > 260;
  

  // Compute a human-friendly sender label: if user is part of an ACTIVE merged profile,
  // show all member names joined by " • ", otherwise fallback to the user's full name.
  const computeSenderLabel = async (userId: string): Promise<string> => {
    try {
      // Check active membership
      const { data: membership } = await supabase
        .from('profile_group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      const groupId = (membership as any)?.group_id as string | undefined;
      if (!groupId) {
        const { data: me } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        return ((me as any)?.full_name as string) || 'משתמש';
      }
      // Load members of the active group
      const { data: memberRows } = await supabase
        .from('profile_group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'ACTIVE');
      const ids = (memberRows || []).map((r: any) => r.user_id).filter(Boolean);
      if (!ids.length) {
        const { data: me } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        return ((me as any)?.full_name as string) || 'משתמש';
      }
      const { data: usersRows } = await supabase
        .from('users')
        .select('full_name')
        .in('id', ids);
      const names = (usersRows || []).map((u: any) => u?.full_name).filter(Boolean);
      return names.length ? names.join(' • ') : 'משתמש';
    } catch {
      return 'משתמש';
    }
  };

  const handleRequestJoin = async () => {
    try {
      if (!user?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      if (isOwner || isMember) {
        return;
      }
      if (isAssignedAnywhere) {
        Alert.alert('שגיאה', 'את/ה כבר משויך/ת לדירה אחרת');
        return;
      }

      setIsRequestingJoin(true);

      // Optional dedupe for notifications only (still create a request either way)
      const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', user.id)
        .eq('recipient_id', apartment.owner_id)
        .gte('created_at', yesterdayIso);
      const shouldSkipNotifications = (recentCount || 0) > 0;

      const recipients = Array.from(
        new Set<string>([apartment.owner_id, ...currentPartnerIds].filter((rid) => rid && rid !== user.id))
      );
      

      if (recipients.length === 0) {
        Alert.alert('שגיאה', 'אין למי לשלוח בקשה כרגע');
        return;
      }

      // Fetch sender label (merged profile if exists)
      const senderName = await computeSenderLabel(user.id);

      const title = 'בקשה להצטרף כדייר';
      // Include a stable tag so we can reliably delete the relevant notification on cancel.
      const aptTag = `[APT:${apartment.id}]`;
      const description = `${senderName} מעוניין להצטרף לדירה: ${apartment.title} (${apartment.city}) ${aptTag}`;

      const rows = recipients.map((rid) => ({
        sender_id: user.id!,
        recipient_id: rid,
        title,
        // Important: do NOT embed INVITE_APT metadata here to avoid showing an approve button for recipients
        description,
        is_read: false,
      }));

      if (!shouldSkipNotifications) {
        const { error: insertErr } = await supabase.from('notifications').insert(rows);
        if (insertErr) throw insertErr;
      }

      // Also create request rows so user can track status
      try {
        const requestRows = recipients.map((rid) => ({
          sender_id: user.id!,
          recipient_id: rid,
          apartment_id: apartment.id,
          type: 'JOIN_APT',
          status: 'PENDING',
          metadata: null,
        }));
        const { error: reqErr } = await supabase
          .from('apartments_request')
          .insert(requestRows as any)
          .select('id'); // force RLS check and return for debugging
        if (reqErr) {
          throw reqErr;
        }
      } catch (e: any) {
        console.error('requests insert failed', e);
        Alert.alert('אזהרה', e?.message || 'לא ניתן ליצור שורת בקשה כרגע');
      }

      setHasRequestedJoin(true);
      Alert.alert('נשלח', shouldSkipNotifications ? 'נוצרה בקשה חדשה' : 'בקשתך נשלחה לבעל הדירה והשותפים');
    } catch (e: any) {
      console.error('request join failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח בקשה כעת');
    } finally {
      setIsRequestingJoin(false);
    }
  };

  const cancelJoinRequest = async () => {
    try {
      if (!user?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      if (!apartment?.id) return;

      setIsRequestingJoin(true);

      // If already approved, do not allow cancelling via this button.
      // (We treat APPROVED as "already requested" for UI purposes.)
      try {
        const { data: statusRows, error: statusErr } = await supabase
          .from('apartments_request')
          .select('status')
          .eq('sender_id', user.id)
          .eq('apartment_id', apartment.id)
          .eq('type', 'JOIN_APT')
          .in('status', ['PENDING', 'APPROVED'] as any)
          .limit(20);
        if (!statusErr) {
          const statuses = (statusRows || []).map((r: any) => String(r?.status || '').toUpperCase());
          if (statuses.includes('APPROVED')) {
            Alert.alert('לא ניתן לבטל', 'הבקשה כבר אושרה ולכן לא ניתן לבטל אותה מהמסך הזה.');
            return;
          }
        }
      } catch {
        // ignore
      }

      // Best-effort: delete the notifications created for this JOIN_APT request.
      // We can't reference a request_id, so we match by (sender_id, recipients, title, apt tag in description).
      try {
        const recipients = Array.from(
          new Set<string>([apartment.owner_id, ...currentPartnerIds].filter((rid) => rid && rid !== user.id))
        );
        if (recipients.length) {
          const title = 'בקשה להצטרף כדייר';
          const aptTag = `[APT:${apartment.id}]`;

          // Preferred: delete tagged notifications (new format)
          const { error: delNotifErr } = await supabase
            .from('notifications')
            .delete()
            .eq('sender_id', user.id)
            .in('recipient_id', recipients as any)
            .eq('title', title)
            .ilike('description', `%${aptTag}%`);

          // Fallback for older notifications without the tag
          if (delNotifErr) {
            await supabase
              .from('notifications')
              .delete()
              .eq('sender_id', user.id)
              .in('recipient_id', recipients as any)
              .eq('title', title)
              .ilike('description', `%${String(apartment.title || '').trim()}%`);
          }
        }
      } catch {
        // ignore (non-blocking)
      }

      // Cancel ALL pending JOIN_APT rows for this apartment (there may be multiple recipients)
      // Prefer DELETE so the request disappears from "Requests" and the UI returns to "הגש בקשה".
      const { error: delErr } = await supabase
        .from('apartments_request')
        .delete()
        .eq('sender_id', user.id)
        .eq('apartment_id', apartment.id)
        .eq('type', 'JOIN_APT')
        .eq('status', 'PENDING');

      if (delErr) {
        // Fallback: if DELETE is not allowed by RLS, mark as CANCELLED.
        const { error: updErr } = await supabase
          .from('apartments_request')
          .update({ status: 'CANCELLED', updated_at: new Date().toISOString() } as any)
          .eq('sender_id', user.id)
          .eq('apartment_id', apartment.id)
          .eq('type', 'JOIN_APT')
          .eq('status', 'PENDING');
        if (updErr) throw updErr;
      }

      setHasRequestedJoin(false);
      Alert.alert('בוטל', 'הבקשה בוטלה בהצלחה');
    } catch (e: any) {
      console.error('cancel join request failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לבטל את הבקשה כעת');
    } finally {
      setIsRequestingJoin(false);
    }
  };

  const filteredCandidates = (() => {
    const q = (addSearch || '').trim().toLowerCase();
    const excludeIds = new Set<string>([
      apartment.owner_id,
      ...normalizeIds((apartment as any).partner_ids),
    ]);
    const base = addCandidates.filter((u) => !excludeIds.has(u.id));
    if (!q) return base;
    return base.filter((u) => (u.full_name || '').toLowerCase().includes(q));
  })();
  const filteredSharedGroups = (() => {
    const q = (addSearch || '').trim().toLowerCase();
    const excludeIds = new Set<string>([
      apartment.owner_id,
      ...normalizeIds((apartment as any).partner_ids),
    ]);
    const base = sharedGroups
      .map((g) => ({
        ...g,
        members: g.members.filter((m) => !excludeIds.has(m.id)),
      }))
      .filter((g) => g.members.length > 0);
    if (!q) return base;
    return base.filter((g) =>
      g.members.some((m) => (m.full_name || '').toLowerCase().includes(q))
    );
  })();

  const openAddPartnerModal = async () => {
    if (!apartment) return;
    try {
      setIsAdding(true);
      const currentIds = new Set<string>([apartment.owner_id, ...normalizeIds((apartment as any).partner_ids)]);
      // Load all users
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'user')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const all = ((data || []) as User[]).filter((u) => {
        // Exclude "deleted" / invalid profiles: in some environments the auth user may be gone
        // while the profile row lingers; treat empty names as deleted/inactive.
        return String((u as any)?.full_name || '').trim().length > 0;
      });
      // Exclude users who are already assigned to ANY apartment (owners or partners)
      let assignedIds = new Set<string>();
      try {
        const { data: apts } = await supabase
          .from('apartments')
          .select('owner_id, partner_ids');
        (apts || []).forEach((apt: any) => {
          if (apt?.owner_id) assignedIds.add(apt.owner_id as string);
          const pids: string[] = Array.isArray(apt?.partner_ids) ? (apt.partner_ids as string[]) : [];
          pids.forEach((pid) => pid && assignedIds.add(pid));
        });
      } catch {}
      // Build final candidates: not in current apartment and not assigned anywhere else
      const candidates = all.filter((u) => !currentIds.has(u.id) && !assignedIds.has(u.id));

      // Group candidates by ACTIVE profile groups (shared profiles)
      let grouped: { id: string; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[] = [];
      try {
        const candidateIds = candidates.map((u) => u.id);
        if (candidateIds.length) {
          const { data: memberships } = await supabase
            .from('profile_group_members')
            .select('group_id, user_id')
            .in('user_id', candidateIds)
            .eq('status', 'ACTIVE');
          const groupToMemberIds: Record<string, string[]> = {};
          (memberships || []).forEach((row: any) => {
            if (!row.group_id || !row.user_id) return;
            if (!groupToMemberIds[row.group_id]) groupToMemberIds[row.group_id] = [];
            if (!groupToMemberIds[row.group_id].includes(row.user_id)) {
              groupToMemberIds[row.group_id].push(row.user_id);
            }
          });
          const groupedIds = Object.entries(groupToMemberIds)
            .filter(([_, ids]) => (ids || []).length >= 2)
            .map(([gid]) => gid);
          if (groupedIds.length) {
            const allMemberIds = groupedIds.flatMap((gid) => groupToMemberIds[gid]);
            // Remove grouped members from individual candidates
            const groupedMemberIdSet = new Set(allMemberIds);
            const remainingCandidates = candidates.filter((u) => !groupedMemberIdSet.has(u.id));
            setAddCandidates(remainingCandidates);
            // Fetch minimal user data for grouped members
            const { data: usersRows } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', Array.from(groupedMemberIdSet));
            const byId: Record<string, Pick<User, 'id' | 'full_name' | 'avatar_url'>> = {};
            (usersRows || []).forEach((u: any) => {
              if (!u?.id) return;
              if (String(u?.full_name || '').trim().length === 0) return;
              byId[u.id] = { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url };
            });
            grouped = groupedIds.map((gid) => ({
              id: gid,
              members: (groupToMemberIds[gid] || [])
                .map((uid) => byId[uid])
                .filter(Boolean),
            }));
            // Only show groups that still have 2+ active profiles after filtering
            setSharedGroups(grouped.filter((g) => (g.members || []).length >= 2));
          } else {
            setAddCandidates(candidates);
            setSharedGroups([]);
          }
        } else {
          setAddCandidates(candidates);
          setSharedGroups([]);
        }
      } catch {
        setAddCandidates(candidates);
        setSharedGroups([]);
      }
      setIsAddOpen(true);
    } catch (e) {
      console.error('Failed to load candidates', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון משתמשים להוספה');
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddPartner = async (partnerId: string) => {
    if (!apartment || !user?.id) return;
    setIsAdding(true);
    try {
      // Prevent duplicate immediate add; we now send an invite + create a request instead.
      const currentPartnerIds = normalizeIds((apartment as any).partner_ids);
      if (currentPartnerIds.includes(partnerId)) {
        Alert.alert('שים לב', 'המשתמש כבר שותף בדירה');
        return;
      }

      // Create a notification to the invitee with inviter's merged profile label (if exists)
      const inviterName = await computeSenderLabel(user.id);

      const title = 'הזמנה להצטרף לדירה';
      const description = `${inviterName} מזמין/ה אותך להיות שותף/ה בדירה${apartment.title ? `: ${apartment.title}` : ''}${apartment.city ? ` (${apartment.city})` : ''}`;
      const { error: notifErr } = await supabase.from('notifications').insert({
        sender_id: user.id,
        recipient_id: partnerId,
        title,
        description,
        is_read: false,
      });
      if (notifErr) throw notifErr;

      // Create an apartment request row (INVITE_APT) to be approved by the invitee
      const { error: reqErr } = await supabase.from('apartments_request').insert({
        sender_id: user.id,
        recipient_id: partnerId,
        apartment_id: apartment.id,
        type: 'INVITE_APT',
        status: 'PENDING',
        metadata: null,
      } as any);
      if (reqErr) throw reqErr;

      Alert.alert('נשלח', 'הזמנה נשלחה ונוצרה בקשה בעמוד הבקשות');
      setIsAddOpen(false);
    } catch (e: any) {
      console.error('Failed to add partner', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח הזמנה כעת');
    } finally {
      setIsAdding(false);
    }
  };

  // Invite an entire shared profile (group): fan-out a notification and request to each active member
  const handleAddSharedGroup = async (groupId: string, memberIds: string[]) => {
    if (!apartment || !user?.id) return;
    setIsAdding(true);
    try {
      const currentPartnerIds = new Set<string>(normalizeIds((apartment as any).partner_ids));
      const ownerId = String((apartment as any).owner_id || '');
      const recipients = Array.from(
        new Set<string>(
          (memberIds || [])
            .filter(Boolean)
            .map((id) => String(id))
            .filter((id) => id !== user.id && id !== ownerId && !currentPartnerIds.has(id))
        )
      );
      if (recipients.length === 0) {
        Alert.alert('שגיאה', 'אין למי לשלוח הזמנה בקבוצה זו');
        return;
      }
      const inviterName = await computeSenderLabel(user.id);
      const title = 'הזמנה להצטרף לדירה';
      const description = `${inviterName} מזמין/ה אותך להיות שותף/ה בדירה${apartment.title ? `: ${apartment.title}` : ''}${apartment.city ? ` (${apartment.city})` : ''}`;
      // Fan-out notifications
      const notifRows = recipients.map((rid) => ({
        sender_id: user.id!,
        recipient_id: rid,
        title,
        description,
        is_read: false,
      }));
      const { error: notifErr } = await supabase.from('notifications').insert(notifRows as any);
      if (notifErr) throw notifErr;
      // Fan-out requests (INVITE_APT)
      const reqRows = recipients.map((rid) => ({
        sender_id: user.id!,
        recipient_id: rid,
        apartment_id: apartment.id,
        type: 'INVITE_APT',
        status: 'PENDING',
        metadata: { group_id: groupId } as any,
      }));
      const { error: reqErr } = await supabase.from('apartments_request').insert(reqRows as any);
      if (reqErr) throw reqErr;
      Alert.alert('נשלח', 'הזמנה נשלחה לכל חברי הפרופיל ונוצרו בקשות');
      setIsAddOpen(false);
    } catch (e: any) {
      console.error('Failed to add shared group', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח הזמנה לקבוצה כעת');
    } finally {
      setIsAdding(false);
    }
  };

  const confirmAddPartner = (candidate: User) => {
    if (Platform.OS === 'web') {
      setConfirmState({
        visible: true,
        title: 'אישור הוספה',
        message: `לשלוח הזמנה ל-${candidate.full_name} להצטרף כדייר?`,
        confirmLabel: 'שלח הזמנה',
        cancelLabel: 'ביטול',
        onConfirm: () => handleAddPartner(candidate.id),
      });
    } else {
      Alert.alert(
        'אישור הוספה',
        `לשלוח הזמנה ל-${candidate.full_name} להצטרף כדייר?`,
        [
          { text: 'ביטול', style: 'cancel' },
          { text: 'שלח הזמנה', onPress: () => handleAddPartner(candidate.id) },
        ]
      );
    }
  };

  const handleRemovePartner = async (partnerId: string) => {
    if (!apartment || !isOwner) return;
    if (partnerId === apartment.owner_id) {
      Alert.alert('שגיאה', 'לא ניתן להסיר את בעל הדירה');
      return;
    }
    setRemovingId(partnerId);
    try {
      const currentPartnerIds = normalizeIds((apartment as any).partner_ids);
      const newPartnerIds = currentPartnerIds.filter((id) => id !== partnerId);

      const { error: updateErr } = await supabase
        .from('apartments')
        .update({ partner_ids: newPartnerIds })
        .eq('id', apartment.id);
      if (updateErr) throw updateErr;

      setMembers((prev) => prev.filter((m) => m.id !== partnerId));
      setApartment((prev) => (prev ? { ...prev, partner_ids: newPartnerIds } as Apartment : prev));

      Alert.alert('הצלחה', 'השותף הוסר מהדירה');
    } catch (e: any) {
      console.error('Failed to remove partner', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן להסיר את השותף');
    } finally {
      setRemovingId(null);
    }
  };

  const confirmRemovePartner = (u: User) => {
    if (Platform.OS === 'web') {
      setConfirmState({
        visible: true,
        title: 'אישור הסרה',
        message: `להסיר את ${u.full_name} מרשימת השותפים?`,
        confirmLabel: 'הסר',
        cancelLabel: 'ביטול',
        onConfirm: () => handleRemovePartner(u.id),
      });
    } else {
      Alert.alert(
        'אישור הסרה',
        `להסיר את ${u.full_name} מרשימת השותפים?`,
        [
          { text: 'ביטול', style: 'cancel' },
          { text: 'הסר', style: 'destructive', onPress: () => handleRemovePartner(u.id) },
        ]
      );
    }
  };

  const scrollToSlide = (index: number) => {
    if (!galleryRef.current) return;
    const offset = index * screenWidth;
    const scrollView: any = galleryRef.current;

    if (typeof scrollView.scrollTo === 'function') {
      scrollView.scrollTo({ x: offset, animated: Platform.OS !== 'web' });
    }

    if (Platform.OS === 'web') {
      const webNode =
        scrollView.getScrollableNode?.() ??
        scrollView._scrollRef ??
        scrollView.getInnerViewNode?.() ??
        scrollView.getNativeScrollRef?.();

      if (webNode) {
        if (typeof webNode.scrollTo === 'function') {
          webNode.scrollTo({ left: offset, behavior: 'smooth' });
        } else {
          webNode.scrollLeft = offset;
        }
      }
    }

    setActiveIdx(index);
  };

  const goPrev = () => {
    if (activeIdx <= 0) return;
    scrollToSlide(activeIdx - 1);
  };

  const goNext = () => {
    if (activeIdx >= galleryImages.length - 1) return;
    scrollToSlide(activeIdx + 1);
  };

  return (
    <View style={styles.container}>
      {isOwner ? <StatusBar translucent backgroundColor="transparent" style="light" /> : null}
      <ScrollView
        contentContainerStyle={{
          paddingBottom: (insets.bottom || 0) + 24,
          paddingTop: 0,
          backgroundColor: '#FAFAFA',
        }}
      >
        {/* Owner actions pinned to top of the page */}
        {null}

        <View style={styles.galleryContainer}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(
                e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
              );
              setActiveIdx(idx);
            }}
          >
            {galleryImages.map((_, idx) => {
              const uri = getImageForIndex(idx);
              return (
              <View key={`${uri}-${idx}`} style={[styles.slide, { width: screenWidth }]}>
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    setViewerIndex(idx);
                    setViewerOpen(true);
                  }}
                >
                  <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="cover"
                    onError={() => {
                    setImageCandidateIndex((prev) => {
                      const candidates = galleryImages[idx] || [PLACEHOLDER];
                      const current = prev[idx] ?? 0;
                      const next = Math.min(current + 1, candidates.length - 1);
                      if (next === current) return prev;
                      return { ...prev, [idx]: next };
                    });
                    }}
                  />
                </TouchableOpacity>
              </View>
            );})}
          </ScrollView>

          {/* top overlay controls (fixed over the whole gallery) */}
          <View style={[styles.topControlsRow, isOwner ? { top: 70 } : null]}>
            <View style={styles.leftControls}>
              <TouchableOpacity style={styles.circleBtnLight} activeOpacity={0.9}>
                <Share2 size={18} color="#111827" />
              </TouchableOpacity>
              {isOwner ? (
                <TouchableOpacity
                  style={[styles.circleBtnLight, (isAdding || isAddPartnerDisabled) ? { opacity: 0.55 } : null]}
                  activeOpacity={0.9}
                  disabled={isAdding || isAddPartnerDisabled}
                  onPress={() => {
                    if (isAddPartnerDisabled) {
                      Alert.alert('אין מקום', 'הגעת למספר השותפים המקסימלי בדירה זו');
                      return;
                    }
                    openAddPartnerModal();
                  }}
                >
                  <UserPlus size={18} color="#111827" />
                </TouchableOpacity>
              ) : null}
              {isOwner ? (
                <TouchableOpacity
                  style={styles.circleBtnLight}
                  activeOpacity={0.9}
                  onPress={() => router.push({ pathname: '/apartment/edit/[id]', params: { id: apartment.id } })}
                >
                  <Pencil size={18} color="#111827" />
                </TouchableOpacity>
              ) : null}
              {isOwner ? (
                <TouchableOpacity
                  style={styles.circleBtnLight}
                  activeOpacity={0.9}
                  onPress={handleDeleteApartment}
                >
                  <Trash2 size={18} color="#111827" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.circleBtnLight}
              onPress={() => {
                const returnToStr = Array.isArray(returnTo) ? returnTo[0] : returnTo;
                if (typeof returnToStr === 'string' && returnToStr.trim()) {
                  router.replace(returnToStr as any);
                  return;
                }
                // Go back to the previous screen (map/home), fallback to home if no history
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  router.replace('/(tabs)/home');
                }
              }}
              activeOpacity={0.9}
            >
              <ArrowRight size={18} color="#111827" />
            </TouchableOpacity>
          </View>

          {galleryImages.length > 1 ? (
            <View style={styles.dotsWrap} pointerEvents="none">
              <View style={styles.dotsPill}>
                {galleryImages.map((_, i) => (
                  <View key={`dot-${i}`} style={[styles.dotLight, i === activeIdx && styles.dotActiveLight]} />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* Header under image (price -> title -> location) */}
        <View style={styles.topHeader}>
          <View style={styles.heroPriceRow}>
            <View style={styles.heroPriceMeta}>
              <Text style={styles.heroPriceValue}>
                <Text style={styles.heroCurrency}>₪</Text>
                {apartment.price?.toLocaleString?.() ?? String(apartment.price ?? '')}
              </Text>
              <Text style={styles.heroPricePer}>/חודש</Text>
            </View>

            <TouchableOpacity
              style={[styles.circleBtnLight, styles.heroFavBtn]}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="סמן כמועדף"
            >
              <Heart size={18} color="#5e3f2d" />
            </TouchableOpacity>
          </View>

          <Text style={styles.heroTitle} numberOfLines={2}>
            {apartment.title}
          </Text>

          {locationLabel ? (
            <View style={styles.heroLocationRow}>
              <View style={styles.heroLocationIcon}>
                <MapPin size={16} color="#6B7280" />
              </View>
              <Text style={styles.heroLocationText} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
          ) : null}
        </View>



        <View style={styles.content}>
          {/* light stats row */}
          <View style={styles.statsRowLight}>
            <TouchableOpacity
              style={styles.statLight}
              activeOpacity={0.9}
              onPress={() => setIsMembersOpen(true)}
            >
              <View style={styles.statIconCircle}>
                <Users size={22} color="#5e3f2d" />
              </View>
              <View style={styles.statLabelRow}>
                {typeof maxRoommates === 'number' ? (
                  <Text numberOfLines={1} ellipsizeMode="clip" style={{ color: '#111827' }}>
                    <Text style={styles.statLabel}>{`מתאימה\u00A0ל`}</Text>
                    <Text style={styles.statNumber}>{maxRoommates}</Text>
                  </Text>
                ) : (
                  <Text style={styles.statLabel} numberOfLines={1} ellipsizeMode="clip">
                    קיבולת לא צוינה
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.statLight}>
              <View style={styles.statIconCircle}>
                <Bed size={22} color="#5e3f2d" />
              </View>
              <View style={styles.statLabelRow}>
                <Text style={styles.statNumber}>{apartment.bedrooms}</Text>
                <Text style={styles.statLabel}>חדרים</Text>
              </View>
            </View>
            <View style={styles.statLight}>
              <View style={styles.statIconCircle}>
                <Bath size={22} color="#5e3f2d" />
              </View>
              <View style={styles.statLabelRow}>
                <Text style={styles.statNumber}>{apartment.bathrooms}</Text>
                <Text style={styles.statLabel}>מקלחות</Text>
              </View>
            </View>
          </View>

          {/* Description ("על המקום") */}
          {descriptionText || typeTagLabel || floorTagLabel || gardenSqmTagLabel || sqmTagLabel ? (
            <View style={styles.section}>
              <View style={styles.whiteCard}>
                <Text style={styles.sectionTitle}>על המקום</Text>
                {/* Type / floor / sqm tags (moved inside "About" card) */}
                {typeTagLabel || floorTagLabel || gardenSqmTagLabel || sqmTagLabel ? (
                  <View style={styles.tagsRow}>
                    {typeTagLabel ? (
                      <View style={styles.tagPill}>
                        {apartmentType === 'GARDEN' ? (
                            <Trees size={14} color="#5e3f2d" />
                        ) : (
                            <Building2 size={14} color="#5e3f2d" />
                        )}
                        <Text style={styles.tagText}>{typeTagLabel}</Text>
                      </View>
                    ) : null}
                    {floorTagLabel ? (
                      <View style={styles.tagPill}>
                        <Layers size={14} color="#5e3f2d" />
                        <Text style={styles.tagText}>{floorTagLabel}</Text>
                      </View>
                    ) : null}
                    {gardenSqmTagLabel ? (
                      <View style={styles.tagPill}>
                        <Trees size={14} color="#5e3f2d" />
                        <Text style={styles.tagText}>{gardenSqmTagLabel}</Text>
                      </View>
                    ) : null}
                    {sqmTagLabel ? (
                      <View style={styles.tagPill}>
                        <Ruler size={14} color="#5e3f2d" />
                        <Text style={styles.tagText}>{sqmTagLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {descriptionText ? (
                  <>
                    <Text
                      style={styles.descriptionLight}
                      numberOfLines={isDescExpanded ? undefined : 6}
                      ellipsizeMode="tail"
                    >
                      {descriptionText}
                    </Text>
                    {shouldShowReadMore ? (
                      <TouchableOpacity
                        onPress={() => setIsDescExpanded((v) => !v)}
                        activeOpacity={0.85}
                        style={styles.readMoreBtn}
                        accessibilityRole="button"
                        accessibilityLabel={isDescExpanded ? 'קרא פחות' : 'קרא עוד'}
                      >
                        <Text style={styles.readMoreText}>{isDescExpanded ? 'קרא פחות' : 'קרא עוד'}</Text>
                        {isDescExpanded ? (
                          <ChevronUp size={16} color="#5e3f2d" />
                        ) : (
                          <ChevronDown size={16} color="#5e3f2d" />
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* host card */}
          <View style={styles.hostCard}>
            <LinearGradient
              colors={typeof ownerMatchPercent === 'number' ? ['#cbb59e', '#5e3f2d'] : ['#D1D5DB', '#9CA3AF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.hostMatchTab}
            >
              <Ticker value={ownerMatchDisplay} fontSize={15} staggerDuration={55} style={styles.hostMatchTabValue} />
              <Text style={styles.hostMatchTabLabel}>התאמה</Text>
            </LinearGradient>
            {/* Right: avatar */}
            <View style={styles.hostAvatarWrap}>
              <Image
                source={{
                  uri:
                    (owner as any)?.avatar_url ||
                    'https://cdn-icons-png.flaticon.com/512/847/847969.png',
                }}
                style={styles.hostAvatar}
              />
            </View>
            {/* Middle: labels */}
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.hostTitle}>בעל הדירה</Text>
              <Text style={styles.hostSub} numberOfLines={1}>{owner?.full_name || 'בעל הדירה'}</Text>
            </View>
          </View>

          {/* price card moved to floating overlay at bottom */}

          <View style={styles.section}>
            <View style={styles.whiteCard}>
              <Text style={styles.sectionTitle}>מה יש בדירה?</Text>
              <View style={styles.featuresGrid}>
                {(() => {
                  const balcony = typeof (apartment as any)?.balcony_count === 'number'
                    ? ((apartment as any).balcony_count as number)
                    : 0;
                  const items: Array<{ key: string; label: string; Icon: any }> = [];

                  if (balcony > 0) {
                    items.push({
                      key: 'balcony_count',
                      label: balcony === 1 ? 'מרפסת' : `${balcony} מרפסות`,
                      Icon: Home,
                    });
                  }
                  if ((apartment as any)?.wheelchair_accessible) items.push({ key: 'wheelchair_accessible', label: 'גישה לנכים', Icon: Accessibility });
                  if ((apartment as any)?.has_air_conditioning) items.push({ key: 'has_air_conditioning', label: 'מיזוג', Icon: Snowflake });
                  if ((apartment as any)?.has_bars) items.push({ key: 'has_bars', label: 'סורגים', Icon: Fence });
                  if ((apartment as any)?.has_solar_heater) items.push({ key: 'has_solar_heater', label: 'דוד שמש', Icon: Sun });
                  if ((apartment as any)?.is_furnished) items.push({ key: 'is_furnished', label: 'ריהוט', Icon: Sofa });
                  if ((apartment as any)?.has_safe_room) items.push({ key: 'has_safe_room', label: 'ממ״ד', Icon: Shield });
                  if ((apartment as any)?.is_renovated) items.push({ key: 'is_renovated', label: 'משופצת', Icon: Hammer });
                  if ((apartment as any)?.pets_allowed) items.push({ key: 'pets_allowed', label: 'חיות מחמד', Icon: PawPrint });
                  if ((apartment as any)?.has_elevator) items.push({ key: 'has_elevator', label: 'מעלית', Icon: ArrowUpDown });
                  if ((apartment as any)?.kosher_kitchen) items.push({ key: 'kosher_kitchen', label: 'מטבח כשר', Icon: Utensils });

                  if (!items.length) {
                    return (
                      <View style={styles.featuresEmptyWrap}>
                        <View style={styles.featuresEmptyIconPill}>
                          <Info size={18} color="#5e3f2d" />
                        </View>
                        <Text style={styles.featuresEmptyTitle}>לא צוינו מאפיינים</Text>
                        <Text style={styles.featuresEmptyText}>
                          בעל הדירה עדיין לא הוסיף פירוט על מה יש בדירה.
                        </Text>
                      </View>
                    );
                  }

                  return items.map(({ key, label, Icon }) => (
                    <View key={`feat-${key}`} style={styles.featureLine}>
                      <Icon size={20} color="#5e3f2d" />
                      <Text style={styles.featureText}>{label}</Text>
                    </View>
                  ));
                })()}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.whiteCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>מיקום</Text>
              </View>
              <View style={[styles.mapCard, { height: mapCardHeight }]}>
                {!mapboxToken ? (
                  <View style={styles.mapFallback}>
                    <Text style={styles.mapFallbackText}>חסר EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN</Text>
                  </View>
                ) : isGeocoding ? (
                  <View style={styles.mapFallback}>
                    <ActivityIndicator size="small" color="#5e3f2d" />
                    <Text style={styles.mapFallbackText}>טוען מפה…</Text>
                  </View>
                ) : geoError ? (
                  <View style={styles.mapFallback}>
                    <Text style={styles.mapFallbackText}>{geoError}</Text>
                  </View>
                ) : (
                  <View style={styles.mapInner}>
                    {/* Non-interactive map: allow the page to scroll when swiping over the map */}
                    <View pointerEvents="none" style={{ flex: 1, alignSelf: 'stretch' }}>
                      <MapboxMap
                        accessToken={mapboxToken}
                        styleUrl={mapboxStyleUrl}
                        center={aptGeo ? ([aptGeo.lng, aptGeo.lat] as const) : undefined}
                        zoom={aptGeo ? 16.5 : 11}
                        points={aptGeo ? aptMapPoints : { type: 'FeatureCollection', features: [] }}
                      />
                    </View>
                    {/* City + address overlay (bottom-right) */}
                    {(String((apartment as any)?.city || '').trim() || String((apartment as any)?.address || '').trim()) ? (
                      <View style={styles.mapLocationBadge}>
                        <View style={styles.mapLocationIconPill}>
                          <MapPin size={14} color="#5e3f2d" />
                        </View>
                        <View style={styles.mapLocationTextWrap}>
                          <Text style={styles.mapLocationCity} numberOfLines={1}>
                            {String((apartment as any)?.city || '').trim()}
                          </Text>
                          <Text style={styles.mapLocationAddress} numberOfLines={1}>
                            {String((apartment as any)?.address || '').trim()}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.mapNavPill}
                          onPress={openNavigationPicker}
                          activeOpacity={0.9}
                          accessibilityRole="button"
                          accessibilityLabel="פתח ניווט"
                        >
                          <View style={styles.mapNavIconWrap}>
                            <MapPin size={14} color="#FFFFFF" />
                          </View>
                          <Text style={styles.mapNavPillText}>ניווט</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {!aptGeo ? (
                      <View pointerEvents="none" style={styles.mapOverlayHint}>
                        <Text style={styles.mapOverlayHintText}>בחרנו להציג את המפה גם בלי נקודה — כדי לקבל נקודה ודא שכתובת+עיר תקינים</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            </View>
          </View>


          {/* Household section */}
          {(() => {
            const rawPeople = [
              owner
                ? {
                    id: (owner as any).id,
                    name: (owner as any).full_name || 'בעל הדירה',
                    avatar: (owner as any).avatar_url,
                    role: 'בעל דירה' as const,
                    age: (owner as any).age as number | undefined,
                  }
                : null,
              ...members.map((m) => ({
                id: m.id,
                name: (m as any).full_name || 'שותף',
                avatar: (m as any).avatar_url,
                role: 'שותף' as const,
                age: (m as any).age as number | undefined,
              })),
            ].filter(Boolean) as Array<{
              id: string;
              name: string;
              avatar?: string;
              role: 'שותף' | 'בעל דירה';
              age?: number;
            }>;

            // Deduplicate by id (owner first if duplicated)
            const seenIds = new Set<string>();
            const people = rawPeople.filter((p) => {
              if (seenIds.has(p.id)) return false;
              seenIds.add(p.id);
              return true;
            });

            if (!people.length) return null;
            return (
              <>
                <View style={styles.section}>
                  <View style={styles.whiteCard}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>מי בבית?</Text>
                      {typeof maxRoommates === 'number' ? (
                        <View style={styles.peopleCountPill}>
                          <Text style={styles.peopleCountText}>{`${roommatesCount}/${maxRoommates}`}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.peopleGrid}>
                      {people.map((p, idx) => {
                        const meta = typeof p.age === 'number' ? `${p.role} • ${p.age}` : p.role;
                        return (
                          <TouchableOpacity
                            key={`person-${p.id}-${idx}`}
                            style={styles.personCard}
                            activeOpacity={0.9}
                            onPress={() => {
                              router.push({ pathname: '/user/[id]', params: { id: p.id } });
                            }}
                          >
                            <View style={styles.personAvatarWrap}>
                              <Image
                                source={{ uri: p.avatar || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                                style={styles.personAvatar}
                              />
                            </View>
                            <Text style={styles.personName} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <Text style={styles.personMeta}>{meta}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </>
            );
          })()}

          {/* Availability card pinned at the bottom of the content (not floating) */}
          <View style={{ paddingBottom: (insets.bottom || 0) + 8 }}>
            <View style={styles.priceCard}>
              <View style={styles.priceRight}>
                <View style={[styles.statusChip, hasRequestedJoin ? styles.statusChipPending : styles.statusChipGreen]}>
                  <Text
                    style={[styles.statusChipText, hasRequestedJoin ? styles.statusChipTextPending : styles.statusChipTextGreen]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                  >
                    {hasRequestedJoin ? 'מחכים לאישור של בעל הדירה' : 'הגישו בקשה והצטרפו לדירה'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  if (hasRequestedJoin) {
                    // On web, RN Alert may be a no-op; use our custom confirm modal.
                    if (Platform.OS === 'web') {
                      setConfirmState({
                        visible: true,
                        title: 'ביטול בקשה',
                        message: 'לבטל את הבקשה להצטרף לדירה?',
                        confirmLabel: 'בטל בקשה',
                        cancelLabel: 'חזור',
                        onConfirm: cancelJoinRequest,
                      });
                    } else {
                      Alert.alert('ביטול בקשה', 'לבטל את הבקשה להצטרף לדירה?', [
                        { text: 'חזור', style: 'cancel' },
                        { text: 'בטל בקשה', style: 'destructive', onPress: cancelJoinRequest },
                      ]);
                    }
                    return;
                  }
                  handleRequestJoin();
                }}
                disabled={
                  isOwner ||
                  isMember ||
                  isRequestingJoin ||
                  // Only block "submit" if already assigned elsewhere; allow cancel regardless.
                  (!hasRequestedJoin && isAssignedAnywhere !== false)
                }
                style={[
                  styles.availabilityBtn,
                  (isOwner ||
                    isMember ||
                    isRequestingJoin ||
                    (!hasRequestedJoin && isAssignedAnywhere !== false))
                    ? { opacity: 0.6 }
                    : null,
                ]}
              >
                <Text style={styles.availabilityBtnText}>
                  {isOwner || isMember
                    ? 'בדוק זמינות'
                    : !hasRequestedJoin && isAssignedAnywhere !== false
                      ? 'לא זמין'
                      : isRequestingJoin
                        ? hasRequestedJoin
                          ? 'מבטל...'
                          : 'שולח...'
                        : hasRequestedJoin
                          ? 'בטל בקשה'
                          : 'הגש בקשה'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </ScrollView>
      {/* Join request is handled via the main CTA card at the bottom of the content */}

      {/* Members Modal */}
      <Modal visible={isMembersOpen} animationType="slide" transparent onRequestClose={() => setIsMembersOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsMembersOpen(false)} />

          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>שותפים</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sheetCount}>
                  {capacityLabel}
                </Text>
                <TouchableOpacity onPress={() => setIsMembersOpen(false)} style={styles.closeBtn}>
                  <X size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent}>
              {members.length > 0 ? (
                members.map((m) => (
                  <View key={m.id} style={styles.memberRow}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        setIsMembersOpen(false);
                        router.push({ pathname: '/user/[id]', params: { id: m.id } });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                    >
                      <Image
                        source={{ uri: (m as any).avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                        style={styles.avatarLarge}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.full_name}</Text>
                      </View>
                    </TouchableOpacity>
                    {isOwner && m.id !== apartment.owner_id ? (
                      <TouchableOpacity
                        onPress={() => confirmRemovePartner(m)}
                        style={styles.removeBtn}
                        activeOpacity={0.85}
                      >
                        <Trash2 size={16} color="#F87171" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.emptyMembers}>אין שותפים להצגה</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fullscreen image viewer with pinch-to-zoom */}
      <Modal visible={isViewerOpen} animationType="fade" transparent={false} onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerRoot} pointerEvents="box-none">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: viewerIndex * screenWidth, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              setViewerIndex(idx);
            }}
          >
            {galleryImages.map((_, idx) => {
              const uri = getImageForIndex(idx);
              return <ZoomableImage key={`viewer-${uri}-${idx}`} uri={uri} />;
            })}
          </ScrollView>
          <TouchableOpacity
            onPress={() => setViewerOpen(false)}
            style={[styles.viewerClose, { top: (insets.top || 0) + 12 }]}
            activeOpacity={0.9}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Add Partner Modal */}
      <Modal visible={isAddOpen} animationType="slide" transparent onRequestClose={() => setIsAddOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsAddOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={() => setIsAddOpen(false)} style={styles.closeBtn}>
                  <X size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.sheetCountPill}>
                  <Text style={styles.sheetCountText}>{filteredCandidates.length} מועמדים</Text>
                </View>
              </View>
              <Text style={styles.sheetTitle}>הוסף שותף</Text>
            </View>
            <View style={styles.searchWrap}>
              <Search size={16} color="#9DA4AE" style={{ marginRight: 8 }} />
              <TextInput
                value={addSearch}
                onChangeText={setAddSearch}
                placeholder="חיפוש לפי שם..."
                placeholderTextColor="#9DA4AE"
                style={styles.searchInput}
              />
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              {isAdding ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#5e3f2d" />
                </View>
              ) : (
                <>
                  {filteredSharedGroups.length > 0 ? (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.sectionHeading}>פרופיל משותף</Text>
                      <View style={{ gap: 8, marginTop: 8 }}>
                        {filteredSharedGroups.map((g) => {
                          const names = g.members.map((m) => m.full_name || 'משתמש').join(' • ');
                          const first = g.members[0];
                          const second = g.members[1];
                          const third = g.members[2];
                          return (
                            <TouchableOpacity
                              key={`shared-group-${g.id}`}
                              style={styles.candidateRow}
                              activeOpacity={0.9}
                              onPress={() =>
                                setConfirmState({
                                  visible: true,
                                  title: 'שליחת הזמנה לקבוצה',
                                  message: `לשלוח הזמנה לפרופיל המשותף (${names}) להצטרף כדיירים?`,
                                  confirmLabel: 'שלח הזמנה',
                                  cancelLabel: 'ביטול',
                                  onConfirm: () =>
                                    handleAddSharedGroup(
                                      g.id,
                                      (g.members || []).map((m) => m.id).filter(Boolean) as string[]
                                    ),
                                })
                              }
                            >
                              <TouchableOpacity
                                style={styles.candidateRight}
                                activeOpacity={0.85}
                                onPress={() =>
                                  setConfirmState({
                                    visible: true,
                                    title: 'שליחת הזמנה לקבוצה',
                                    message: `לשלוח הזמנה לפרופיל המשותף (${names}) להצטרף כדיירים?`,
                                    confirmLabel: 'שלח הזמנה',
                                    cancelLabel: 'ביטול',
                                    onConfirm: () =>
                                      handleAddSharedGroup(
                                        g.id,
                                        (g.members || []).map((m) => m.id).filter(Boolean) as string[]
                                      ),
                                  })
                                }
                                accessibilityRole="button"
                                accessibilityLabel="שלח הזמנה לפרופיל משותף"
                              >
                                <UserPlus size={16} color="#5e3f2d" />
                              </TouchableOpacity>
                              <View style={styles.groupAvatarLeft}>
                                <View style={styles.groupAvatarStack}>
                                  {third ? (
                                    <Image
                                      source={{ uri: (third as any).avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                                      style={styles.groupAvatarSm}
                                    />
                                  ) : null}
                                  {second ? (
                                    <Image
                                      source={{ uri: (second as any).avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                                      style={styles.groupAvatarMd}
                                    />
                                  ) : null}
                                  {first ? (
                                    <Image
                                      source={{ uri: (first as any).avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                                      style={styles.groupAvatarLg}
                                    />
                                  ) : null}
                                </View>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.candidateName} numberOfLines={1}>{names}</Text>
                                <View style={styles.candidateBadges}>
                                  <View style={styles.candidateBadge}><Text style={styles.candidateBadgeText}>פרופיל משותף</Text></View>
                                </View>
                              </View>
                              
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                  {filteredCandidates.length > 0 ? (
                    filteredCandidates.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.candidateRow}
                        activeOpacity={0.9}
                        onPress={() => confirmAddPartner(u)}
                      >
                        <TouchableOpacity
                          style={styles.candidateRight}
                          activeOpacity={0.85}
                          onPress={() => confirmAddPartner(u)}
                          accessibilityRole="button"
                          accessibilityLabel="שלח הזמנה"
                        >
                          <UserPlus size={16} color="#5e3f2d" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.candidateName} numberOfLines={1}>{u.full_name}</Text>
                          <View style={styles.candidateBadges}>
                            <View style={styles.candidateBadge}><Text style={styles.candidateBadgeText}>זמין</Text></View>
                            <View style={styles.candidateBadge}><Text style={styles.candidateBadgeText}>מתאים</Text></View>
                          </View>
                        </View>
                        <View style={styles.candidateLeft}>
                          <Image
                            source={{ uri: (u as any).avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.candidateAvatar}
                          />
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.emptyMembers}>לא נמצאו תוצאות</Text>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirm Modal (RTL) */}
      <Modal
        visible={confirmState.visible}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmState((s) => ({ ...s, visible: false }))}
      >
        <View style={styles.confirmOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdrop}
            activeOpacity={1}
            onPress={() => setConfirmState((s) => ({ ...s, visible: false }))}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{confirmState.title}</Text>
            <Text style={styles.confirmMessage}>{confirmState.message}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmCancel]}
                onPress={() => setConfirmState((s) => ({ ...s, visible: false }))}
                activeOpacity={0.9}
              >
                <Text style={styles.confirmCancelText}>{confirmState.cancelLabel || 'ביטול'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  styles.confirmApprove,
                  (confirmState.confirmLabel || '').includes('הסר') || (confirmState.title || '').includes('הסרה')
                    ? styles.confirmApproveDestructive
                    : styles.confirmApprovePrimary,
                ]}
                onPress={() => {
                  const fn = confirmState.onConfirm;
                  setConfirmState((s) => ({ ...s, visible: false }));
                  fn?.();
                }}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.confirmApproveText,
                    (confirmState.confirmLabel || '').includes('הסר') || (confirmState.title || '').includes('הסרה')
                      ? styles.confirmApproveDestructiveText
                      : styles.confirmApprovePrimaryText,
                  ]}
                >
                  {confirmState.confirmLabel || 'אישור'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Navigation picker (nice-looking bottom sheet) */}
      <Modal visible={isNavOpen} transparent animationType="fade" onRequestClose={() => setIsNavOpen(false)}>
        <View style={styles.navOverlay}>
          <TouchableOpacity style={styles.navBackdrop} activeOpacity={1} onPress={() => setIsNavOpen(false)} />
          <View style={[styles.navSheet, { paddingBottom: 12 + (insets.bottom || 0) }]}>
            <View style={styles.navHeaderRow}>
              <Text style={styles.navTitle}>ניווט</Text>
              <TouchableOpacity onPress={() => setIsNavOpen(false)} style={styles.navCloseBtn} activeOpacity={0.9}>
                <X size={18} color="#111827" />
              </TouchableOpacity>
            </View>
            {!!navDestination ? (
              <Text style={styles.navSubtitle} numberOfLines={2}>
                {navDestination}
              </Text>
            ) : null}

            {(() => {
              const encoded = encodeURIComponent(navDestination || '');
              const urls = {
                waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
                google: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
                apple: `http://maps.apple.com/?daddr=${encoded}`,
              } as const;
              return (
                <View style={styles.navButtons}>
                  <TouchableOpacity style={styles.navBtn} activeOpacity={0.9} onPress={() => openNavUrl(urls.waze)}>
                    <View style={styles.navBtnIcon}>
                      <Text style={styles.navBtnIconText}>W</Text>
                    </View>
                    <Text style={styles.navBtnText}>Waze</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navBtn} activeOpacity={0.9} onPress={() => openNavUrl(urls.google)}>
                    <View style={styles.navBtnIcon}>
                      <Text style={styles.navBtnIconText}>G</Text>
                    </View>
                    <Text style={styles.navBtnText}>Google Maps</Text>
                  </TouchableOpacity>
                  {Platform.OS === 'ios' ? (
                    <TouchableOpacity style={styles.navBtn} activeOpacity={0.9} onPress={() => openNavUrl(urls.apple)}>
                      <View style={styles.navBtnIcon}>
                        <Text style={styles.navBtnIconText}></Text>
                      </View>
                      <Text style={styles.navBtnText}>Apple Maps</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={[styles.navBtn, styles.navBtnCancel]} activeOpacity={0.9} onPress={() => setIsNavOpen(false)}>
                    <Text style={[styles.navBtnText, styles.navBtnCancelText]}>ביטול</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useRef(new (require('react-native').Animated.Value)(1)).current;
  const baseScale = useRef(1);
  const AnimatedImage = require('react-native').Animated.createAnimatedComponent(Image);

  const onPinchEvent = require('react-native').Animated.event(
    [{ nativeEvent: { scale } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (e: any) => {
    if (e.nativeEvent.state === State.END || e.nativeEvent.oldState === State.ACTIVE) {
      // clamp and keep scale within 1..4
      let next = baseScale.current * e.nativeEvent.scale;
      if (next < 1) next = 1;
      if (next > 4) next = 4;
      baseScale.current = next;
      scale.setValue(next);
    } else if (e.nativeEvent.state === State.BEGAN) {
      // no-op
    }
  };

  return (
    <View style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height, alignItems: 'center', justifyContent: 'center' }}>
      <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onHandlerStateChange}>
        <AnimatedImage
          source={{ uri }}
          style={{ width: '100%', height: '100%', transform: [{ scale }], resizeMode: 'contain' }}
        />
      </PinchGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  addAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginLeft: -10,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  galleryContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  slide: {
    width: '100%',
  },
  image: {
    width: '100%',
    height: 480,
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  topControlsRow: {
    position: 'absolute',
    top: 68,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftControls: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  circleBtnLight: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        }
      : { elevation: 8 }),
  },
  topHeader: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    writingDirection: 'rtl',
  },
  heroPriceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroPriceMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'flex-start',
    gap: 8,
  },
  heroFavBtn: {
    backgroundColor: '#FFFFFF',
  },
  heroPriceValue: {
    color: '#5e3f2d',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    writingDirection: 'ltr',
  },
  heroCurrency: {
    color: '#5e3f2d',
    fontSize: 22,
    fontWeight: '900',
  },
  heroPricePer: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  heroLocationRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  heroLocationIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  heroLocationText: {
    flex: 1,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(15,15,20,0.06)',
    backgroundColor: '#FFFFFF',
  },
  moreAvatar: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderColor: 'rgba(15,15,20,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreAvatarText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  dotsWrap: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  infoCard: {
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  dotLight: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginHorizontal: 3,
  },
  dotActiveLight: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 3,
  },
  topActionsRow: {
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
    borderRadius: 12,
  },
  actionBtnDangerText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '900',
  },
  heroTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tagsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  tagText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  readMoreBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'transparent',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  readMoreText: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mapHeaderIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
  },
  mapHeaderTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapHeaderSubtitle: {
    marginTop: 2,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  content: {
    padding: 20,
  },

  statsRowLight: { flexDirection: 'row-reverse', gap: 12, marginBottom: 12 },
  statLight: {
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
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,63,45,0.08)',
    marginBottom: 8,
  },
  statLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: { color: '#111827', fontWeight: '800', fontSize: 14 },
  statNumber: { color: '#111827', fontWeight: '900', fontSize: 16 },
  hostCard: {
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingRight: 12,
    // Reserve space for the match tab on the left side
    paddingLeft: 12 + 78,
    marginBottom: 12,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }
      : { elevation: 4 }),
  },
  hostMatchTab: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    // Inner edge stays straight (attached look)
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  hostMatchTabValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  hostMatchTabLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    includeFontPadding: false,
    textAlign: 'center',
  },
  hostIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  hostAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(94,63,45,0.25)',
  },
  hostAvatar: { width: '100%', height: '100%' },
  hostTitle: { color: '#111827', fontSize: 13, fontWeight: '800' },
  hostSub: { color: '#6B7280', fontSize: 12 },
  proBadge: {
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderColor: 'rgba(94,63,45,0.25)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proBadgeText: { color: '#5e3f2d', fontSize: 11, fontWeight: '900' },
  priceCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }
      : { elevation: 4 }),
  },
  priceRight: { flex: 1, alignItems: 'flex-end', gap: 6 },
  priceValue: { color: '#0B1220', fontSize: 20, fontWeight: '800' },
  currencySign: { color: '#0B1220', fontSize: 18, fontWeight: '800' },
  pricePerUnit: { color: '#6B7280', fontSize: 13, marginTop: 2, marginBottom: 6 },
  pricePerInline: { color: '#6B7280', fontSize: 13, fontWeight: '600', marginLeft: 6 },
  statusChip: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexShrink: 1,
    maxWidth: 260,
  },
  statusChipGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusChipPending: {
    backgroundColor: '#E5E7EB',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 15,
    includeFontPadding: false,
    flexShrink: 1,
  },
  statusChipTextGreen: {
    color: '#16A34A',
  },
  statusChipTextPending: {
    color: '#374151',
  },
  availabilityBtn: {
    backgroundColor: '#5e3f2d',
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#5e3f2d',
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        }
      : { elevation: 6 }),
  },
  availabilityBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', includeFontPadding: false, lineHeight: 16 },
  section: {
    marginTop: 12,
    marginBottom: 16,
  },
  whiteCard: {
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
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  peopleCountPill: {
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  peopleCountText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  navPill: {
    backgroundColor: '#5e3f2d',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#5e3f2d',
          shadowOpacity: 0.22,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 5 },
        }
      : { elevation: 5 }),
  },
  navPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 16,
  },
  navIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  navOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  navBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  navSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -6 },
        }
      : { elevation: 12 }),
  },
  navHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  navTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  navSubtitle: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  navButtons: {
    marginTop: 14,
    gap: 10,
  },
  navBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  navBtnCancel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
  },
  navBtnText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  navBtnCancelText: {
    color: '#374151',
    textAlign: 'center',
  },
  navBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.14)',
  },
  navBtnIconText: {
    color: '#5e3f2d',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  descriptionLight: { fontSize: 15, color: '#374151', lineHeight: 22, textAlign: 'right', writingDirection: 'rtl' },

  featuresGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 10,
    gap: 12,
  },
  featureLine: {
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
  featureText: { color: '#111827', fontSize: 14, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  featuresEmpty: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  featuresEmptyWrap: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuresEmptyIconPill: {
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
  featuresEmptyTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  featuresEmptyText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  mapCard: {
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  mapInner: {
    flex: 1,
    alignSelf: 'stretch',
  },
  mapOverlayHint: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mapLocationBadge: {
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
  mapLocationIconPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(94,63,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.14)',
  },
  mapLocationTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  mapLocationCity: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapLocationAddress: {
    marginTop: 2,
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapNavPill: {
    backgroundColor: '#5e3f2d',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapNavPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 16,
  },
  mapNavIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  mapOverlayHintText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  mapFallbackText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  peopleGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  personCard: {
    width: '48%',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 0,
  },
  personAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
  },
  personAvatar: { width: '100%', height: '100%' },
  personName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 2,
  },
  personMeta: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
  joinBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.45)',
  },
  joinBtnDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(94,63,45,0.25)',
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 0,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    gap: 12,
    // bottom offset is applied inline to respect safe area
    zIndex: 100,
    elevation: 8,
  },
  // deprecated old bottom action buttons kept for potential reuse
  editButton: {
    flex: 1,
    backgroundColor: '#5e3f2d',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17,24,39,0.45)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    height: '75%',
    writingDirection: 'rtl',
    borderWidth: 0,
    ...(Platform.OS === 'android'
      ? { elevation: 18 }
      : {
          shadowColor: '#111827',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -8 },
        }),
  },
  sheetScroll: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#5e3f2d',
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetCount: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  sheetCountText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '900',
  },
  sectionHeading: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    writingDirection: 'rtl',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    ...(Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#111827',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    textAlign: 'right',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 0,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 0,
    ...(Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#111827',
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  candidateLeft: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  candidateAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  candidateRight: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.45)',
  },
  candidateName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
  },
  candidateBadges: {
    flexDirection: 'row-reverse',
    gap: 6,
  },
  candidateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.35)',
  },
  candidateBadgeText: {
    color: '#5e3f2d',
    fontSize: 11,
    fontWeight: '700',
  },
  groupAvatarLeft: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarStack: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  groupAvatarLg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#F3F4F6',
  },
  groupAvatarMd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#F3F4F6',
  },
  groupAvatarSm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#F3F4F6',
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1F1F29',
  },
  memberName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  memberEmail: {
    color: '#9DA4AE',
    fontSize: 13,
    textAlign: 'right',
  },
  emptyMembers: {
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 12,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
  },
  // Confirm modal styles
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  confirmBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    writingDirection: 'rtl',
    ...(Platform.OS === 'android'
      ? { elevation: 12 }
      : {
          shadowColor: '#111827',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        }),
  },
  confirmTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'right',
  },
  confirmMessage: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    textAlign: 'right',
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancel: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  confirmApprove: {
    borderWidth: 1,
  },
  confirmCancelText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  confirmApproveText: {
    fontSize: 15,
    fontWeight: '900',
  },
  confirmApprovePrimary: {
    backgroundColor: '#5e3f2d',
    borderColor: '#5e3f2d',
  },
  confirmApprovePrimaryText: {
    color: '#FFFFFF',
  },
  confirmApproveDestructive: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.28)',
  },
  confirmApproveDestructiveText: {
    color: '#DC2626',
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
  },
  viewerCloseText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
  },
});




