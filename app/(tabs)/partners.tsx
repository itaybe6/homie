import { useEffect, useRef, useState } from 'react';
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
import { SlidersHorizontal, ChevronLeft, ChevronRight, Heart, X, MapPin, Share2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User, UserSurveyResponse } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';
import RoommateCard from '@/components/RoommateCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cityNeighborhoods, canonicalizeCityName } from '@/assets/data/neighborhoods';
import { Apartment } from '@/types/database';
// GroupCard implemented inline below

import {
  calculateMatchScore,
  CompatUserSurvey,
  PartnerSmokingPref,
  PartnerShabbatPref,
  PartnerDietPref,
  PartnerPetsPref,
  DietType,
  Lifestyle,
  CleaningFrequency,
  HostingPreference,
  CookingStyle,
  HomeVibe,
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

type BrowseItem =
  | { type: 'user'; user: User }
  | { type: 'group'; groupId: string; users: User[]; apartment?: Apartment };

export default function PartnersScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [gender, setGender] = useState<'any' | 'male' | 'female'>('any');
  const [ageMin, setAgeMin] = useState<number>(20);
  const [ageMax, setAgeMax] = useState<number>(40);
  const [ageActive, setAgeActive] = useState<boolean>(false);
  const [profileType, setProfileType] = useState<'all' | 'singles' | 'groups'>('all');
  const [groupGender, setGroupGender] = useState<'any' | 'male' | 'female'>('any');
  const [groupSize, setGroupSize] = useState<'any' | 2 | 3>('any');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [matchScores, setMatchScores] = useState<Record<string, number | null>>({});

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
    setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
    translateX.value = 0;
  };

  const swipeGesture = Gesture.Pan()
    .onChange((e) => {
      translateX.value = e.translationX;
    })
    .onEnd(() => {
      'worklet';
      if (translateX.value > SWIPE_THRESHOLD) {
        translateX.value = withTiming(screenWidth + 200, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onSwipe)('like');
        });
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-screenWidth - 200, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onSwipe)('pass');
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
      transform: [{ scale: 0.985 + progress * 0.015 }, { translateY: 10 - progress * 10 }],
      opacity: 0.92 + progress * 0.08,
    };
  });

  const likeOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 0.75], Extrapolate.CLAMP),
  }));

  const passOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [0.75, 0], Extrapolate.CLAMP),
  }));

  useEffect(() => {
    fetchUsersAndGroups();
  }, [currentUser?.id]);

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
    if (survey?.lifestyle) compat.lifestyle = survey.lifestyle as Lifestyle;
    if (typeof survey?.cleanliness_importance === 'number')
      compat.cleanliness_importance = survey.cleanliness_importance;
    if (survey?.cleaning_frequency) compat.cleaning_frequency = survey.cleaning_frequency as CleaningFrequency;
    if (survey?.hosting_preference) compat.hosting_preference = survey.hosting_preference as HostingPreference;
    if (survey?.cooking_style) compat.cooking_style = survey.cooking_style as CookingStyle;
    if (survey?.home_vibe) compat.home_vibe = survey.home_vibe as HomeVibe;
    if (survey?.preferred_city) compat.preferred_city = survey.preferred_city;
    if (Array.isArray(survey?.preferred_neighborhoods)) compat.preferred_neighborhoods = survey.preferred_neighborhoods;
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
  };

  const computeMatchPercentages = async (
    candidateIds: string[],
    userMap: Record<string, User>,
  ): Promise<Record<string, number | null>> => {
    const authId = useAuthStore.getState().user?.id || currentUser?.id;
    if (!authId || !candidateIds.length) return {};
    const uniqueIds = Array.from(new Set([...candidateIds, authId]));
    try {
      const { data: surveyRows, error } = await supabase
        .from('user_survey_responses')
        .select('*')
        .in('user_id', uniqueIds);
      if (error) {
        console.error('failed to fetch survey responses for matching', error);
        return {};
      }
      const surveys = Object.fromEntries(
        (surveyRows || []).map((row) => [row.user_id, row as UserSurveyResponse]),
      ) as Record<string, UserSurveyResponse>;
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

  const userPassesFilters = (u: User) => {
    // Gender filter
    if (gender !== 'any') {
      if (!u.gender || u.gender !== gender) return false;
    }
    // City filter (multi-select)
    if (selectedCities.length) {
      const userCity = canonicalizeCityName(u.city || '');
      if (!selectedCities.includes(userCity)) return false;
    }
    // Age filter: only when activated by the user
    if (ageActive) {
      if (typeof u.age !== 'number') return false;
      if (u.age < ageMin || u.age > ageMax) return false;
    }
    return true;
  };

  const groupPassesFilters = (users: User[]) => {
    // group size filter
    if (groupSize !== 'any') {
      if (users.length !== groupSize) return false;
    }
    // city filter: all members must be within selected cities (if any selected)
    if (selectedCities.length) {
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
    return true;
  };

  const fetchUsersAndGroups = async () => {
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
        .select('id, status')
        .eq('status', 'ACTIVE');
      if (groupsErr) throw groupsErr;
      const groupIds = (groupsData || []).map((g: any) => g.id as string);

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


      const groupUserIds = Array.from(new Set(members.map((m) => m.user_id)));
      let groupUsersById: Record<string, User> = {};
      if (groupUserIds.length) {
        const { data: gUsers, error: guErr } = await supabase
          .from('users')
          .select('*')
          .in('id', groupUserIds);
        if (guErr) throw guErr;
        groupUsersById = Object.fromEntries(((gUsers || []) as User[]).map((u) => [u.id, u]));
      }

      // Build groups with their users
      const groupIdToUsers: Record<string, User[]> = {};
      members.forEach((m) => {
        const u = groupUsersById[m.user_id];
        if (!u) return;
        if (!groupIdToUsers[m.group_id]) groupIdToUsers[m.group_id] = [];
        groupIdToUsers[m.group_id].push(u);
      });

      // Filter to groups with at least 2 users, not including the current user
      // Apply UI filters: all members must pass filters (age, gender)
      const activeGroups: { groupId: string; users: User[]; apartment?: Apartment }[] = Object.entries(groupIdToUsers)
        .map(([gid, us]) => ({ groupId: gid, users: us }))
        .filter(
          (g) =>
            g.users.length >= 1 &&
            !g.users.some((u) => u.id === authId) &&
            groupPassesFilters(g.users)
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

      let matchRows: { id: string; sender_id: string; receiver_id: string | null; receiver_group_id?: string | null; sender_group_id?: string | null }[] = [];
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
          .select('id, sender_id, receiver_id, receiver_group_id, sender_group_id')
          .or(orParts.join(','));
        if (matchesError) throw matchesError;
        matchRows = matchesData || [];
      }

      const list = (usersData || []) as User[];
      const interacted = new Set<string>();
      const interactedGroupIds = new Set<string>();
      if (authId) {
        matchRows.forEach((row) => {
          // User <-> User interactions
          if (row.sender_id === authId && row.receiver_id) interacted.add(row.receiver_id);
          if (row.receiver_id === authId) interacted.add(row.sender_id);
          // User -> Group interactions (I sent to a group)
          if (row.sender_id === authId && row.receiver_group_id) interactedGroupIds.add(row.receiver_group_id);
          // Group -> User interactions (a group sent to me, or to my group)
          if (row.receiver_id === authId && row.sender_group_id) interactedGroupIds.add(row.sender_group_id);
          // Any interaction involving my groups: exclude the other side (single user) too
          const myGroupIds = new Set(
            members
              .filter((m) => m.user_id === authId)
              .map((m) => m.group_id)
          );
          if (row.receiver_group_id && myGroupIds.has(row.receiver_group_id) && row.sender_id) {
            interacted.add(row.sender_id);
          }
          if (row.sender_group_id && myGroupIds.has(row.sender_group_id) && row.receiver_id) {
            interacted.add(row.receiver_id);
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

      filteredSingles = filteredSingles.filter((u) => userPassesFilters(u));

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
      const newMatchScores = await computeMatchPercentages(candidateIds, userMap);
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

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchUsersAndGroups();
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

      // optional: also notify the recipient
      // If sender is part of a merged profile, reflect that in the content
      const senderIsMerged = !!senderGroupId;
      const notifTitle = senderIsMerged ? 'בקשת שותפות מפרופיל משותף' : 'בקשת שותפות חדשה';
      const senderLabel = await computeGroupAwareLabel(currentUser.id);
      const notifDesc = `${senderLabel} מעוניין/ת להיות שותף/ה שלך.`;
      await supabase.from('notifications').insert({
        sender_id: currentUser.id,
        recipient_id: likedUser.id,
        title: notifTitle,
        description: notifDesc,
      });

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

      // optional: notify all members (except sender if appears)
      const recipients = groupUsers.filter((u) => u.id !== currentUser.id);
      if (recipients.length) {
        // If sender is part of a merged profile, reflect that in notification content
        let senderIsMerged = false;
        try {
          const { data: myGroup } = await supabase
            .from('profile_group_members')
            .select('group_id')
            .eq('user_id', currentUser.id)
            .eq('status', 'ACTIVE')
            .maybeSingle();
          senderIsMerged = !!myGroup?.group_id;
        } catch {}
        const notifTitle = senderIsMerged ? 'בקשת שותפות מפרופיל משותף' : 'בקשת שותפות חדשה';
        const senderLabel = await computeGroupAwareLabel(currentUser.id);
        const notifDesc = `${senderLabel} מעוניין/ת בקבוצה שלך.`;
        const notifications = recipients.map((u) => ({
          sender_id: currentUser.id,
          recipient_id: u.id,
          title: notifTitle,
          description: notifDesc,
        }));
        await supabase.from('notifications').insert(notifications as any);
      }
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
      <GroupCard
        groupId={(item as any).groupId}
        users={(item as any).users}
        apartment={(item as any).apartment}
        matchScores={matchScores}
        onLike={(groupId, users) => handleGroupLike(groupId, users)}
        onPass={(groupId, users) => handleGroupPass(groupId, users)}
        mediaHeight={swipeCardHeight}
        onOpen={(userId: string) =>
          router.push({
            pathname: '/(tabs)/user/[id]',
            params: { id: userId, from: 'partners' } as any,
          })
        }
        onOpenApartment={(apartmentId: string) =>
          router.push({
            pathname: '/(tabs)/apartment/[id]',
            params: { id: apartmentId } as any,
          })
        }
        style={{ marginBottom: 0 }}
      />
    );
  };

  const triggerSwipe = (type: 'like' | 'pass') => {
    const outTarget = type === 'like' ? screenWidth + 200 : -screenWidth - 200;
    translateX.value = withTiming(outTarget, { duration: 180 }, (finished) => {
      if (finished) runOnJS(onSwipe)(type);
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
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.topActionBtn}
            onPress={() => setShowFilters(true)}
          >
            <SlidersHorizontal size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>לא נמצאו שותפים</Text>
            <Text style={styles.emptySubtext}>חזרו מאוחר יותר</Text>
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
      {items.length ? (
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
              <Heart size={26} color="#7C5CFF" fill="#7C5CFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {showFilters ? (
        <Modal
          visible
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setShowFilters(false)}
        >
          <View style={styles.filterOverlay}>
            <TouchableOpacity style={styles.filterBackdrop} activeOpacity={1} onPress={() => setShowFilters(false)} />
            <View style={[styles.filterSheet, { paddingBottom: Math.max(20, 20 + insets.bottom) }]}>
            <Text style={styles.filterTitle}>סינון תוצאות</Text>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>סוג פרופיל</Text>
              <View style={styles.chipsRow}>
                {[
                  { key: 'all', label: 'כולם' },
                  { key: 'singles', label: 'בודדים' },
                  { key: 'groups', label: 'קבוצות' },
                ].map((opt: any) => {
                  const active = profileType === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setProfileType(opt.key)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>טווח גילאים</Text>
              <View style={styles.ageRow}>
                <View style={styles.ageInputWrap}>
                  <Text style={styles.ageLabel}>מגיל</Text>
                  <TextInput
                    style={styles.ageInput}
                    keyboardType="numeric"
                    placeholder="18"
                    placeholderTextColor="#6B7280"
                    value={ageActive ? String(ageMin) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t || '', 10);
                      if (!isNaN(n)) {
                        setAgeMin(n);
                        setAgeActive(true);
                      } else {
                        setAgeActive(false);
                      }
                    }}
                  />
                </View>
                <View style={styles.ageInputWrap}>
                  <Text style={styles.ageLabel}>עד גיל</Text>
                  <TextInput
                    style={styles.ageInput}
                    keyboardType="numeric"
                    placeholder="40"
                    placeholderTextColor="#6B7280"
                    value={ageActive ? String(ageMax) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t || '', 10);
                      if (!isNaN(n)) {
                        setAgeMax(n);
                        setAgeActive(true);
                      } else {
                        setAgeActive(false);
                      }
                    }}
                  />
                </View>
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>עיר</Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  key="any"
                  style={[styles.chip, selectedCities.length === 0 && styles.chipActive]}
                  onPress={() => setSelectedCities([])}
                >
                  <Text style={[styles.chipText, selectedCities.length === 0 && styles.chipTextActive]}>
                    הכל
                  </Text>
                </TouchableOpacity>
                {Object.keys(cityNeighborhoods).map((c) => {
                  const active = selectedCities.includes(c);
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        if (active) {
                          setSelectedCities(selectedCities.filter((x) => x !== c));
                        } else {
                          setSelectedCities([...selectedCities, c]);
                        }
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {profileType !== 'groups' ? (
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>מגדר (משתמשים בודדים)</Text>
                <View style={styles.chipsRow}>
                  {[
                    { key: 'any', label: 'כולם' },
                    { key: 'female', label: 'נשים' },
                    { key: 'male', label: 'גברים' },
                  ].map((g: any) => {
                    const active = gender === g.key;
                    return (
                      <TouchableOpacity
                        key={g.key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setGender(g.key)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {profileType === 'groups' ? (
              <>
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>מגדר (קבוצות)</Text>
                  <View style={styles.chipsRow}>
                    {[
                      { key: 'any', label: 'כולם' },
                      { key: 'male', label: 'רק בנים' },
                      { key: 'female', label: 'רק בנות' },
                    ].map((g: any) => {
                      const active = groupGender === g.key;
                      return (
                        <TouchableOpacity
                          key={g.key}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setGroupGender(g.key)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>מספר שותפים בקבוצה</Text>
                  <View style={styles.chipsRow}>
                    {(['any', 2, 3] as any[]).map((sz) => {
                      const active = groupSize === sz;
                      return (
                        <TouchableOpacity
                          key={String(sz)}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setGroupSize(sz as any)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {sz === 'any' ? 'הכל' : String(sz)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : null}

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
                }}
              >
                <Text style={styles.resetText}>איפוס</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, styles.applyBtn]}
                activeOpacity={0.9}
                onPress={() => {
                  setShowFilters(false);
                  fetchUsersAndGroups();
                }}
              >
                <Text style={styles.applyText}>הצג תוצאות</Text>
              </TouchableOpacity>
            </View>
          </View>
          </View>
        </Modal>
      ) : null}
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
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
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
  topActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    backgroundColor: 'rgba(124,92,255,0.42)',
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
    borderColor: 'rgba(124,92,255,0.22)',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  },
  filterSheet: {
    backgroundColor: '#14141C',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 28,
    zIndex: 1000,
  },
  filterTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 12,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    color: '#C7CBD1',
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'right',
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8 as any,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1C1C26',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    backgroundColor: '#2A2A37',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipText: {
    color: '#E6E9F0',
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#0F0F14',
  },
  ageRow: {
    flexDirection: 'row-reverse',
    gap: 12 as any,
  },
  ageInputWrap: {
    flex: 1,
  },
  ageLabel: {
    color: '#9DA4AE',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'right',
  },
  ageInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1C1C26',
    color: '#E6E9F0',
    paddingHorizontal: 12,
    textAlign: 'right',
  },
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  filterBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flex: 1,
  },
  resetBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  applyBtn: {
    backgroundColor: '#22C55E',
    marginLeft: 8,
  },
  resetText: {
    color: '#E6E9F0',
    fontWeight: '800',
    textAlign: 'center',
  },
  applyText: {
    color: '#0F0F14',
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
  onLike: (groupId: string, users: User[]) => void;
  onPass: (groupId: string, users: User[]) => void;
  onOpenApartment: (apartmentId: string) => void;
  style?: ViewStyle;
  mediaHeight?: number;
}) {
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
              onPress={() => onOpen(u.id)}
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
                <Image source={{ uri: u.avatar_url || DEFAULT_AVATAR }} style={groupStyles.cellImage} resizeMode="cover" />
                <View style={[groupStyles.matchBadge, groupStyles.matchBadgeLarge]}>
                  <Text style={groupStyles.matchBadgeValue}>{formatMatchPercent(matchPercent)}</Text>
                  <Text style={groupStyles.matchBadgeLabel}>התאמה</Text>
                </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,15,20,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    zIndex: 3,
  },
  matchBadgeLarge: {
    top: 12,
    right: 12,
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  matchBadgeSmall: {
    bottom: -6,
    right: -6,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  matchBadgeValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  matchBadgeValueSmall: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  matchBadgeLabel: {
    color: '#C9CDD6',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
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
    color: '#22C55E',
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
