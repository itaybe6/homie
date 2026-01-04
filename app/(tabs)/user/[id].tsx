import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { User } from '@/types/database';
import { ArrowLeft, MapPin, UserPlus2, Cigarette, PawPrint, Utensils, Moon, Users, Home, Calendar, User as UserIcon, Building2, Bed, Heart, Briefcase, ClipboardList, Images, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';
import { UserSurveyResponse } from '@/types/database';
import Ticker from '@/components/Ticker';
import { KeyFabPanel } from '@/components/KeyFabPanel';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import DonutChart from '@/components/DonutChart';
import {
  calculateMatchScore,
  CompatUserSurvey,
  DietType,
  Lifestyle,
  CleaningFrequency,
  HostingPreference,
  CookingStyle,
  HomeVibe,
  PartnerSmokingPref,
  PartnerShabbatPref,
  PartnerDietPref,
  PartnerPetsPref,
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
  if (value && value.includes('worker')) return 'worker';
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

function buildCompatSurvey(
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
  if (survey?.lifestyle) compat.lifestyle = survey.lifestyle as Lifestyle;
  if (typeof survey?.cleanliness_importance === 'number') compat.cleanliness_importance = survey.cleanliness_importance;
  if (survey?.cleaning_frequency) compat.cleaning_frequency = survey.cleaning_frequency as CleaningFrequency;
  if (survey?.hosting_preference) compat.hosting_preference = survey.hosting_preference as HostingPreference;
  if (survey?.cooking_style) compat.cooking_style = survey.cooking_style as CookingStyle;
  if (survey?.home_vibe) compat.home_vibe = survey.home_vibe as HomeVibe;
  if (survey?.preferred_city) compat.preferred_city = survey.preferred_city;
  if (Array.isArray((survey as any)?.preferred_neighborhoods))
    compat.preferred_neighborhoods = (survey as any).preferred_neighborhoods;
  if (Number.isFinite(survey?.price_range as number)) compat.price_range = Number(survey?.price_range);
  if (typeof survey?.bills_included === 'boolean') compat.bills_included = survey.bills_included;
  if (survey?.floor_preference) compat.floor_preference = survey.floor_preference;
  if (typeof survey?.has_balcony === 'boolean') compat.has_balcony = survey.has_balcony;
  if (typeof survey?.has_elevator === 'boolean') compat.has_elevator = survey.has_elevator;
  if (typeof survey?.wants_master_room === 'boolean') compat.wants_master_room = survey.wants_master_room;
  if (typeof survey?.pets_allowed === 'boolean') compat.pets_allowed = survey.pets_allowed;
  if (typeof survey?.with_broker === 'boolean') compat.with_broker = survey.with_broker;
  if (typeof survey?.preferred_roommates === 'number') compat.preferred_roommates = survey.preferred_roommates;
  if (survey?.move_in_month) compat.move_in_month = survey.move_in_month;
  if (typeof survey?.is_sublet === 'boolean') compat.is_sublet = survey.is_sublet;
  if (survey?.sublet_month_from) compat.sublet_month_from = survey.sublet_month_from;
  if (survey?.sublet_month_to) compat.sublet_month_to = survey.sublet_month_to;
  if (survey?.relationship_status) compat.relationship_status = survey.relationship_status;
  const occupationValue = normalizeOccupationValue(survey?.occupation);
  if (occupationValue) compat.occupation = occupationValue;
  if (typeof survey?.works_from_home === 'boolean') compat.works_from_home = survey.works_from_home;

  if (survey?.partner_smoking_preference)
    compat.partner_smoking_preference = survey.partner_smoking_preference as PartnerSmokingPref;
  if (survey?.partner_pets_preference)
    compat.partner_pets_preference = survey.partner_pets_preference as PartnerPetsPref;
  if (survey?.partner_diet_preference)
    compat.partner_diet_preference = survey.partner_diet_preference as PartnerDietPref;
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
}

export default function UserProfileScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams() as { id?: string | string[]; from?: string };
  const routeUserId = React.useMemo(() => {
    if (!id) return undefined;
    if (Array.isArray(id)) return id[0];
    return id;
  }, [id]);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const contentTopPadding = 12;
  const contentBottomPadding = Math.max(180, insets.bottom + 120);

  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [surveyActiveSection, setSurveyActiveSection] = useState<'about' | 'apartment' | 'partner'>('about');
  const segW = useSharedValue(1);
  const tabIdx = useSharedValue(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const me = useAuthStore((s) => s.user);
  type GroupMember = Pick<User, 'id' | 'full_name' | 'avatar_url'>;
  const [groupContext, setGroupContext] = useState<{ name?: string | null; members: GroupMember[] } | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [survey, setSurvey] = useState<UserSurveyResponse | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [matchPercent, setMatchPercent] = useState<number | null>(null);
  const [matchPercentDisplay, setMatchPercentDisplay] = useState<string>('--%');
  const [matchTickerReady, setMatchTickerReady] = useState(false);
  const [hasPendingMergeInvite, setHasPendingMergeInvite] = useState(false);
  const [meInApartment, setMeInApartment] = useState(false);
  const [profileInApartment, setProfileInApartment] = useState(false);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);
  type ProfileApartment = {
    id: string;
    title?: string | null;
    city?: string | null;
    image_urls?: any;
    bedrooms?: number | null;
    bathrooms?: number | null;
    owner_id?: string | null;
    partner_ids?: (string | null)[] | null;
  };
  const [profileApartments, setProfileApartments] = useState<ProfileApartment[]>([]);
  const [profileAptLoading, setProfileAptLoading] = useState(false);
  const [apartmentOccupants, setApartmentOccupants] = useState<Record<string, GroupMember[]>>({});
  useEffect(() => {
    console.log('[profile-screen] render snapshot', {
      routeUserId,
      profileId: profile?.id,
    });
  }, [routeUserId, profile?.id]);

  // Delay the match % animation a bit after the screen mounts (feels nicer)
  useEffect(() => {
    // Reset per profile so it always feels intentional when navigating between users
    setMatchTickerReady(false);
    const t = setTimeout(() => setMatchTickerReady(true), 2700);
    return () => clearTimeout(t);
  }, [profile?.id]);
  const showMergeBlockedAlert = () => {
    const title = 'לא ניתן למזג פרופילים';
    const msg =
      'אי אפשר למזג פרופילים כאשר לשני המשתמשים כבר יש דירה משויכת (כבעלים או כשותפים). כדי למזג, יש להסיר את השיוך לדירה מאחד הצדדים תחילה.';
    try {
      Alert.alert(title, msg);
    } catch {
      try {
        // Fallback for web or environments where Alert fails
        // eslint-disable-next-line no-alert
        (globalThis as any)?.alert ? (globalThis as any).alert(`${title}\n\n${msg}`) : (window as any)?.alert?.(`${title}\n\n${msg}`);
      } catch {}
    }
    // Always also surface an inline notice so the user gets feedback even if popups are blocked
    setMergeNotice(msg);
    // Auto dismiss after 5s
    try {
      setTimeout(() => setMergeNotice((curr) => (curr === msg ? null : curr)), 5000);
    } catch {}
  };

  const APT_IMAGE_PLACEHOLDER =
    'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  const transformSupabaseImageUrl = (value: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    // Accept already-absolute URLs (including render/object public URLs)
    if (trimmed.includes('/storage/v1/object/public/')) {
      const [base, query] = trimmed.split('?');
      const transformed = base.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const params: string[] = [];
      if (query) {
        params.push(query);
      }
      params.push('width=800', 'quality=85');
      return `${transformed}?${params.join('&')}`;
    }
    return trimmed;
  };

  const normalizeSupabasePublicUrlForFallback = (value: string): string => {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    // Convert render URL back to object/public URL for reliable fallback
    if (trimmed.includes('/storage/v1/render/image/public/')) {
      const base = trimmed.split('?')[0];
      return base.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
    }
    return trimmed.split('?')[0];
  };

  // Apartments may store either full public URLs OR storage object paths (e.g. "apartments/<userId>/<file>.jpg").
  // This helper normalizes both into a displayable URL.
  const resolveApartmentImageCandidate = (value: string): string => {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    // Absolute URL
    if (/^https?:\/\//i.test(trimmed)) {
      return normalizeSupabasePublicUrlForFallback(trimmed);
    }

    // If someone stored a bucket-prefixed path, strip the bucket name.
    // Example: "apartment-images/apartments/..." -> "apartments/..."
    const normalizedPath = trimmed.startsWith('apartment-images/')
      ? trimmed.replace(/^apartment-images\//, '')
      : trimmed;

    try {
      const { data } = supabase.storage.from('apartment-images').getPublicUrl(normalizedPath);
      const pub = (data as any)?.publicUrl as string | undefined;
      return pub ? normalizeSupabasePublicUrlForFallback(pub) : '';
    } catch {
      return '';
    }
  };

  const ApartmentImageThumb = ({
    uri,
    style,
  }: {
    uri: string;
    style?: any;
  }) => {
    const [candidateIdx, setCandidateIdx] = useState(0);
    const original = normalizeSupabasePublicUrlForFallback(uri || '');
    const transformed = original ? transformSupabaseImageUrl(original) : '';
    const candidates = [
      transformed,
      original,
      APT_IMAGE_PLACEHOLDER,
    ].map((u) => (u || '').trim()).filter(Boolean);
    const resolved = candidates[Math.min(candidateIdx, candidates.length - 1)] || APT_IMAGE_PLACEHOLDER;

    useEffect(() => {
      setCandidateIdx(0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uri]);
    return (
      <Image
        source={{ uri: resolved }}
        style={style}
        resizeMode="cover"
        onError={() => setCandidateIdx((i) => Math.min(i + 1, candidates.length - 1))}
      />
    );
  };


  const normalizeImageUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .filter((u) => typeof u === 'string' && !!(u as string).trim()) as string[];
    }
    if (typeof value === 'string') {
      // Try JSON first
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((u: any) => typeof u === 'string' && !!u.trim());
        }
      } catch {
        // Not JSON – try Postgres array literal format: {"a","b"} or {a,b}
        try {
          const cleaned = value.replace(/^\s*\{|\}\s*$/g, '');
          if (!cleaned) return [];
          return cleaned
            .split(',')
            .map((s) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  const normalizePartnerIds = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .map((id) => {
          if (typeof id === 'string') return id.trim();
          if (id === null || id === undefined) return '';
          return String(id).trim();
        })
        .filter(Boolean) as string[];
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((id: unknown) => {
              if (typeof id === 'string') return id.trim();
              if (id === null || id === undefined) return '';
              return String(id).trim();
            })
            .filter(Boolean) as string[];
        }
      } catch {
        try {
          const cleaned = value.replace(/^\s*\{|\}\s*$/g, '');
          if (!cleaned) return [];
          return cleaned
            .split(',')
            .map((s) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  useEffect(() => {
    (async () => {
      try {
        if (!routeUserId) {
          setProfile(null);
          return;
        }
        const { data, error } = await supabase.from('users').select('*').eq('id', routeUserId).maybeSingle();
        if (error) throw error;
        setProfile(data);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [routeUserId]);

  // Re-fetch group context when screen regains focus (after approvals, etc.)
  useFocusEffect(
    React.useCallback(() => {
      setGroupRefreshKey((k) => k + 1);
      return () => {};
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    const fetchGroupContext = async (userId: string) => {
      setGroupLoading(true);
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', userId)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const membership = (membershipRows || [])[0];
        if (!membership?.group_id) {
          if (!cancelled) setGroupContext(null);
          return;
        }
        const groupId = membership.group_id as string;

        const { data: groupRow, error: groupError } = await supabase
          .from('profile_groups')
          .select('id, name')
          .eq('id', groupId)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (groupError) throw groupError;
        if (!groupRow) {
          if (!cancelled) setGroupContext(null);
          return;
        }

        const { data: memberRows, error: memberError } = await supabase
          .from('profile_group_members')
          .select('user_id')
          .eq('group_id', groupId)
          .eq('status', 'ACTIVE');
        if (memberError) throw memberError;
        const memberIds = (memberRows || []).map((row: any) => row.user_id).filter(Boolean);
        if (memberIds.length < 2) {
          if (!cancelled) setGroupContext(null);
          return;
        }

        const { data: usersRows, error: usersError } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', memberIds);
        if (usersError) throw usersError;
        const members = (usersRows || []) as GroupMember[];
        if (members.length < 2) {
          if (!cancelled) setGroupContext(null);
          return;
        }
        const sortedMembers = [...members].sort((a, b) => {
          if (a.id === userId) return -1;
          if (b.id === userId) return 1;
          return (a.full_name || '').localeCompare(b.full_name || '');
        });
        if (!cancelled) setGroupContext({ name: (groupRow as any)?.name, members: sortedMembers });
      } catch (error) {
        console.error('Failed to load group context', error);
        if (!cancelled) setGroupContext(null);
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    };

    if (profile?.id) {
      fetchGroupContext(profile.id);
    } else {
      setGroupContext(null);
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.id, groupRefreshKey]);

  // Subscribe to realtime changes in group memberships to refresh UI instantly
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const channel = supabase
        .channel(`user-${profile.id}-group-memberships`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profile_group_members',
            filter: `user_id=eq.${profile.id}`,
          },
          () => {
            setGroupRefreshKey((k) => k + 1);
          }
        )
        .subscribe((status) => {
          // noop; subscription established
        });
      return () => {
        try {
          supabase.removeChannel(channel);
        } catch {}
      };
    } catch {
      // ignore
    }
  }, [profile?.id, routeUserId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.id) {
        setSurvey(null);
        setSurveyError(null);
        return;
      }
      try {
        setSurveyLoading(true);
        setSurveyError(null);
        const s = await fetchUserSurvey(profile.id);
        if (!cancelled) setSurvey(s);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load survey', e);
        if (!cancelled) {
          setSurvey(null);
          setSurveyError((e as any)?.message || 'לא ניתן לטעון את השאלון');
        }
      } finally {
        if (!cancelled) setSurveyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Match % (reuse the same logic as the partners screen)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const myId = me?.id ? String(me.id) : '';
      const otherId = profile?.id ? String(profile.id) : '';
      if (!myId || !otherId || myId === otherId) {
        if (!cancelled) setMatchPercent(null);
        return;
      }
      try {
        const { data: rows, error } = await supabase
          .from('user_survey_responses')
          .select('*')
          .in('user_id', [myId, otherId]);
        if (error) throw error;
        const byId = Object.fromEntries((rows || []).map((r: any) => [String(r.user_id), r])) as Record<
          string,
          UserSurveyResponse
        >;
        const mySurvey = byId[myId];
        const theirSurvey = byId[otherId];
        if (!mySurvey || !theirSurvey) {
          if (!cancelled) setMatchPercent(null);
          return;
        }
        const myCompat = buildCompatSurvey(me as any, mySurvey);
        const theirCompat = buildCompatSurvey(profile as any, theirSurvey);
        const score = calculateMatchScore(myCompat, theirCompat);
        const rounded =
          Number.isFinite(score) && !Number.isNaN(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
        if (!cancelled) setMatchPercent(rounded);
      } catch (e) {
        console.error('[profile-screen] failed to compute match %', e);
        if (!cancelled) setMatchPercent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, profile?.id]);

  // Animate the displayed % so it "counts" from 0 -> target (odometer style), after a short delay.
  useEffect(() => {
    let t: any;
    if (typeof matchPercent !== 'number' || !Number.isFinite(matchPercent)) {
      setMatchPercentDisplay('--%');
      return () => {};
    }
    const digitsLen = String(matchPercent).length;
    const start = `${'0'.repeat(digitsLen)}%`;
    const end = `${matchPercent}%`;
    // Before we're "ready", keep it at 00% (or 000%) and wait.
    setMatchPercentDisplay(start);
    if (!matchTickerReady) return () => {};
    t = setTimeout(() => setMatchPercentDisplay(end), 120);
    return () => {
      try {
        clearTimeout(t);
      } catch {}
    };
  }, [matchPercent, matchTickerReady]);

  const formatYesNo = (value?: boolean | null): string => {
    if (value === undefined || value === null) return '';
    return value ? 'כן' : 'לא';
  };

  const formatTriBool = (value?: boolean | null): string => {
    if (value === undefined || value === null) return 'לא משנה לי';
    return value ? 'כן' : 'לא';
  };

  const formatMonthLabel = (value?: string | null): string => {
    if (!value) return '';
    const [year, month] = value.split('-');
    if (year && month) {
      const yearNum = parseInt(year, 10);
      const monthNum = parseInt(month, 10) - 1;
      if (!Number.isNaN(yearNum) && !Number.isNaN(monthNum)) {
        const date = new Date(yearNum, monthNum, 1);
        if (!Number.isNaN(date.getTime())) {
          try {
            return date.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
          } catch {
            return `${month}/${year.slice(-2)}`;
          }
        }
      }
    }
    return value;
  };

  const formatCurrency = (value?: number | null): string => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    try {
      return new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `₪${value}`;
    }
  };

  const normalizeNeighborhoods = (value: any): string => {
    if (!value) return '';
    if (Array.isArray(value)) return value.filter(Boolean).join(' • ');
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(' • ');
      } catch {}
      return value
        .replace(/[{}\[\]"]/g, ' ')
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(' • ');
    }
    return '';
  };

  const surveyHighlights = useMemo(() => {
    if (!survey) return [];
    const highlights: { label: string; value: string }[] = [];
    const push = (label: string, raw?: string) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      highlights.push({ label, value: trimmed });
    };

    push('עיר מועדפת', survey.preferred_city || undefined);
    if (typeof survey.price_range === 'number') {
      const formatted = formatCurrency(survey.price_range);
      push('תקציב חודשי', formatted);
    }
    push('כניסה מתוכננת', formatMonthLabel(survey.move_in_month));
    push('וייב יומיומי', survey.lifestyle || survey.home_vibe || undefined);
    if (survey.is_sublet) highlights.push({ label: 'סאבלט', value: 'כן' });
    return highlights;
  }, [survey]);

  type SurveySectionKey = 'about' | 'apartment' | 'partner';

  const surveyItems = useMemo(() => {
    if (!survey) return [];
    const items: { section: SurveySectionKey; label: string; value: string }[] = [];

    const add = (section: SurveySectionKey, label: string, raw?: string | number | null) => {
      if (raw === undefined || raw === null) return;
      const value =
        typeof raw === 'string'
          ? raw.trim()
          : typeof raw === 'number' && Number.isFinite(raw)
            ? `${raw}`
            : '';
      if (!value) return;
      items.push({ section, label, value });
    };

    const addBool = (section: SurveySectionKey, label: string, raw?: boolean | null) => {
      const formatted = formatYesNo(raw);
      if (!formatted) return;
      items.push({ section, label, value: formatted });
    };

    const addTriBool = (section: SurveySectionKey, label: string, raw?: boolean | null) => {
      items.push({ section, label, value: formatTriBool(raw) });
    };

    const formatHebrewYear = (year: number): string => {
      const map: Record<number, string> = {
        1: "א'",
        2: "ב'",
        3: "ג'",
        4: "ד'",
        5: "ה'",
        6: "ו'",
        7: "ז'",
        8: "ח'",
        9: "ט'",
        10: "י'",
      };
      return map[year] ?? `${year}`;
    };

    // עליי
    add('about', 'עיסוק', survey.occupation);
    if (typeof survey.student_year === 'number' && survey.student_year > 0) {
      add('about', 'שנת לימודים', `שנה ${formatHebrewYear(survey.student_year)}`);
    }
    addBool('about', 'עבודה מהבית', survey.works_from_home);
    addBool('about', 'שומר/ת כשרות', survey.keeps_kosher);
    addBool('about', 'שומר/ת שבת', survey.is_shomer_shabbat);
    add('about', 'תזונה', survey.diet_type);
    addBool('about', 'מעשן/ת', survey.is_smoker);
    add('about', 'מצב זוגי', survey.relationship_status);
    addBool('about', 'חיית מחמד בבית', survey.has_pet);
    if (typeof survey.cleanliness_importance === 'number') add('about', 'חשיבות ניקיון', `${survey.cleanliness_importance}/5`);
    add('about', 'תדירות ניקיון', survey.cleaning_frequency);
    add('about', 'העדפת אירוח', survey.hosting_preference);
    add('about', 'סטייל בישול', survey.cooking_style);
    add('about', 'וייב בבית', survey.home_vibe);
    add('about', 'סגנון חיים', (survey as any).lifestyle);

    // הדירה שאני מחפש/ת
    addBool('apartment', 'האם מדובר בסאבלט?', survey.is_sublet);
    if (survey.sublet_month_from || survey.sublet_month_to) {
      const period = [formatMonthLabel(survey.sublet_month_from), formatMonthLabel(survey.sublet_month_to)]
        .filter(Boolean)
        .join(' → ');
      add('apartment', 'טווח סאבלט', period);
    }
    if (typeof survey.price_range === 'number') add('apartment', 'תקציב שכירות', formatCurrency(survey.price_range));
    addTriBool('apartment', 'חשבונות כלולים?', survey.bills_included);
    add('apartment', 'עיר מועדפת', survey.preferred_city);
    const neighborhoodsJoined = normalizeNeighborhoods((survey.preferred_neighborhoods as unknown) ?? null);
    if (neighborhoodsJoined) add('apartment', 'שכונות מועדפות', neighborhoodsJoined);
    add('apartment', 'קומה מועדפת', survey.floor_preference);
    addTriBool('apartment', 'עם מרפסת/גינה?', survey.has_balcony);
    addTriBool('apartment', 'חשוב שתהיה מעלית?', survey.has_elevator);
    addTriBool('apartment', 'חדר מאסטר?', survey.wants_master_room);
    add('apartment', 'תאריך כניסה', formatMonthLabel(survey.move_in_month));
    if (typeof survey.preferred_roommates === 'number') add('apartment', 'מספר שותפים מועדף', `${survey.preferred_roommates}`);
    addBool('apartment', 'חיות מורשות', survey.pets_allowed);
    addTriBool('apartment', 'משנה לך תיווך?', survey.with_broker);

    // השותפ/ה שאני מחפש/ת
    const minAge = (survey as any).preferred_age_min;
    const maxAge = (survey as any).preferred_age_max;
    const derivedAgeRange =
      typeof minAge === 'number' && typeof maxAge === 'number'
        ? `${minAge}–${maxAge}`
        : typeof minAge === 'number'
          ? `${minAge}+`
          : typeof maxAge === 'number'
            ? `עד ${maxAge}`
            : null;
    add('partner', 'טווח גילאים רצוי', survey.preferred_age_range || derivedAgeRange);
    add('partner', 'מגדר שותפים', survey.preferred_gender);
    add('partner', 'עיסוק שותפים', survey.preferred_occupation);
    add('partner', 'שותפים ושבת', survey.partner_shabbat_preference);
    add('partner', 'שותפים ותזונה', survey.partner_diet_preference);
    add('partner', 'שותפים ועישון', survey.partner_smoking_preference);
    add('partner', 'שותפים וחיות', survey.partner_pets_preference);

    return items;
  }, [survey]);

  const surveySubtitle = useMemo(() => {
    if (!survey || !surveyHighlights.length) return 'לחיצה להצגת סיכום ההעדפות';
    const values = surveyHighlights.map((h) => h.value).filter(Boolean);
    return values.slice(0, 2).join(' • ') || 'לחיצה להצגת סיכום ההעדפות';
  }, [survey, surveyHighlights]);

  const surveyPanelWidth = useMemo(() => {
    // Keep the panel centered with comfortable side margins.
    return Math.min(420, Math.max(320, Math.round(screenWidth - 32)));
  }, [screenWidth]);

  const surveyPanelMaxHeight = useMemo(() => {
    return Math.min(560, Math.round(screenHeight * 0.72));
  }, [screenHeight]);

  const surveyPanelScrollMaxHeight = useMemo(() => {
    return Math.min(440, Math.round(screenHeight * 0.42));
  }, [screenHeight]);

  const activeTabIndex = useMemo(() => {
    if (surveyActiveSection === 'about') return 0;
    if (surveyActiveSection === 'apartment') return 1;
    return 2;
  }, [surveyActiveSection]);

  useEffect(() => {
    tabIdx.value = withTiming(activeTabIndex, { duration: 220 });
  }, [activeTabIndex, tabIdx]);

  const indicatorStyle = useAnimatedStyle(() => {
    // Buttons are laid out row-reverse visually: index 0 is rightmost.
    const x = (2 - tabIdx.value) * segW.value;
    return {
      width: segW.value,
      transform: [{ translateX: x }],
    };
  });

  // Detect if I already sent a pending merge invite to this user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!me?.id || !profile?.id) {
          if (!cancelled) setHasPendingMergeInvite(false);
          return;
        }
        const { data: existing } = await supabase
          .from('profile_group_invites')
          .select('id')
          .eq('inviter_id', me.id)
          .eq('invitee_id', profile.id)
          .eq('status', 'PENDING')
          .maybeSingle();
        if (!cancelled) setHasPendingMergeInvite(!!existing?.id);
      } catch {
        if (!cancelled) setHasPendingMergeInvite(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, profile?.id]);

  // Load apartments associated with the viewed profile (owner or partner)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targetUserId = profile?.id || routeUserId;
      if (!targetUserId) {
        setProfileApartments([]);
        setApartmentOccupants({});
        return;
      }
      // Debug: track profile ID for apartment loading
      console.log('[profile-screen] loading apartments for profile', targetUserId, {
        hasProfileId: !!profile?.id,
        fromRoute: routeUserId,
      });
      try {
        setProfileAptLoading(true);
        const selectColumns =
          'id, title, city, image_urls, bedrooms, bathrooms, owner_id, partner_ids';
        const owned = await supabase
          .from('apartments')
          .select(selectColumns)
          .eq('owner_id', targetUserId);
        if (owned.error) {
          console.error('[profile-screen] owned apartments error', owned.error);
        }
        const partnerFilter = `{${JSON.stringify(targetUserId)}}`;
        const partner = await supabase
          .from('apartments')
          .select(selectColumns)
          .filter('partner_ids', 'cs', partnerFilter);
        if (partner.error) {
          console.error('[profile-screen] partner apartments error', partner.error, {
            filter: partnerFilter,
          });
        }
        console.log('[profile-screen] apartments query result', {
          ownedError: owned.error,
          partnerError: partner.error,
          ownedCount: owned.data?.length,
          partnerCount: partner.data?.length,
          partnerFilter,
        });
        const merged = [...(owned.data || []), ...(partner.data || [])] as ProfileApartment[];
        const unique: Record<string, ProfileApartment> = {};
        merged.forEach((a) => {
          if (a?.id) unique[a.id] = a;
        });
        const uniqueApartments = Object.values(unique);
        console.log('[profile-screen] unique apartments', uniqueApartments);
        if (!cancelled) {
          setProfileApartments(uniqueApartments);
        }
        if (cancelled) return;
        if (!uniqueApartments.length) {
          if (!cancelled) setApartmentOccupants({});
          return;
        }
        try {
          const occupantIdSet = new Set<string>();
          uniqueApartments.forEach((apt) => {
            if (apt.owner_id) {
              occupantIdSet.add(String(apt.owner_id));
            }
            normalizePartnerIds(apt.partner_ids).forEach((pid) => occupantIdSet.add(pid));
          });
          console.log('[profile-screen] occupantIdSet', Array.from(occupantIdSet));
          if (!occupantIdSet.size) {
            if (!cancelled) setApartmentOccupants({});
            return;
          }
          const { data: occupantRows, error: occupantError } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', Array.from(occupantIdSet));
          if (occupantError) throw occupantError;
          console.log('[profile-screen] occupant rows', occupantRows?.length);
          const userMap = new Map<string, GroupMember>();
          (occupantRows || []).forEach((user) => {
            if (user?.id) {
              userMap.set(user.id, user as GroupMember);
            }
          });
          const occupantMap: Record<string, GroupMember[]> = {};
          uniqueApartments.forEach((apt) => {
            const occupantOrder: string[] = [];
            if (apt.owner_id) {
              occupantOrder.push(String(apt.owner_id));
            }
            const partnerIds = normalizePartnerIds(apt.partner_ids);
            if (partnerIds.length) {
              occupantOrder.push(...partnerIds);
            }
            const seen = new Set<string>();
            occupantMap[apt.id] = occupantOrder
              .filter((occupantId) => {
                if (seen.has(occupantId) || !userMap.has(occupantId)) {
                  return false;
                }
                seen.add(occupantId);
                return true;
              })
              .map((occupantId) => userMap.get(occupantId) as GroupMember);
          });
          console.log('[profile-screen] occupantMap', occupantMap);
          if (!cancelled) setApartmentOccupants(occupantMap);
        } catch (loadOccupantsError) {
          console.error('Failed to load apartment occupants', loadOccupantsError);
          if (!cancelled) setApartmentOccupants({});
        }
      } catch {
        if (!cancelled) {
          setProfileApartments([]);
          setApartmentOccupants({});
        }
      } finally {
        if (!cancelled) setProfileAptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const handleMergeHeaderPress = () => {
    if (inviteLoading) return;
    if (!me?.id) {
      Alert.alert('חיבור נדרש', 'כדי לשלוח בקשה למיזוג פרופילים צריך להתחבר.');
      return;
    }
    if (!profile?.id) return;
    if (me.id === profile.id) {
      Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה לעצמך.');
      return;
    }
    if (mergeBlockedByTheirSharedGroup) {
      Alert.alert('לא ניתן למזג', 'המשתמש/ת כבר נמצא/ת בפרופיל משותף.');
      return;
    }
    if (hasPendingMergeInvite) {
      Alert.alert('כבר שלחת', 'כבר קיימת בקשת מיזוג בהמתנה עבור משתמש זה.');
      return;
    }
    // Prefer showing the message immediately: verify live from DB to avoid stale state
    (async () => {
      try {
        const [
          meOwned,
          mePartner,
          profOwned,
          profPartner,
          profMembership,
        ] = await Promise.all([
          supabase.from('apartments').select('id').eq('owner_id', me.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [me.id] as any).limit(1),
          supabase.from('apartments').select('id').eq('owner_id', profile.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [profile.id] as any).limit(1),
          supabase
            .from('profile_group_members')
            .select('group_id')
            .eq('user_id', profile.id)
            .eq('status', 'ACTIVE')
            .maybeSingle(),
        ]);
        const isMeLinkedNow = ((meOwned.data || []).length + (mePartner.data || []).length) > 0;
        const isProfileLinkedNow = ((profOwned.data || []).length + (profPartner.data || []).length) > 0;
        if (isMeLinkedNow && isProfileLinkedNow) {
          showMergeBlockedAlert();
          return;
        }
        // Live check: block if invitee belongs to an ACTIVE group with 2+ members.
        const inviteeGroupId = (profMembership as any)?.data?.group_id as string | undefined;
        if (inviteeGroupId) {
          try {
            const { data: inviteeMembers } = await supabase
              .from('profile_group_members')
              .select('user_id')
              .eq('group_id', inviteeGroupId)
              .eq('status', 'ACTIVE');
            const memberCount = (inviteeMembers || []).filter((r: any) => !!r?.user_id).length;
            if (memberCount >= 2) {
              Alert.alert('לא ניתן למזג', 'המשתמש/ת כבר נמצא/ת בפרופיל משותף.');
              return;
            }
          } catch {
            if (mergeBlockedByTheirSharedGroup) {
              Alert.alert('לא ניתן למזג', 'המשתמש/ת כבר נמצא/ת בפרופיל משותף.');
              return;
            }
          }
        }
      } catch (e) {
        // If the live check fails for any reason, fall back to state values
        if (meInApartment && profileInApartment) {
          showMergeBlockedAlert();
          return;
        }
        if (mergeBlockedByTheirSharedGroup) {
          Alert.alert('לא ניתן למזג', 'המשתמש/ת כבר נמצא/ת בפרופיל משותף.');
          return;
        }
      }
      // Otherwise proceed with invite flow
      ensureGroupAndInvite();
    })();
  };

  // Determine if both users are already associated with an apartment (owner or partner)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (me?.id) {
          const [owned, partner] = await Promise.all([
            supabase.from('apartments').select('id').eq('owner_id', me.id).limit(1),
            supabase.from('apartments').select('id').contains('partner_ids', [me.id] as any).limit(1),
          ]);
          if (!cancelled) {
            const any = ((owned.data || []).length + (partner.data || []).length) > 0;
            setMeInApartment(any);
          }
        } else if (!cancelled) {
          setMeInApartment(false);
        }
        if (profile?.id) {
          const [owned, partner] = await Promise.all([
            supabase.from('apartments').select('id').eq('owner_id', profile.id).limit(1),
            supabase.from('apartments').select('id').contains('partner_ids', [profile.id] as any).limit(1),
          ]);
          if (!cancelled) {
            const any = ((owned.data || []).length + (partner.data || []).length) > 0;
            setProfileInApartment(any);
          }
        } else if (!cancelled) {
          setProfileInApartment(false);
        }
      } catch {
        if (!cancelled) {
          setMeInApartment(false);
          setProfileInApartment(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, profile?.id]);

  const ensureGroupAndInvite = async () => {
    if (!me?.id) {
      Alert.alert('חיבור נדרש', 'כדי לשלוח בקשה למיזוג פרופילים יש להתחבר לחשבון.');
      return;
    }
    if (!profile?.id) return;
    if (me.id === profile.id) {
      Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה לעצמך.');
      return;
    }
    try {
      setInviteLoading(true);
      // Double-check on press (in addition to state) that both users are associated with an apartment.
      // This prevents a race where the state hasn't updated yet.
      try {
        const [
          meOwned,
          mePartner,
          profOwned,
          profPartner,
        ] = await Promise.all([
          supabase.from('apartments').select('id').eq('owner_id', me.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [me.id] as any).limit(1),
          supabase.from('apartments').select('id').eq('owner_id', profile.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [profile.id] as any).limit(1),
        ]);
        const isMeLinked = ((meOwned.data || []).length + (mePartner.data || []).length) > 0;
        const isProfileLinked = ((profOwned.data || []).length + (profPartner.data || []).length) > 0;
        if (isMeLinked && isProfileLinked) {
          showMergeBlockedAlert();
          setInviteLoading(false);
          return;
        }
      } catch (e) {
        // If verification failed, continue with local state fallback (handled by button handler too)
      }
      // Prefer an existing ACTIVE group that I'm a member of; if none, fallback to a group I created; else create new
      const [{ data: myActiveMembership }, { data: createdByMeGroup, error: gErr }] = await Promise.all([
        supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', me.id)
          .eq('status', 'ACTIVE')
          .maybeSingle(),
        supabase
          .from('profile_groups')
          .select('*')
          .eq('created_by', me.id)
          .in('status', ['PENDING', 'ACTIVE'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (gErr) throw gErr;

      let groupId = (myActiveMembership as any)?.group_id as string | undefined;
      if (!groupId) {
        groupId = (createdByMeGroup as any)?.id as string | undefined;
      }
      // Create group if none found
      if (!groupId) {
        // Try RPC first to bypass RLS safely
        let createdId: string | undefined;
        try {
          const { data: rpcGroup, error: rpcErr } = await supabase.rpc('create_profile_group_self', {
            p_name: 'שותפים',
            p_status: 'ACTIVE',
          });
          if (rpcErr) {
            // eslint-disable-next-line no-console
            console.error('[merge] RPC create_profile_group_self failed', {
              code: (rpcErr as any)?.code,
              message: (rpcErr as any)?.message,
              details: (rpcErr as any)?.details,
              hint: (rpcErr as any)?.hint,
            });
          } else {
            createdId = (rpcGroup as any)?.id || (rpcGroup as any)?.group_id || (rpcGroup as any);
          }
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error('[merge] RPC create_profile_group_self exception', e?.message || e);
        }
        if (!createdId) {
          const { data: newGroup, error: cErr } = await supabase
            .from('profile_groups')
            .insert({
              created_by: me.id,
              name: 'שותפים',
              status: 'ACTIVE',
            })
            .select('*')
            .single();
          if (cErr) {
            // eslint-disable-next-line no-console
            console.error('[merge] direct insert profile_groups failed', {
              code: (cErr as any)?.code,
              message: (cErr as any)?.message,
              details: (cErr as any)?.details,
              hint: (cErr as any)?.hint,
              meId: me.id,
            });
            throw cErr;
          }
          createdId = (newGroup as any)?.id;
        }
        groupId = createdId;
      }
      // If we reused a group I created that is still PENDING, activate it now
      try {
        if ((createdByMeGroup as any)?.id && (createdByMeGroup as any)?.status && String((createdByMeGroup as any).status).toUpperCase() !== 'ACTIVE') {
          await supabase
            .from('profile_groups')
            .update({ status: 'ACTIVE' })
            .eq('id', (createdByMeGroup as any).id);
        }
      } catch {}

      // Ensure I (the inviter) am ACTIVE in this group before inviting anyone
      try {
        // Prefer SECURITY DEFINER RPC to bypass RLS safely
        const { error: rpcErr } = await supabase.rpc('add_self_to_group', { p_group_id: groupId });
        if (rpcErr) {
          // Fallback to client-side upsert if RPC not available
          const insertMe = await supabase
            .from('profile_group_members')
            .insert([{ group_id: groupId, user_id: me.id, status: 'ACTIVE' } as any], {
              onConflict: 'group_id,user_id',
              ignoreDuplicates: true,
            } as any);
          // If the row already exists (or insert ignored), force status to ACTIVE (best-effort)
          if ((insertMe as any)?.error || (insertMe as any)?.status === 409) {
            await supabase
              .from('profile_group_members')
              .update({ status: 'ACTIVE' })
              .eq('group_id', groupId as string)
              .eq('user_id', me.id);
          }
        }
      } catch {
        // ignore; worst case the invite still gets created and approver will join
      }

      // Prevent duplicate pending invite for same user in same group
      const { data: pendingInvite } = await supabase
        .from('profile_group_invites')
        .select('id,status')
        .eq('group_id', groupId)
        .eq('invitee_id', profile.id)
        .eq('status', 'PENDING')
        .maybeSingle();
      if (pendingInvite?.id) {
        Alert.alert('כבר שלחת', 'כבר קיימת בקשה בהמתנה עבור המשתמש הזה.');
        return;
      }

      // Create invite
      const { error: iErr } = await supabase.from('profile_group_invites').insert({
        group_id: groupId,
        inviter_id: me.id,
        invitee_id: profile.id,
      });
      if (iErr) throw iErr;

      Alert.alert('נשלח', 'הבקשה נשלחה.');
      setHasPendingMergeInvite(true);
    } catch (e: any) {
      console.error('send merge invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח את הבקשה כעת');
    } finally {
      setInviteLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5e3f2d" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#111827', fontWeight: '800' }}>לא נמצא משתמש</Text>
      </View>
    );
  }

  const galleryUrls = normalizeImageUrls((profile as any).image_urls);
  const gap = 6;
  const defaultItemSize = Math.floor((Dimensions.get('window').width - 16 * 2 - gap * 2) / 3);
  const galleryItemSize = galleryWidth
    ? Math.floor((galleryWidth - gap * 2) / 3)
    : defaultItemSize;
  const isMeInViewedGroup =
    !!me?.id && !!groupContext?.members?.some((m) => m.id === me.id);
  const profileIsInSharedGroup =
    !!groupContext && Array.isArray(groupContext.members) && groupContext.members.length >= 2;
  const mergeBlockedByApartments =
    !!me?.id && !isMeInViewedGroup && meInApartment && profileInApartment;
  // Block sending merge invite if the viewed user is already in an ACTIVE shared profile (2+ members),
  // unless I'm already part of that same shared profile.
  const mergeBlockedByTheirSharedGroup =
    !isMeInViewedGroup && profileIsInSharedGroup;

  const SurveyPill = ({
    children,
    icon,
    lines = 1,
  }: {
    children: React.ReactNode;
    icon: React.ReactNode;
    lines?: number;
  }) => (
    <View style={styles.pill}>
      {icon}
      <Text style={styles.pillText} numberOfLines={lines}>{children}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.85}
          onPress={() => {
            try {
              if (from === 'partners') {
                router.replace('/(tabs)/partners');
                return;
              }
              // Prefer real back when available to preserve position
              // @ts-ignore - canGoBack exists on Expo Router
              if (typeof (router as any).canGoBack === 'function' && (router as any).canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/home');
              }
            } catch {
              router.replace('/(tabs)/home');
            }
          }}
        >
          <ArrowLeft size={18} color="#111827" />
        </TouchableOpacity>

        <View style={styles.topBarRight}>
          {(!profile?.id || (me?.id && me.id === profile.id) || mergeBlockedByApartments || mergeBlockedByTheirSharedGroup) ? null : (() => {
            const isDisabled =
              groupLoading ||
              inviteLoading ||
              hasPendingMergeInvite;
            const label = groupLoading
              ? 'טוען...'
              : isMeInViewedGroup
                ? 'פרופיל משותף'
                : inviteLoading
                  ? 'שולח...'
                  : hasPendingMergeInvite
                    ? 'נשלחה בקשה'
                    : 'מיזוג';
            const onPress = () => {
              if (groupLoading) return;
              if (isMeInViewedGroup) {
                router.push('/(tabs)/partners');
                return;
              }
              handleMergeHeaderPress();
            };
            const IconComp = isMeInViewedGroup ? Users : UserPlus2;
            return (
              <TouchableOpacity
                style={[
                  styles.mergeHeaderBtn,
                  (isDisabled || (meInApartment && profileInApartment)) ? styles.mergeBtnDisabled : null,
                ]}
                activeOpacity={0.9}
                onPress={onPress}
                disabled={isDisabled}
              >
                <IconComp size={16} color="#FFFFFF" />
                <Text style={styles.mergeHeaderText}>{label}</Text>
              </TouchableOpacity>
            );
          })()}

          {/* Show shared profile chip (if any) after the button so the button stays rightmost */}
          {groupLoading ? null : groupContext && groupContext.members.length >= 2 ? (
            <TouchableOpacity
              style={styles.mergedChip}
              activeOpacity={0.9}
              onPress={() => router.push('/(tabs)/partners')}
            >
              <View style={styles.mergedAvatarsRow}>
                {groupContext.members
                  .filter((m) => m.id !== profile.id)
                  .slice(0, 3)
                  .map((m, idx) => (
                  <View
                    key={m.id}
                    style={[styles.mergedAvatarWrap, idx !== 0 && styles.mergedAvatarOverlap]}
                  >
                    {m.avatar_url ? (
                      <Image source={{ uri: m.avatar_url }} style={styles.mergedAvatarImg} />
                    ) : (
                      <View style={styles.mergedAvatarFallback} />
                    )}
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: '#FAFAFA' }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
        ]}
      >
        <View style={styles.page}>
          {!!mergeNotice ? (
            <View style={styles.noticeWrap}>
              <Text style={styles.noticeText} numberOfLines={3}>{mergeNotice}</Text>
              <TouchableOpacity style={styles.noticeClose} onPress={() => setMergeNotice(null)} activeOpacity={0.85}>
                <Text style={styles.noticeCloseText}>סגור</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.profileCard}>
            <View style={styles.avatarRow}>
              <Image
                source={{ uri: profile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                style={styles.avatar}
              />
              {profile?.id && (!me?.id || me.id !== profile.id) && !mergeBlockedByApartments && !mergeBlockedByTheirSharedGroup ? (() => {
                const isDisabled =
                  groupLoading ||
                  inviteLoading ||
                  (!isMeInViewedGroup && hasPendingMergeInvite);
                const label = groupLoading
                  ? 'טוען...'
                  : isMeInViewedGroup
                    ? 'שותפים'
                    : inviteLoading
                      ? 'שולח...'
                      : hasPendingMergeInvite
                        ? 'נשלחה'
                        : 'מיזוג';
                const IconComp = isMeInViewedGroup ? Users : UserPlus2;
                return (
                  <TouchableOpacity
                    style={[styles.mergeInlinePill, isDisabled ? styles.mergeInlinePillDisabled : null]}
                    activeOpacity={0.9}
                    onPress={() => {
                      if (groupLoading) return;
                      if (isMeInViewedGroup) {
                        router.push('/(tabs)/partners');
                        return;
                      }
                      handleMergeHeaderPress();
                    }}
                    disabled={isDisabled}
                  >
                    <IconComp size={16} color="#5e3f2d" />
                    <Text style={styles.mergeInlinePillText}>{label}</Text>
                  </TouchableOpacity>
                );
              })() : null}
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {profile.full_name}{profile.age ? `, ${profile.age}` : ''}
            </Text>
            {!!profile.city ? (
              <View style={styles.locationPill}>
                <MapPin size={14} color="#5e3f2d" />
                <Text style={styles.locationText}>{profile.city}</Text>
              </View>
            ) : null}

            {!!profile.bio ? (
              <Text style={styles.headerBio} numberOfLines={8}>
                {profile.bio}
              </Text>
            ) : (
              <Text style={styles.bioEmpty} numberOfLines={2}>
                אין תיאור עדיין
              </Text>
            )}
          </View>

          {/* Partners / shared profile (always show section; show empty state when none) */}
          <View style={styles.section}>
            <View style={styles.sharedCard}>
              <View style={styles.sharedCardHeaderRow}>
                <Text style={styles.sharedCardTitle} numberOfLines={1}>
                  {((groupContext?.name || 'שותפים') as any).toString()}
                </Text>
                <Text style={styles.sharedCardMeta} numberOfLines={1}>
                  {groupLoading
                    ? 'טוען...'
                    : `${(groupContext?.members?.length || 0).toString()} שותפים`}
                </Text>
              </View>

              {groupLoading ? (
                <View style={styles.sectionEmptyWrap}>
                  <ActivityIndicator size="small" color="#5e3f2d" />
                  <Text style={styles.sectionEmptyText}>טוען שותפים...</Text>
                </View>
              ) : groupContext && groupContext.members.length >= 2 ? (
                <View style={styles.sharedMembersGrid}>
                  {groupContext.members.map((m) => {
                    const isCurrent = String(m?.id || '') === String(profile?.id || '');
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.sharedMemberTile, isCurrent ? { opacity: 0.7 } : null]}
                        activeOpacity={0.9}
                        disabled={isCurrent}
                        onPress={() => {
                          if (!m?.id || isCurrent) return;
                          router.push({ pathname: '/user/[id]', params: { id: m.id } });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isCurrent
                            ? 'זה הפרופיל הנוכחי'
                            : `פתח פרופיל של ${(m.full_name || 'משתמש/ת').toString()}`
                        }
                        accessibilityState={isCurrent ? ({ disabled: true } as any) : undefined}
                      >
                        <View style={styles.sharedMemberAvatarWrap}>
                          <Image
                            source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.sharedMemberAvatar}
                          />
                        </View>
                        <Text style={styles.sharedMemberName} numberOfLines={1}>
                          {m.full_name || 'משתמש/ת'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.sectionEmptyWrap}>
                  <View style={styles.sectionEmptyIconPill}>
                    <Users size={18} color="#5e3f2d" />
                  </View>
                  <Text style={styles.sectionEmptyTitle}>עדיין אין שותפים</Text>
                  <Text style={styles.sectionEmptyText}>
                    כשיהיו שותפים מקושרים לפרופיל, הם יופיעו כאן.
                  </Text>
                </View>
              )}
            </View>
          </View>

      {/* Viewed user's apartment(s) (always show section; show empty state when none) */}
      <View style={styles.section}>
        <View style={styles.apartmentsCard}>
          <View style={styles.apartmentsHeaderRow}>
            {(() => {
              const firstName = profile.full_name?.split(' ')?.[0] || 'המשתמש/ת';
              const pid = String(profile?.id || '').trim();
              const anyOwned = !!pid && profileApartments.some((a: any) => String(a?.owner_id || '') === pid);
              const anyPartner =
                !!pid &&
                profileApartments.some(
                  (a: any) => Array.isArray(a?.partner_ids) && (a.partner_ids as any[]).map(String).includes(pid)
                );
              const hasAny = !!profileApartments.length;
              const headerTag = !hasAny
                ? 'אין דירה'
                : anyOwned && anyPartner
                  ? 'בעל דירה / שותף'
                  : anyOwned
                    ? 'בעל דירה'
                    : 'שותף';
              return (
                <>
                  <Text style={styles.apartmentsHeaderTitle}>{`הדירה של ${firstName}`}</Text>
                  <View style={styles.apartmentsHeaderTag}>
                    <Text style={styles.apartmentsHeaderTagText}>{headerTag}</Text>
                  </View>
                </>
              );
            })()}
          </View>

          <View style={{ paddingTop: 12 }}>
            {profileAptLoading ? (
              <View style={styles.sectionEmptyWrap}>
                <ActivityIndicator size="small" color="#5e3f2d" />
                <Text style={styles.sectionEmptyText}>טוען דירה...</Text>
              </View>
            ) : profileApartments.length ? (
              profileApartments.map((apt, idx) => {
                const rawImages = normalizeImageUrls(apt.image_urls);
                const aptImages = Array.from(new Set(rawImages.map(resolveApartmentImageCandidate).filter(Boolean)));
                const firstImg = aptImages.length > 0 ? aptImages[0] : APT_IMAGE_PLACEHOLDER;
                const occupantMembers = apartmentOccupants[apt.id] || [];
                const visibleOccupants = occupantMembers.slice(0, 4);
                const overflowCount = occupantMembers.length - visibleOccupants.length;
                const isLast = idx === profileApartments.length - 1;
                return (
                  <TouchableOpacity
                    key={apt.id}
                    style={[styles.aptCard, !isLast ? styles.aptCardSpacing : null]}
                    activeOpacity={0.9}
                    onPress={() => router.push({ pathname: '/apartment/[id]', params: { id: apt.id } })}
                  >
                    <View style={styles.aptCoverWrap}>
                      <ApartmentImageThumb uri={firstImg} style={styles.aptCoverImg} />
                      <LinearGradient
                        colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.92)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.aptCoverGradient}
                      />
                      <View style={styles.aptCoverTextWrap}>
                        <Text style={styles.aptCoverTitle} numberOfLines={1}>
                          {apt.title || 'דירה'}
                        </Text>
                        {!!apt.city ? (
                          <View style={styles.aptCoverCityRow}>
                            <MapPin size={14} color="rgba(255,255,255,0.92)" />
                            <Text style={styles.aptCoverCityText} numberOfLines={1}>
                              {apt.city}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {!!visibleOccupants.length ? (
                        <View style={styles.aptCoverOccupantsRow} pointerEvents="none">
                          {visibleOccupants.map((member, idx2) => {
                            const fallbackInitial = ((member.full_name || '').trim().charAt(0) || '?').toUpperCase();
                            return (
                              <View
                                key={member.id}
                                style={[
                                  styles.aptOccupantAvatarWrap,
                                  styles.aptCoverOccupantAvatarShadow,
                                  idx2 !== 0 && styles.aptOccupantOverlap,
                                ]}
                              >
                                {member.avatar_url ? (
                                  <Image source={{ uri: member.avatar_url }} style={styles.aptOccupantAvatarImg} />
                                ) : (
                                  <Text style={styles.aptOccupantFallback}>{fallbackInitial}</Text>
                                )}
                              </View>
                            );
                          })}
                          {overflowCount > 0 ? (
                            <View
                              style={[
                                styles.aptOccupantAvatarWrap,
                                styles.aptCoverOccupantAvatarShadow,
                                styles.aptOccupantOverflow,
                              ]}
                            >
                              <Text style={styles.aptOccupantOverflowText}>+{overflowCount}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.sectionEmptyWrap}>
                <View style={styles.sectionEmptyIconPill}>
                  <Building2 size={18} color="#5e3f2d" />
                </View>
                <Text style={styles.sectionEmptyTitle}>עדיין אין דירה</Text>
                <Text style={styles.sectionEmptyText}>
                  המשתמש/ת עדיין לא בחר/ה דירה להצגה בפרופיל.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

          {/* Survey CTA (match + questionnaire) — placed under the apartment section */}
          <View style={styles.section}>
            <View style={styles.surveyCTAOuter}>
              <TouchableOpacity
                style={[
                  styles.surveyCTA,
                  (surveyLoading || !survey) ? styles.surveyCTADisabled : null,
                ]}
                activeOpacity={0.9}
                onPress={() => {
                  if (surveyLoading) return;
                  if (!survey) return;
                  setSurveyActiveSection('about');
                  setIsSurveyOpen(true);
                }}
                disabled={surveyLoading || !survey}
              >
                <View style={styles.surveyCTAAvatarCol}>
                  <View style={styles.surveyCTAAvatarRingWrap}>
                    <DonutChart
                      percentage={typeof matchPercent === 'number' ? matchPercent : 0}
                      size={54}
                      strokeWidth={5}
                      durationMs={850}
                      color="#16A34A"
                      trackColor="rgba(22,163,74,0.14)"
                      textColor="transparent"
                      textStyle={{ fontSize: 0 } as any}
                      accessibilityLabel="אחוזי התאמה"
                    />
                    <View style={styles.surveyCTAAvatarWrap}>
                      <Image
                        source={{ uri: profile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                        style={styles.surveyCTAAvatar}
                      />
                    </View>
                  </View>
                  <Text style={styles.surveyCTAMatchValue}>{matchPercentDisplay}</Text>
                  <Text style={styles.surveyCTAMatchLabel}>אחוזי התאמה</Text>
                </View>
                <View style={styles.surveyCTATexts}>
                  <Text style={styles.surveyCTATitle}>
                    {`קצת על ${profile.full_name?.split(' ')?.[0] || 'המשתמש/ת'}`}
                  </Text>
                  <Text style={styles.surveyCTASubtitle} numberOfLines={1}>
                    {(() => {
                      const firstName = profile.full_name?.split(' ')?.[0] || 'המשתמש/ת';
                      if (surveyLoading) return 'טוען...';
                      if (surveyError) return surveyError;
                      if (!survey) return `${firstName} עדיין לא מילא/ה את השאלון`;
                      return `הכירו את ${firstName} יותר טוב`;
                    })()}
                  </Text>
                </View>

                <View style={styles.surveyCTACtaPill}>
                  <Text style={styles.surveyCTACtaPillText}>לצפייה</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

      <View style={styles.section}>
        <View style={styles.galleryCard}>
          <View style={styles.galleryHeaderRow}>
            <Text style={styles.galleryHeaderTitle}>תמונות</Text>
            <Text style={styles.galleryCountText}>{galleryUrls.length}/6</Text>
          </View>

          {galleryUrls.length ? (
            <View
              style={styles.galleryGrid}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && Math.abs(w - galleryWidth) > 1) setGalleryWidth(w);
              }}
            >
              {galleryUrls.map((url, idx) => (
                <TouchableOpacity
                  key={url + idx}
                  activeOpacity={0.9}
                  onPress={() => setViewerIndex(idx)}
                  style={[
                    styles.galleryItem,
                    {
                      width: galleryItemSize,
                      height: galleryItemSize,
                      // galleryGrid is row-reverse, so spacing should be on the LEFT of each item
                      marginLeft: idx % 3 === 2 ? 0 : gap,
                      marginBottom: gap,
                    },
                  ]}
                >
                  <Image source={{ uri: url }} style={styles.galleryImg} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.sectionEmptyWrap}>
              <View style={styles.sectionEmptyIconPill}>
                <Images size={18} color="#5e3f2d" />
              </View>
              <Text style={styles.sectionEmptyTitle}>עדיין אין תמונות</Text>
              <Text style={styles.sectionEmptyText}>
                כשהמשתמש/ת יוסיף/תוסיף תמונות לפרופיל, הן יופיעו כאן.
              </Text>
            </View>
          )}
        </View>
      </View>

      {viewerIndex !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerIndex(null)}
        >
          <View style={styles.viewerOverlay}>
            <TouchableOpacity
              style={styles.viewerBackdrop}
              activeOpacity={1}
              onPress={() => setViewerIndex(null)}
            />
            <TouchableOpacity
              style={[styles.viewerCloseBtn, { top: 20 }]}
              onPress={() => setViewerIndex(null)}
              activeOpacity={0.9}
            >
              <X size={18} color="#E5E7EB" />
            </TouchableOpacity>
            <Image
              source={{ uri: galleryUrls[viewerIndex] || '' }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
        </View>
      </ScrollView>

      {/* Survey viewer should be rendered at screen root so it centers properly and shades the whole screen */}
      <KeyFabPanel
        isOpen={isSurveyOpen}
        onClose={() => setIsSurveyOpen(false)}
        title="סיכום ההעדפות"
        subtitle=""
        anchor="center"
        topOffset={insets.top + 24}
        bottomOffset={insets.bottom + 24}
        openedWidth={surveyPanelWidth}
        panelStyle={{ maxHeight: surveyPanelMaxHeight, borderRadius: 22, padding: 14 }}
      >
        <View
          style={styles.surveySegWrap}
          onLayout={(e) => {
            const w = Math.max(1, e.nativeEvent.layout.width);
            // account for horizontal padding inside the segmented control
            segW.value = Math.max(1, (w - 12) / 3);
          }}
        >
          <Animated.View style={[styles.surveySegIndicator, indicatorStyle]} />
          <View style={styles.surveySegRow}>
            <TouchableOpacity
              style={styles.surveySegBtn}
              onPress={() => setSurveyActiveSection('about')}
              activeOpacity={0.9}
            >
              <UserIcon size={16} color={surveyActiveSection === 'about' ? '#5e3f2d' : '#6B7280'} />
              <Text style={[styles.surveySegText, surveyActiveSection === 'about' ? styles.surveySegTextActive : null]}>
                קצת עליי
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.surveySegBtn}
              onPress={() => setSurveyActiveSection('apartment')}
              activeOpacity={0.9}
            >
              <Home size={16} color={surveyActiveSection === 'apartment' ? '#5e3f2d' : '#6B7280'} />
              <Text
                style={[
                  styles.surveySegText,
                  surveyActiveSection === 'apartment' ? styles.surveySegTextActive : null,
                ]}
              >
                הדירה
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.surveySegBtn}
              onPress={() => setSurveyActiveSection('partner')}
              activeOpacity={0.9}
            >
              <Users size={16} color={surveyActiveSection === 'partner' ? '#5e3f2d' : '#6B7280'} />
              <Text
                style={[
                  styles.surveySegText,
                  surveyActiveSection === 'partner' ? styles.surveySegTextActive : null,
                ]}
              >
                השותפים
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={[styles.surveyPanelScroll, { maxHeight: surveyPanelScrollMaxHeight }]}
          contentContainerStyle={styles.surveyPanelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
        >
          {survey && surveyItems.length ? (
            <Animated.View
              key={`survey-part-${surveyActiveSection}`}
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(120)}
              style={styles.surveySectionCard}
            >
              <Text style={styles.surveySectionTitle}>
                {surveyActiveSection === 'about'
                  ? 'קצת עליי'
                  : surveyActiveSection === 'apartment'
                    ? 'העדפות לדירה'
                    : 'העדפות לשותפים'}
              </Text>
              {surveyItems
                .filter((i) => i.section === surveyActiveSection)
                .map((item, idx, arr) => (
                  <View key={`${item.section}-${item.label}-${item.value}`}>
                    <View style={styles.surveyRow}>
                      <Text style={styles.surveyRowLabel}>{item.label}</Text>
                      <View style={styles.surveyRowValuePill}>
                        <Text style={styles.surveyRowValueText}>{item.value}</Text>
                      </View>
                    </View>
                    {idx < arr.length - 1 ? <View style={styles.surveyRowDivider} /> : null}
                  </View>
                ))}
            </Animated.View>
          ) : (
            <View style={styles.surveyEmptyState}>
              <Text style={styles.surveyEmptyText}>
                {survey ? 'אין נתונים להצגה.' : 'המשתמש/ת עדיין לא מילא/ה את השאלון.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyFabPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    // Keep text RTL, but avoid flipping the entire layout on web (which can cause double-inversion with row-reverse).
    writingDirection: 'rtl',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  page: {
    width: '100%',
    maxWidth: 560,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFA',
  },
  topBarRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.08)' } as any) : null),
  },
  headerBio: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.92,
  },
  bioEmpty: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.9,
    textAlign: 'center',
  },
  mergedChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.08)' } as any) : null),
  },
  mergedChipText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  mergedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  mergedAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(94,63,45,0.25)',
    backgroundColor: '#F3F4F6',
  },
  mergedAvatarOverlap: {
    marginRight: -10,
  },
  mergedAvatarImg: {
    width: '100%',
    height: '100%',
  },
  mergedAvatarFallback: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#F3F4F6',
    marginBottom: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  avatarRow: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  matchRingWrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: 0,
    zIndex: 2,
  },
  matchCaption: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  matchPercentText: {
    color: '#16A34A',
    fontSize: 18,
    fontWeight: '900',
    includeFontPadding: false,
  },
  matchCaptionText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  name: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  locationPill: {
    marginTop: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
  },
  locationText: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '900',
  },
  profileCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any) : null),
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  surveyCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any) : null),
  },
  surveyCTA: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 20,
    overflow: 'hidden',
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 10,
  },
  surveyCTADisabled: {
    backgroundColor: '#F3F4F6',
  },
  surveyCTAOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.12)' } as any) : null),
  },
  surveyCTATexts: {
    flex: 1,
    marginRight: 8,
  },
  surveyCTAAvatarWrap: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
  },
  surveyCTAAvatar: {
    width: '100%',
    height: '100%',
  },
  surveyCTAAvatarCol: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    gap: 1,
  },
  surveyCTAAvatarRingWrap: {
    width: 54,
    height: 54,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surveyCTAMatchValue: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '900',
    includeFontPadding: false,
  },
  surveyCTAMatchLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  surveyCTATitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 4,
  },
  surveyCTASubtitle: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'right',
  },
  surveyCTAHint: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  matchDonutFloating: {
    position: 'absolute',
    top: 18,
    left: 18,
    zIndex: 10,
  },
  matchDonutLabel: {
    marginTop: 6,
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  surveyCTACtaPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(22,163,74,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surveyCTACtaPillText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    // Use a fixed relative height so the sheet reliably "rises up" and shows content nicely.
    // (maxHeight can leave the sheet too short on some platforms/web layouts)
    height: '92%',
    width: '100%',
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5e3f2d',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  surveyHighlightsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  surveyHighlightPill: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '48%',
  },
  surveyHighlightLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 2,
    textAlign: 'right',
    fontWeight: '600',
  },
  surveyHighlightValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  surveyAllAnswersTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  surveySectionCard: {
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  surveySectionTitle: {
    color: '#5e3f2d',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 10,
  },
  surveyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  surveyRowLabel: {
    flex: 1,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 18,
  },
  surveyRowValuePill: {
    maxWidth: '55%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  surveyRowValueText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    lineHeight: 18,
  },
  surveyRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(17,24,39,0.10)',
    marginVertical: 10,
  },
  surveySegWrap: {
    position: 'relative',
    backgroundColor: '#E5E7EB',
    borderWidth: 0,
    borderRadius: 999,
    padding: 6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  surveySegRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  surveySegIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  surveySegBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  surveySegText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  surveySegTextActive: {
    color: '#5e3f2d',
  },
  surveyPanelScroll: {
    // maxHeight is set dynamically based on screen size
  },
  surveyPanelContent: {
    paddingBottom: 10,
  },
  surveyEmptyState: {
    paddingVertical: 18,
    paddingHorizontal: 4,
    gap: 8,
  },
  surveyEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
  },
  surveyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
    marginBottom: 14,
  },
  surveyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#5e3f2d',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  apGroupSection: {
    marginBottom: 10,
  },
  apGroupLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'right',
    opacity: 0.9,
    writingDirection: 'rtl',
    alignSelf: 'flex-end',
  },
  apGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    flexShrink: 1,
    flexGrow: 1,
    textAlign: 'right',
  },
  currencyIcon: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 1,
  },
  subletTag: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  subletTagText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  sectionText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
  },
  mergeBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#5e3f2d',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#5e3f2d',
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  mergeBtnDisabled: {
    opacity: 0.75,
  },
  mergeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  mergeInlinePill: {
    position: 'absolute',
    right: 0,
    top: '50%',
    // Slightly above the avatar center-line
    transform: [{ translateY: -58 }],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mergeInlinePillDisabled: {
    opacity: 0.7,
  },
  mergeInlinePillText: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '900',
    includeFontPadding: false,
  },
  mergeHeaderBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
    backgroundColor: '#5e3f2d',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mergeHeaderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  groupSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    alignItems: 'center',
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any) : null),
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#5e3f2d',
    marginBottom: 12,
  },
  groupBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  groupTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  groupAvatars: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  groupAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarOverlap: {
    marginRight: -14,
  },
  groupAvatarHighlighted: {
    borderColor: '#5e3f2d',
    borderWidth: 3,
  },
  groupAvatarImg: {
    width: '100%',
    height: '100%',
  },
  groupAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
  },
  groupAvatarFallbackText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '800',
  },
  noticeWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'flex-end',
    gap: 8,
  },
  noticeText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  noticeClose: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  noticeCloseText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
  },
  groupNames: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  sharedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any)
      : null),
  },
  sharedCardHeaderRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    marginBottom: 12,
  },
  sharedCardTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    flex: 1,
  },
  sharedCardMeta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'left',
  },
  sharedMembersGrid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  sharedMemberTile: {
    width: '31%',
    minWidth: 92,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.10)' } as any)
      : null),
  },
  sharedMemberAvatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    marginBottom: 8,
  },
  sharedMemberAvatar: {
    width: '100%',
    height: '100%',
  },
  sharedMemberName: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
    includeFontPadding: false,
  },
  sectionEmptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sectionEmptyIconPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEmptyTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  sectionEmptyText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  apartmentsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any)
      : null),
  },
  apartmentsHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    gap: 10,
  },
  apartmentsHeaderTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  apartmentsHeaderTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
  },
  apartmentsHeaderTagText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
  },
  aptCardSpacing: {
    marginBottom: 12,
  },
  gallery: {
    // removed (replaced by galleryCard/galleryGrid)
  },
  galleryImg: {
    width: '100%',
    height: '100%',
  },
  galleryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any)
      : null),
  },
  galleryHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  galleryHeaderTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  galleryCountText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  galleryGrid: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    // Keep layout consistent (esp. on web) so margins produce uniform spacing
    direction: 'ltr',
  },
  galleryItem: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  viewerImage: {
    width: '92%',
    height: '70%',
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  viewerCloseBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  aptCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any) : null),
  },
  aptCoverWrap: {
    width: '100%',
    height: 176,
    backgroundColor: '#F3F4F6',
  },
  aptCoverImg: {
    width: '100%',
    height: '100%',
  },
  aptCoverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
  },
  aptCoverTextWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    alignItems: 'flex-end',
    // In RTL screens on web, flex-end may map to the visual left. Force LTR so "end" stays right.
    direction: 'ltr',
  },
  aptCoverOccupantsRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    // Force LTR layout for consistent spacing/overlap even when the screen is RTL (esp. on web)
    direction: 'ltr',
  },
  aptCoverOccupantAvatarShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.18)' } as any) : null),
  },
  aptCoverTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  aptCoverCityRow: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  aptCoverCityText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aptChipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  aptChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(109,40,217,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.12)',
  },
  aptChipText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  aptOccupantsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  aptOccupantsLabel: {
    marginRight: 8,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  aptOccupantAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  aptOccupantOverlap: {
    // Overlap avatars so each one slightly covers the previous one
    marginLeft: -8,
  },
  aptOccupantAvatarImg: {
    width: '100%',
    height: '100%',
  },
  aptOccupantFallback: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
  },
  aptOccupantOverflow: {
    borderColor: 'rgba(94,63,45,0.25)',
    backgroundColor: 'rgba(94,63,45,0.10)',
  },
  aptOccupantOverflowText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '800',
  },
  aptImagesScroll: {
    marginTop: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  aptImagesContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aptImageThumb: {
    width: 96,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aptImageThumbSpacing: {
    marginLeft: 8,
  },
});




