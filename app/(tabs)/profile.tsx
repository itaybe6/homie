import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Platform,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LogOut,
  Edit,
  Save,
  X,
  Plus,
  MapPin,
  Inbox,
  Trash2,
  ClipboardList,
  Building2,
  Calendar,
  Camera,
  Copy,
  Image as ImageIcon,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { MotiPressable } from 'moti/interactions';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { User, Apartment, UserSurveyResponse } from '@/types/database';


type AvatarFabItem = {
  id: 'camera' | 'library';
  icon: React.ComponentType<{ size?: number; color?: string }>;
  bg: string;
  accessibilityLabel: string;
};

function AvatarPhotoFab({
  disabled,
  showCamera,
  onPick,
}: {
  disabled?: boolean;
  showCamera: boolean;
  onPick: (source: 'camera' | 'library') => Promise<void> | void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const size = 44;
  const iconSize = 18;

  const menu: AvatarFabItem[] = useMemo(() => {
    const items: AvatarFabItem[] = [
      { id: 'library', icon: ImageIcon, bg: '#000000', accessibilityLabel: 'בחר תמונה מהגלריה' },
    ];
    if (showCamera) {
      items.unshift({ id: 'camera', icon: Camera, bg: '#000000', accessibilityLabel: 'צלם תמונה' });
    }
    return items;
  }, [showCamera]);

  return (
    <View style={[styles.avatarCameraBtn, disabled ? { opacity: 0.7 } : null]}>
      <View style={{ position: 'absolute', width: size, height: size }}>
        {menu.map((item, index) => {
          const offsetAngle = Math.PI / 3;
          const radius = size * (menu.length === 2 ? 1.45 : 1.25);

          // Since the FAB is anchored to the right, keep the radial menu opening
          // to the left/up so buttons won't be clipped by the screen edge.
          // For 2 items, use fixed angles with larger separation to prevent overlap.
          const angle =
            menu.length === 2
              ? index === 0
                ? -Math.PI / 7 // ~ -25.7° (up + a little left)
                : -Math.PI / 1.9 // ~ -94.7° (mostly left + a bit up)
              : (index - Math.floor(menu.length / 2)) * offsetAngle;

          return (
            <MotiPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              disabled={!!disabled || !isOpen}
              onPress={async () => {
                if (disabled || !isOpen) return;
                try {
                  await onPick(item.id);
                } finally {
                  setIsOpen(false);
                }
              }}
              animate={{
                translateX: Math.sin(angle) * (isOpen ? radius : 3),
                translateY: -Math.cos(angle) * (isOpen ? radius : 3),
                opacity: isOpen ? 1 : 0,
              }}
              transition={{ delay: index * 90 }}
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: item.bg,
                zIndex: 10 + index,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                shadowColor: '#000000',
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              }}
            >
              {(() => {
                const Icon = item.icon;
                return <Icon size={iconSize} color="#FFFFFF" />;
              })()}
            </MotiPressable>
          );
        })}
      </View>

      <MotiPressable
        accessibilityRole="button"
        accessibilityLabel={isOpen ? 'סגור תפריט תמונת פרופיל' : 'פתח תפריט תמונת פרופיל'}
        disabled={!!disabled}
        onPress={() => {
          if (disabled) return;
          setIsOpen((v) => !v);
        }}
        animate={{ rotate: isOpen ? '0deg' : '-45deg' }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={iconSize} color="#5e3f2d" />
      </MotiPressable>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const apartments = useApartmentStore((state) => state.apartments);
  const removeApartmentFromStore = useApartmentStore((state) => state.removeApartment);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [profile, setProfile] = useState<User | null>(null);
  const [userApartments, setUserApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [leavingApartmentId, setLeavingApartmentId] = useState<string | null>(null);
  const [deletingOwnedApartmentId, setDeletingOwnedApartmentId] = useState<string | null>(null);
  const [aptMembers, setAptMembers] = useState<Record<string, User[]>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [sharedGroups, setSharedGroups] = useState<
    { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]
  >([]);
  const [surveyResponse, setSurveyResponse] = useState<UserSurveyResponse | null>(null);
  const ignoreNextGalleryPressRef = useRef(false);

  const ownedApartments = useMemo(() => {
    const uid = (user as any)?.id as string | undefined;
    if (!uid) return [];
    return userApartments.filter((a: any) => String(a?.owner_id || '') === String(uid));
  }, [userApartments, user]);

  const openAddPartnersFromProfile = async () => {
    const owned = ownedApartments;
    if (!owned.length) return;

    const go = (apt: any) => {
      const id = apt?.id;
      if (!id) return;
      router.push({ pathname: '/apartment/[id]', params: { id, openAdd: '1', returnTo: '/(tabs)/profile' } } as any);
    };

    if (owned.length === 1) {
      go(owned[0] as any);
      return;
    }

    // Multiple owned apartments: ask which one to invite partners to (native). On web fallback to first.
    if (Platform.OS === 'web') {
      go(owned[0] as any);
      return;
    }

    const options = owned.slice(0, 6).map((apt: any) => ({
      text: String(apt?.title || 'דירה'),
      onPress: () => go(apt),
    }));
    Alert.alert('לאיזו דירה להוסיף שותפים?', 'בחר/י דירה:', [
      { text: 'ביטול', style: 'cancel' },
      ...options,
    ]);
  };

  const surveySheetMaxHeight = useMemo(() => {
    const hardMax = Math.max(420, Math.round(windowHeight * 0.88));
    // Keep a little space at the top so the sheet never "sticks" to full screen.
    const safeMax = Math.max(420, Math.round(windowHeight - (insets.top + 24)));
    return Math.min(hardMax, safeMax);
  }, [windowHeight, insets.top]);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  // Removed deprecated interests field

  useEffect(() => {
    fetchProfile();
  }, [user]);

  // Re-fetch when the screen regains focus (after approvals/merges)
  useFocusEffect(
    (React as any).useCallback(() => {
      fetchProfile();
      return () => {};
    }, [user?.id])
  );

  // Subscribe to realtime membership changes for the current user and refresh
  useEffect(() => {
    if (!user?.id) return;
    try {
      const channel = supabase
        .channel(`profile-${user.id}-group-memberships`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profile_group_members', filter: `user_id=eq.${user.id}` },
          () => {
            fetchProfile();
          }
        )
        .subscribe();
      return () => {
        try { supabase.removeChannel(channel); } catch {}
      };
    } catch {
      // ignore
    }
  }, [user?.id]);

  const APT_IMAGE_PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  const transformSupabaseImageUrl = (value: string): string => {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    // Prefer render endpoint for speed/size, keep query params (if any) and append our own.
    if (trimmed.includes('/storage/v1/object/public/')) {
      const [base, query] = trimmed.split('?');
      const transformed = base.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const params: string[] = [];
      if (query) params.push(query);
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

  // Apartments may store either full public URLs OR storage object paths (e.g. "apartments/<aptId>/<file>.jpg").
  // This helper normalizes both into a displayable public URL (object/public).
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

  const normalizeApartmentImageUrls = (value: unknown): string[] => {
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

  const ApartmentImageThumb = ({ uri, style }: { uri: string; style?: any }) => {
    const [candidateIdx, setCandidateIdx] = useState(0);
    const original = normalizeSupabasePublicUrlForFallback(uri || '');
    const transformed = original ? transformSupabaseImageUrl(original) : '';
    const candidates = [transformed, original, APT_IMAGE_PLACEHOLDER]
      .map((u) => (u || '').trim())
      .filter(Boolean);
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
  const getApartmentPrimaryImage = (apartment: Apartment): string => {
    const PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
    const anyValue: any = (apartment as any).image_urls;
    if (Array.isArray(anyValue) && anyValue[0]) return anyValue[0] as string;
    if (typeof anyValue === 'string') {
      try {
        const parsed = JSON.parse(anyValue);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0] as string;
      } catch {
        try {
          const asArray = anyValue
            .replace(/^{|}$/g, '')
            .split(',')
            .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
          if (asArray[0]) return asArray[0] as string;
        } catch {}
      }
    }
    if (apartment.image_url) return apartment.image_url;
    return PLACEHOLDER;
  };

  const getObjectPathFromPublicUrl = (publicUrl: string): string | null => {
    if (!publicUrl) return null;
    const marker = '/object/public/user-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
  };

  const formatYesNo = (value?: boolean | null): string => {
    if (value === undefined || value === null) return '';
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
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(' • ');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter(Boolean).join(' • ');
        }
      } catch {
        // fall through to cleanup
      }
      return value
        .replace(/[{}\[\]"]/g, ' ')
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(' • ');
    }
    return '';
  };

  const removeImageAt = async (idx: number) => {
    try {
      if (!user?.id || !profile?.image_urls) return;
      const url = profile.image_urls[idx];
      if (!url) return;

      const shouldProceed = await new Promise<boolean>((resolve) => {
        Alert.alert('מחיקת תמונה', 'למחוק את התמונה הזו?', [
          { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
          { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!shouldProceed) return;

      setIsDeletingImage(true);
      const next = profile.image_urls.filter((_, i) => i !== idx);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      setProfile((prev) => (prev ? { ...prev, image_urls: next } as any : prev));
      setViewerIndex(null);

      try {
        const objectPath = getObjectPathFromPublicUrl(url);
        if (objectPath) {
          await supabase.storage.from('user-images').remove([objectPath]);
        }
      } catch {}
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את התמונה');
    } finally {
      setIsDeletingImage(false);
    }
  };

  const confirmLeaveGroup = async (groupId: string) => {
    if (!user?.id || !groupId) return;
    if (leavingGroupId) return;
    try {
      const shouldProceed =
        Platform.OS === 'web'
          ? (typeof confirm === 'function'
              ? confirm('לעזוב את קבוצת השותפים? אפשר להצטרף שוב רק בהזמנה.')
              : true)
          : await new Promise<boolean>((resolve) => {
              Alert.alert('עזיבת קבוצה', 'לעזוב את קבוצת השותפים? אפשר להצטרף שוב רק בהזמנה.', [
                { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
                { text: 'עזוב/י קבוצה', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });
      if (!shouldProceed) return;

      setLeavingGroupId(groupId);
      const { error } = await supabase
        .from('profile_group_members')
        .update({ status: 'LEFT' } as any)
        .eq('group_id', groupId)
        .eq('user_id', user.id);
      if (error) throw error;

      Alert.alert('הצלחה', 'עזבת את הקבוצה.');
      fetchProfile();
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעזוב את הקבוצה כעת');
    } finally {
      setLeavingGroupId(null);
    }
  };

  const confirmLeaveApartment = async (apt: Apartment) => {
    if (!user?.id || !apt?.id) return;
    if (leavingApartmentId) return;

    const currentPartners: string[] = Array.isArray((apt as any).partner_ids) ? ((apt as any).partner_ids as string[]) : [];
    const isOwner = String(user.id) === String((apt as any).owner_id || '');
    const isPartner = currentPartners.map(String).includes(String(user.id));

    if (isOwner) {
      Alert.alert('לא ניתן לעזוב', 'בעל/ת הדירה לא יכול/ה לעזוב את הדירה. אפשר לנהל את הדירה בעמוד הדירה או בהגדרות.');
      return;
    }
    if (!isPartner) {
      Alert.alert('שגיאה', 'אינך משויך/ה כשותף/ה לדירה זו');
      return;
    }

    try {
      const shouldProceed =
        Platform.OS === 'web'
          ? (typeof confirm === 'function'
              ? confirm('לעזוב את הדירה? ניתן להצטרף שוב בהזמנה.')
              : true)
          : await new Promise<boolean>((resolve) => {
              Alert.alert('עזיבת דירה', 'לעזוב את הדירה? ניתן להצטרף שוב בהזמנה.', [
                { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
                { text: 'עזוב/י דירה', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });
      if (!shouldProceed) return;

      setLeavingApartmentId(apt.id);
      const nextPartners = currentPartners.filter((pid) => String(pid) !== String(user.id));
      const { error } = await supabase.from('apartments').update({ partner_ids: nextPartners } as any).eq('id', apt.id);
      if (error) throw error;

      Alert.alert('הצלחה', 'עזבת את הדירה.');
      fetchProfile();
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעזוב את הדירה כעת');
    } finally {
      setLeavingApartmentId(null);
    }
  };

  const confirmDeleteOwnedApartment = async (apt: Apartment) => {
    if (!user?.id || !apt?.id) return;
    if (deletingOwnedApartmentId) return;

    const isOwner = String((apt as any)?.owner_id || '') === String(user.id);
    if (!isOwner) {
      Alert.alert('שגיאה', 'רק בעל/ת הדירה יכול/ה למחוק את הדירה');
      return;
    }

    try {
      const aptTitle = String((apt as any)?.title || 'הדירה');
      const shouldProceed =
        Platform.OS === 'web'
          ? (typeof confirm === 'function'
              ? confirm(`למחוק את "${aptTitle}"? פעולה זו אינה ניתנת לשחזור.`)
              : true)
          : await new Promise<boolean>((resolve) => {
              Alert.alert('מחיקת דירה', `למחוק את "${aptTitle}"? פעולה זו אינה ניתנת לשחזור.`, [
                { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
                { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });
      if (!shouldProceed) return;

      setDeletingOwnedApartmentId(apt.id);

      // Security: scope the delete by both id and owner_id.
      const { error } = await supabase.from('apartments').delete().eq('id', apt.id).eq('owner_id', user.id);
      if (error) throw error;

      // Update local UI immediately.
      setUserApartments((prev) => prev.filter((a) => String(a.id) !== String(apt.id)));
      setAptMembers((prev) => {
        const next = { ...prev };
        delete next[apt.id];
        return next;
      });
      removeApartmentFromStore(apt.id);

      Alert.alert('נמחק', 'הדירה נמחקה בהצלחה.');

      // Re-fetch to ensure all profile-derived state is consistent.
      fetchProfile();
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את הדירה כעת');
    } finally {
      setDeletingOwnedApartmentId(null);
    }
  };

  const fetchProfile = async () => {
    if (!user) {
      setSurveyResponse(null);
      setIsLoading(false);
      return;
    }

    setSurveyResponse(null);

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name);
        setAge(profileData.age?.toString() || '');
        setBio(profileData.bio || '');
      }

      let latestSurvey: UserSurveyResponse | null = null;
      try {
        const { data: surveyRows, error: surveyError } = await supabase
          .from('user_survey_responses')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (surveyError) throw surveyError;
        latestSurvey = (surveyRows && surveyRows[0]) || null;
      } catch (surveyErr) {
        console.error('Error fetching survey response:', surveyErr);
      }
      setSurveyResponse(latestSurvey);

      const [{ data: ownedApts, error: ownedError }, { data: partnerApts, error: partnerError }] =
        await Promise.all([
          supabase.from('apartments').select('*').eq('owner_id', user.id),
          supabase.from('apartments').select('*').contains('partner_ids', [user.id]),
        ]);

      if (ownedError) throw ownedError;
      if (partnerError) throw partnerError;

      const mergedById: Record<string, Apartment> = {};
      (ownedApts || []).forEach((apt: any) => {
        mergedById[apt.id] = apt;
      });
      (partnerApts || []).forEach((apt: any) => {
        mergedById[apt.id] = apt;
      });

      const mergedApts = Object.values(mergedById) as Apartment[];
      setUserApartments(mergedApts);

      // Load roommates (partners) avatars per apartment
      const membersMap: Record<string, User[]> = {};
      await Promise.all(
        mergedApts.map(async (apt: any) => {
          const ids = apt.partner_ids as string[] | undefined;
          if (ids && ids.length > 0) {
            const { data: usersData, error: usersError } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', ids);
            if (!usersError && usersData) {
              membersMap[apt.id] = usersData as any;
            }
          }
        })
      );
      setAptMembers(membersMap);

      // Load shared profile groups (compact view)
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
        if (!groupIds.length) {
          setSharedGroups([]);
        } else {
          const results: { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[] = [];
          for (const gid of groupIds) {
            const { data: groupRow } = await supabase
              .from('profile_groups')
              .select('id,name,status')
              .eq('id', gid)
              .eq('status', 'ACTIVE')
              .maybeSingle();
            if (!groupRow) continue;
            const { data: memberRows } = await supabase
              .from('profile_group_members')
              .select('user_id')
              .eq('group_id', gid)
              .eq('status', 'ACTIVE');
            const memberIds = (memberRows || []).map((m: any) => m.user_id).filter(Boolean);
            if (!memberIds.length) continue;
            const { data: usersRows } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', memberIds);
            results.push({
              id: gid,
              name: (groupRow as any)?.name,
              members: ((usersRows || []) as any[]).filter(Boolean) as any,
            });
          }
          setSharedGroups(results);
        }
      } catch {
        setSharedGroups([]);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('שגיאה', 'שם מלא הוא שדה חובה');
      return;
    }

    setIsSaving(true);

    try {
      const ageNum = age ? parseInt(age) : null;

      if (age && (isNaN(ageNum!) || ageNum! <= 0)) {
        Alert.alert('שגיאה', 'גיל לא תקין');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          age: ageNum,
          bio: bio || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user!.id);

      if (error) throw error;

      Alert.alert('הצלחה', 'הפרופיל עודכן בהצלחה');
      setIsEditing(false);
      fetchProfile();
    } catch (error: any) {
      Alert.alert('שגיאה', error.message || 'לא ניתן לעדכן את הפרופיל');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setFullName(profile.full_name);
      setAge(profile.age?.toString() || '');
      setBio(profile.bio || '');
    }
    setIsEditing(false);
  };

  const handleSignOut = async () => {
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח שברצונך להתנתק?') : true;
        if (!confirmed) return;
        await authService.signOut();
        setUser(null);
        router.replace('/auth/login');
        return;
      }

      Alert.alert('התנתקות', 'האם אתה בטוח שברצונך להתנתק?', [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'התנתק',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.signOut();
              setUser(null);
              router.replace('/auth/login');
            } catch (error) {
              Alert.alert('שגיאה', 'לא ניתן להתנתק');
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להתנתק');
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.') : true;
        if (!confirmed) return;
      } else {
        const shouldProceed = await new Promise<boolean>((resolve) => {
          Alert.alert('מחיקת פרופיל', 'האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.', [
            { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
            { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!shouldProceed) return;
      }

      setIsDeleting(true);
      const { error: deleteError } = await supabase.rpc('delete_my_account');
      if (deleteError) {
        const msg = String((deleteError as any)?.message || deleteError);
        if (msg.toLowerCase().includes('function') && msg.toLowerCase().includes('delete_my_account')) {
          throw new Error(
            'חסר RPC במסד הנתונים למחיקת חשבון (public.delete_my_account). נא להריץ את המיגרציה של Supabase ואז לנסות שוב.'
          );
        }
        throw deleteError;
      }

      try {
        await authService.signOut();
      } catch {
        // ignore sign out failure after deletion; we'll still clear local state
      }
      setUser(null);
      router.replace('/auth/login');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את הפרופיל כעת');
    } finally {
      setIsDeleting(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    // Backwards compat: default to gallery
    return pickAndUploadAvatarFrom('library');
  };

  const uploadAvatarFromUri = async (uri: string) => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      // Check image dimensions and only resize if larger than 800px
      const imageInfo = await ImageManipulator.manipulateAsync(uri, []);
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > 800) {
        actions.push({ resize: { width: 800 } });
      }
      // Compress the image
      const compressed = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      const response = await fetch(compressed.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const filePath = `users/${user.id}/${fileName}`;
      // Use arrayBuffer on native (Blob/File may not exist)
      const filePayload: any = arrayBuffer as any;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      Alert.alert('הצלחה', profile?.avatar_url ? 'תמונת הפרופיל עודכנה' : 'תמונת הפרופיל נוספה');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן להעלות תמונה');
    } finally {
      setIsSaving(false);
    }
  };

  const pickAndUploadAvatarFrom = async (source: 'camera' | 'library') => {
    try {
      if (!user?.id) return;

      if (Platform.OS === 'web') {
        // Web: camera flow isn't reliable; fallback to file picker.
        // Also: avoid permissions API here; some browsers block the picker if it's not opened
        // directly from the click handler call stack.
        source = 'library';
      }

      if (source === 'camera') {
        const perms = await ImagePicker.requestCameraPermissionsAsync();
        if (!perms.granted) {
          Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה למצלמה כדי לצלם תמונה');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });
        if (result.canceled || !result.assets?.length) return;
        await uploadAvatarFromUri(result.assets[0].uri);
        return;
      }

      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });
        if (result.canceled || !result.assets?.length) return;
        await uploadAvatarFromUri(result.assets[0].uri);
        return;
      }

      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להעלות תמונה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) return;
      await uploadAvatarFromUri(result.assets[0].uri);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעדכן את תמונת הפרופיל');
    }
  };

  // Avatar action UI is handled by the animated FAB (no modal sheet).

  // moved extra-photos upload to edit profile screen
  const addGalleryImage = async () => {
    try {
      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להעלות תמונה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length || !user || !profile) return;

      setIsAddingImage(true);
      const asset = result.assets[0];
      // Check image dimensions and only resize if larger than 1200px
      const imageInfo = await ImageManipulator.manipulateAsync(asset.uri, []);
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > 1200) {
        actions.push({ resize: { width: 1200 } });
      }
      // Compress the image
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const response = await fetch(compressed.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const filePath = `users/${user.id}/gallery/${fileName}`;
      const filePayload: any = arrayBuffer as any;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const next = [...(profile.image_urls || []), publicUrl];
      const { error: updateError } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, image_urls: next } as any : prev));
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן להוסיף תמונה');
    } finally {
      setIsAddingImage(false);
    }
  };

  const surveyHighlights = useMemo(() => {
    if (!surveyResponse) return [];
    const highlights: { label: string; value: string }[] = [];
    const push = (label: string, raw?: string) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      highlights.push({ label, value: trimmed });
    };

    push('עיר מועדפת', surveyResponse.preferred_city || undefined);
    if (typeof surveyResponse.price_range === 'number') {
      const formatted = formatCurrency(surveyResponse.price_range);
      push('תקציב חודשי', formatted);
    }
    push('כניסה מתוכננת', formatMonthLabel(surveyResponse.move_in_month));
    push('וייב יומיומי', surveyResponse.lifestyle || surveyResponse.home_vibe || undefined);
    if (surveyResponse.is_sublet) {
      highlights.push({ label: 'סאבלט', value: 'כן' });
    }

    return highlights;
  }, [surveyResponse]);

  type SurveySectionKey = 'about' | 'apartment' | 'partner';

  const surveyItems = useMemo(() => {
    if (!surveyResponse) return [];
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

    // עליי
    add('about', 'עיסוק', surveyResponse.occupation);
    if (typeof surveyResponse.student_year === 'number' && surveyResponse.student_year > 0) {
      add('about', 'שנת לימודים', `שנה ${surveyResponse.student_year}`);
    }
    addBool('about', 'עבודה מהבית', surveyResponse.works_from_home);
    addBool('about', 'שומר/ת כשרות', surveyResponse.keeps_kosher);
    addBool('about', 'שומר/ת שבת', surveyResponse.is_shomer_shabbat);
    add('about', 'תזונה', surveyResponse.diet_type);
    addBool('about', 'מעשן/ת', surveyResponse.is_smoker);
    add('about', 'מצב זוגי', surveyResponse.relationship_status);
    addBool('about', 'חיית מחמד בבית', surveyResponse.has_pet);
    if (typeof surveyResponse.cleanliness_importance === 'number') {
      add('about', 'חשיבות ניקיון', `${surveyResponse.cleanliness_importance}/5`);
    }
    add('about', 'תדירות ניקיון', surveyResponse.cleaning_frequency);
    add('about', 'העדפת אירוח', surveyResponse.hosting_preference);
    add('about', 'סטייל בישול', surveyResponse.cooking_style);
    add('about', 'וייב בבית', surveyResponse.home_vibe);
    add('about', 'סגנון חיים', (surveyResponse as any).lifestyle);

    // הדירה שאני מחפש/ת
    addBool('apartment', 'תת-השכרה', surveyResponse.is_sublet);
    if (surveyResponse.sublet_month_from || surveyResponse.sublet_month_to) {
      const period = [formatMonthLabel(surveyResponse.sublet_month_from), formatMonthLabel(surveyResponse.sublet_month_to)]
        .filter(Boolean)
        .join(' → ');
      add('apartment', 'טווח סאבלט', period);
    }
    if (typeof surveyResponse.price_range === 'number') {
      add('apartment', 'תקציב שכירות', formatCurrency(surveyResponse.price_range));
    }
    addBool('apartment', 'חשבונות כלולים', surveyResponse.bills_included);
    add('apartment', 'עיר מועדפת', surveyResponse.preferred_city);
    const neighborhoodsJoined = normalizeNeighborhoods((surveyResponse.preferred_neighborhoods as unknown) ?? null);
    if (neighborhoodsJoined) {
      add('apartment', 'שכונות מועדפות', neighborhoodsJoined);
    }
    add('apartment', 'קומה מועדפת', surveyResponse.floor_preference);
    addBool('apartment', 'מרפסת', surveyResponse.has_balcony);
    addBool('apartment', 'מעלית', surveyResponse.has_elevator);
    addBool('apartment', 'חדר מאסטר', surveyResponse.wants_master_room);
    add('apartment', 'חודש כניסה', formatMonthLabel(surveyResponse.move_in_month));
    if (typeof surveyResponse.preferred_roommates === 'number') {
      add('apartment', 'מספר שותפים מועדף', `${surveyResponse.preferred_roommates}`);
    }
    addBool('apartment', 'חיות מורשות', surveyResponse.pets_allowed);
    addBool('apartment', 'עם מתווך', surveyResponse.with_broker);
    // Some schemas store min/max instead of preferred_age_range; derive when missing.
    const minAge = (surveyResponse as any).preferred_age_min;
    const maxAge = (surveyResponse as any).preferred_age_max;
    const derivedAgeRange =
      typeof minAge === 'number' && typeof maxAge === 'number'
        ? `${minAge}–${maxAge}`
        : typeof minAge === 'number'
          ? `${minAge}+`
          : typeof maxAge === 'number'
            ? `עד ${maxAge}`
            : null;
    // השותפ/ה שאני מחפש/ת
    add('partner', 'טווח גילאים רצוי', surveyResponse.preferred_age_range || derivedAgeRange);
    add('partner', 'מגדר שותפים', surveyResponse.preferred_gender);
    add('partner', 'עיסוק שותפים', surveyResponse.preferred_occupation);
    add('partner', 'שותפים ושבת', surveyResponse.partner_shabbat_preference);
    add('partner', 'שותפים ותזונה', surveyResponse.partner_diet_preference);
    add('partner', 'שותפים ועישון', surveyResponse.partner_smoking_preference);
    add('partner', 'שותפים וחיות', surveyResponse.partner_pets_preference);

    return items;
  }, [surveyResponse]);

  const surveySubtitle = useMemo(() => {
    if (!surveyResponse || !surveyHighlights.length) {
      return 'לחיצה להצגת סיכום ההעדפות';
    }
    const values = surveyHighlights.map((h) => h.value).filter(Boolean);
    return values.slice(0, 2).join(' • ') || 'לחיצה להצגת סיכום ההעדפות';
  }, [surveyResponse, surveyHighlights]);

  const surveyStatusLabel = surveyResponse
    ? surveyResponse.is_completed
      ? 'הסקר הושלם'
      : 'בטיוטה'
    : 'טרם מולא';
  const surveyStatusStyle = surveyResponse
    ? surveyResponse.is_completed
      ? styles.surveyBadgeSuccess
      : styles.surveyBadgePending
    : styles.surveyBadgeMuted;

  const isSurveyCompleted = !!surveyResponse?.is_completed;

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#5e3f2d" />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: 16, alignItems: 'center', gap: 12 }}>
          <Text style={{ color: '#111827', fontSize: 18, fontWeight: '800', textAlign: 'right', alignSelf: 'stretch' }}>לא מחובר/ת</Text>
          <Text style={{ color: '#6B7280', textAlign: 'right', alignSelf: 'stretch' }}>
            כדי לראות את הפרופיל שלך, יש להתחבר או להירשם.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            style={{ backgroundColor: '#5e3f2d', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>כניסה / הרשמה</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[
          styles.scrollContent,
          {
            // add top spacer so the global top bar won't overlap the photo
            paddingTop: 60,
            paddingBottom: Math.max(220, 120 + insets.bottom),
          },
        ]}>

        {!isEditing ? (
          <View style={styles.profileCardShadow}>
          <View style={styles.profileCard}>
            <View style={styles.photoWrap}>
              <Image
                source={{
                  uri:
                    profile?.avatar_url ||
                    'https://cdn-icons-png.flaticon.com/512/847/847969.png',
                }}
                style={styles.photo}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.6)"]}
                style={styles.photoBottomGradient}
                pointerEvents="none"
              />

              <AvatarPhotoFab
                disabled={isSaving}
                showCamera={Platform.OS !== 'web'}
                onPick={(source) => pickAndUploadAvatarFrom(source)}
              />
            </View>

            <View style={styles.infoPanel}>
              <Text style={styles.nameText}>
                {profile?.full_name || 'משתמש/ת'}
              </Text>
              {(profile?.address || profile?.city || profile?.age) ? (
                <View style={styles.metaChipsRow}>
                  {(profile?.address || profile?.city) ? (
                    <View style={styles.metaChip}>
                      <MapPin size={14} color="#5e3f2d" />
                      <Text style={styles.metaChipText} numberOfLines={1}>
                        {profile?.address || profile?.city}
                      </Text>
                    </View>
                  ) : null}
                  {profile?.age ? (
                    <View style={styles.metaChip}>
                      <Calendar size={14} color="#5e3f2d" />
                      <Text style={styles.metaChipText}>גיל {profile.age}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {profile?.bio ? (
                <View style={styles.bioCard}>
                  <Text style={styles.bioTitle}>אודות</Text>
                  <Text style={styles.bioText}>{profile.bio}</Text>
                </View>
              ) : null}

              {/* per design, action buttons moved to settings screen */}

              {/* gallery grid moved to its own section below */}
            </View>
          </View>
          </View>
        ) : (
          <View style={styles.editCard}>
            <View style={styles.editHeaderRow}>
              <Text style={styles.editTitle}>עריכת פרופיל</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit} disabled={isSaving}>
                  <X size={20} color="#9DA4AE" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Save size={20} color="#FFF" />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>שם מלא</Text>
                <TextInput style={styles.input} value={fullName} onChangeText={setFullName} editable={!isSaving} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>גיל</Text>
                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                  placeholder="לא חובה"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>אודות</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  placeholder="ספר/י קצת על עצמך..."
                  editable={!isSaving}
                />
              </View>
            </View>
          </View>
        )}

        {/* Shared profile (if any) */}
        <View style={styles.sectionDark}>
          {sharedGroups.length > 0 ? (
            sharedGroups.map((g) => (
              <View key={g.id} style={styles.sharedCard}>
                <View style={styles.sharedCardHeaderRow}>
                  <Text style={styles.sharedCardTitle} numberOfLines={1}>
                    {(g.name || 'פרופיל משותף').toString()}
                  </Text>
                  <View style={styles.sharedHeaderActions}>
                    <TouchableOpacity
                      style={[
                        styles.sectionActionPill,
                        styles.sectionActionPillDanger,
                        leavingGroupId === g.id ? { opacity: 0.7 } : null,
                      ]}
                      activeOpacity={0.9}
                      onPress={() => confirmLeaveGroup(g.id)}
                      disabled={!!leavingGroupId}
                      accessibilityRole="button"
                      accessibilityLabel="עזוב קבוצה"
                    >
                      {leavingGroupId === g.id ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <Text style={styles.sectionActionPillTextDanger}>עזוב/י</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.sharedMembersGrid}>
                  {g.members.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.sharedMemberTile}
                      activeOpacity={0.9}
                      onPress={() => {
                        if (!m?.id) return;
                        router.push({ pathname: '/user/[id]', params: { id: m.id } });
                      }}
                      disabled={String((user as any)?.id || '') === String(m?.id || '')}
                      accessibilityRole="button"
                      accessibilityLabel={
                        String((user as any)?.id || '') === String(m?.id || '')
                          ? 'זה הפרופיל שלך'
                          : `פתח פרופיל של ${(m.full_name || 'משתמש/ת').toString()}`
                      }
                      accessibilityState={
                        String((user as any)?.id || '') === String(m?.id || '')
                          ? ({ disabled: true } as any)
                          : undefined
                      }
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
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.sharedCard}>
              <View style={styles.sharedCardHeaderRow}>
                <Text style={styles.sharedCardTitle} numberOfLines={1}>
                  השותפים שלי
                </Text>
              </View>
              <View style={styles.sectionEmptyWrap}>
                <View style={styles.sectionEmptyIconPill}>
                  <Inbox size={18} color="#5e3f2d" />
                </View>
                <Text style={styles.sectionEmptyTitle}>כרגע אין שותפים</Text>
                <Text style={styles.sectionEmptyText}>כשתצטרף/י לקבוצה או תזמין/י שותפים, הם יופיעו כאן.</Text>
              </View>
            </View>
          )}
        </View>

        {/* My apartment(s) — match the card style used on other user's profile */}
        <View style={styles.sectionDark}>
          <View style={styles.apartmentsCard}>
            {(() => {
              const uid = (user as any)?.id as string | undefined;
              const ownedApts =
                !!uid
                  ? userApartments.filter((a: any) => String(a?.owner_id || '') === String(uid))
                  : [];
              const leaveableApts =
                !!uid
                  ? userApartments.filter((a: any) => {
                      const isOwner = String(a?.owner_id || '') === String(uid);
                      const isPartner =
                        Array.isArray(a?.partner_ids) && (a.partner_ids as any[]).map(String).includes(String(uid));
                      return !isOwner && isPartner;
                    })
                  : [];
              return (
                <View style={styles.apartmentsHeaderRow}>
                  <Text style={styles.apartmentsHeaderTitle}>הדירה שלי</Text>
                  {(ownedApts.length || leaveableApts.length) ? (
                    <View style={styles.apartmentsHeaderActions}>
                      {ownedApts.length ? (
                        <TouchableOpacity
                          style={[
                            styles.deleteAptCircleBtn,
                            deletingOwnedApartmentId ? { opacity: 0.75 } : null,
                          ]}
                          activeOpacity={0.9}
                          disabled={!!deletingOwnedApartmentId}
                          onPress={async () => {
                            if (deletingOwnedApartmentId) return;
                            if (ownedApts.length === 1) {
                              confirmDeleteOwnedApartment(ownedApts[0] as any);
                              return;
                            }
                            // Multiple owned apartments: ask which one to delete (native). On web fallback to first.
                            if (Platform.OS === 'web') {
                              confirmDeleteOwnedApartment(ownedApts[0] as any);
                              return;
                            }
                            const options = ownedApts.slice(0, 6).map((apt: any) => ({
                              text: String(apt?.title || 'דירה'),
                              style: 'destructive' as const,
                              onPress: () => confirmDeleteOwnedApartment(apt as any),
                            }));
                            Alert.alert('איזו דירה למחוק?', 'בחר/י דירה למחיקה:', [
                              { text: 'ביטול', style: 'cancel' },
                              ...options,
                            ]);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="מחק דירה"
                        >
                          {deletingOwnedApartmentId ? (
                            <ActivityIndicator size="small" color="#DC2626" />
                          ) : (
                            <Trash2 size={18} color="#DC2626" />
                          )}
                        </TouchableOpacity>
                      ) : null}

                      {ownedApts.length ? (
                        <TouchableOpacity
                          style={styles.editAptCircleBtn}
                          activeOpacity={0.9}
                          onPress={async () => {
                            if (ownedApts.length === 1) {
                              const id = (ownedApts[0] as any)?.id;
                              if (!id) return;
                              router.push({ pathname: '/apartment/edit/[id]', params: { id } } as any);
                              return;
                            }
                            // Multiple owned apartments: ask which one to edit (native). On web fallback to first.
                            if (Platform.OS === 'web') {
                              const id = (ownedApts[0] as any)?.id;
                              if (!id) return;
                              router.push({ pathname: '/apartment/edit/[id]', params: { id } } as any);
                              return;
                            }
                            const options = ownedApts.slice(0, 6).map((apt: any) => ({
                              text: String(apt?.title || 'דירה'),
                              onPress: () => {
                                const id = apt?.id;
                                if (!id) return;
                                router.push({ pathname: '/apartment/edit/[id]', params: { id } } as any);
                              },
                            }));
                            Alert.alert('איזו דירה לערוך?', 'בחר/י דירה לעריכה:', [
                              { text: 'ביטול', style: 'cancel' },
                              ...options,
                            ]);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="ערוך דירה"
                        >
                          <Edit size={18} color="#5e3f2d" />
                        </TouchableOpacity>
                      ) : null}

                      {leaveableApts.length ? (
                        <TouchableOpacity
                          style={[
                            styles.sectionActionPill,
                            styles.sectionActionPillDanger,
                            leavingApartmentId ? { opacity: 0.7 } : null,
                          ]}
                          activeOpacity={0.9}
                          disabled={!!leavingApartmentId}
                          onPress={async () => {
                            if (leavingApartmentId) return;
                            if (leaveableApts.length === 1) {
                              confirmLeaveApartment(leaveableApts[0] as any);
                              return;
                            }
                            // Multiple apartments: ask which one to leave (native). On web fallback to first.
                            if (Platform.OS === 'web') {
                              confirmLeaveApartment(leaveableApts[0] as any);
                              return;
                            }
                            const options = leaveableApts.slice(0, 6).map((apt: any) => ({
                              text: String(apt?.title || 'דירה'),
                              onPress: () => confirmLeaveApartment(apt as any),
                            }));
                            Alert.alert('איזו דירה לעזוב?', 'בחר/י דירה לעזיבה:', [
                              { text: 'ביטול', style: 'cancel' },
                              ...options,
                            ]);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="עזוב דירה"
                        >
                          {leavingApartmentId ? (
                            <ActivityIndicator size="small" color="#DC2626" />
                          ) : (
                            <Text style={styles.sectionActionPillTextDanger}>עזוב/י דירה</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })()}

            <View style={{ paddingTop: 12 }}>
              {userApartments.length ? (
                userApartments.map((apt, idx) => {
                  const rawImages = normalizeApartmentImageUrls((apt as any).image_urls);
                  const aptImages = Array.from(new Set(rawImages.map(resolveApartmentImageCandidate).filter(Boolean)));
                  const firstImg = aptImages.length > 0 ? aptImages[0] : APT_IMAGE_PLACEHOLDER;
                  const occupantMembers = aptMembers[apt.id] || [];
                  const visibleOccupants = occupantMembers.slice(0, 4);
                  const overflowCount = occupantMembers.length - visibleOccupants.length;
                  const isLast = idx === userApartments.length - 1;
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
                  <Text style={styles.sectionEmptyText}>עדיין לא בחרת דירה להצגה בפרופיל.</Text>
                </View>
              )}

              {/* Apartment passcode (demo for now) */}
              {(() => {
                const uid = (user as any)?.id as string | undefined;
                if (!uid) return null;
                const ownedApts = userApartments.filter((a: any) => String(a?.owner_id || '') === String(uid));
                if (!ownedApts.length) return null;

                // DEMO: later connect to real data (e.g. apt.passcode)
                const raw = '123456';
                const code = (String(raw).match(/\d/g)?.join('') ?? '').slice(0, 6).padStart(6, '0');

                return (
                  <View style={styles.aptPasscodeCard}>
                    <View style={styles.aptPasscodeHeaderRow}>
                      <Text style={styles.aptPasscodeTitle}>קוד הדירה</Text>
                      <TouchableOpacity
                        style={styles.aptPasscodeCopyBtn}
                        activeOpacity={0.9}
                        onPress={async () => {
                          try {
                            await Clipboard.setStringAsync(code);
                            Alert.alert('הועתק', 'קוד הדירה הועתק ללוח.');
                          } catch {
                            Alert.alert('שגיאה', 'לא הצלחתי להעתיק את הקוד.');
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="העתק קוד דירה"
                      >
                        <Copy size={16} color="#5e3f2d" />
                        <Text style={styles.aptPasscodeCopyText}>העתק</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.aptPasscodeDigitsRow}>
                      {code.split('').map((d, i) => (
                        <View key={`code-${i}`} style={styles.aptPasscodeDigitBox}>
                          <Text style={styles.aptPasscodeDigitText}>{d}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.aptPasscodeHint}>שתפו את הקוד עם מי שמצטרף לדירה.</Text>
                  </View>
                );
              })()}
            </View>
          </View>
        </View>

        <View style={styles.sectionDark}>
          <TouchableOpacity
            style={styles.surveyCTA}
            activeOpacity={0.9}
            onPress={() => {
              router.push({ pathname: '/(tabs)/onboarding/survey', params: { mode: 'edit' } } as any);
            }}
          >
            {profile ? (
              <LinearGradient
                colors={['#cbb59e', '#5e3f2d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.surveyCTAAvatarRing}
              >
                <View style={styles.surveyCTAAvatarInner}>
                  <Image
                    source={{ uri: profile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                    style={styles.surveyCTAAvatar}
                  />
                </View>
              </LinearGradient>
            ) : null}
            <View style={styles.surveyCTATexts}>
              <Text style={styles.surveyCTATitle}>
                {`השאלון של ${(profile?.full_name || '').split(' ')?.[0] || 'אני'}`}
              </Text>
              <Text style={styles.surveyCTASubtitle} numberOfLines={1}>
                {'לחצו כאן כדי לערוך את השאלון'}
              </Text>
            </View>
            <View style={styles.surveyCTABadge}>
              <LinearGradient
                colors={['#cbb59e', '#5e3f2d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.surveyCTABadgeInner}
              >
                <ClipboardList size={24} color="#FFFFFF" />
              </LinearGradient>
            </View>
          </TouchableOpacity>
          {!isSurveyCompleted && (
            <Text style={styles.surveyCTAHint}>
              מלא/י את השאלון כדי שנוכל לחפש לך התאמות טובות יותר.
            </Text>
          )}
        </View>

        {/* Gallery section */}
        <View style={styles.sectionDark}>
          <View style={styles.galleryCard}>
            <View style={styles.galleryHeaderRow}>
              <Text style={styles.galleryHeaderTitle}>תמונות</Text>
              <Text style={styles.galleryCountText}>{(profile?.image_urls?.length || 0)}/6</Text>
            </View>
            {profile?.image_urls?.length ? (
              <View style={styles.galleryGrid}>
                {profile.image_urls.map((url, idx) => (
                  <TouchableOpacity
                    key={url + idx}
                    style={styles.galleryItem}
                    activeOpacity={0.9}
                    onPress={() => {
                      if (ignoreNextGalleryPressRef.current) {
                        ignoreNextGalleryPressRef.current = false;
                        return;
                      }
                      setViewerIndex(idx);
                    }}
                    delayLongPress={350}
                    onLongPress={() => {
                      // Prevent the subsequent onPress from opening the viewer after long-press.
                      ignoreNextGalleryPressRef.current = true;
                      removeImageAt(idx);
                    }}
                  >
                    <Image source={{ uri: url }} style={styles.galleryImg} />
                  </TouchableOpacity>
                ))}
                {profile.image_urls.length < 6 && (
                  <TouchableOpacity
                    style={[styles.galleryAddTile, isAddingImage && { opacity: 0.75 }]}
                    onPress={isAddingImage ? undefined : addGalleryImage}
                    activeOpacity={0.9}
                  >
                    <Plus size={18} color="#5e3f2d" />
                    <Text style={styles.galleryAddTileText}>הוסף</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.galleryGrid}>
                <TouchableOpacity
                  style={[styles.galleryAddTile, isAddingImage && { opacity: 0.75 }]}
                  onPress={isAddingImage ? undefined : addGalleryImage}
                  activeOpacity={0.9}
                >
                  <Plus size={18} color="#5e3f2d" />
                  <Text style={styles.galleryAddTileText}>הוסף</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* moved logout and delete actions to /profile/settings */}
      </ScrollView>
      {viewerIndex !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerIndex(null)}
        >
          <View style={styles.viewerOverlay}>
            <View style={[styles.viewerTopBar, { top: 12 + (insets.top || 0) }]}>
              <TouchableOpacity
                style={styles.viewerCloseBtn}
                onPress={() => setViewerIndex(null)}
                activeOpacity={0.9}
              >
                <X size={18} color="#E5E7EB" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewerDeleteBtn}
                onPress={() => {
                  if (viewerIndex !== null) removeImageAt(viewerIndex);
                }}
                disabled={isDeletingImage}
                activeOpacity={0.9}
              >
                {isDeletingImage ? (
                  <ActivityIndicator size="small" color="#F87171" />
                ) : (
                  <Trash2 size={18} color="#F87171" />
                )}
              </TouchableOpacity>
            </View>
            {viewerIndex !== null && (
              <Image
                source={{ uri: profile?.image_urls?.[viewerIndex] || '' }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      )}
      <Modal visible={isSurveyOpen} animationType="slide" transparent onRequestClose={() => setIsSurveyOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsSurveyOpen(false)} />
          <View style={[styles.sheet, { height: surveySheetMaxHeight }]}>
            <View style={styles.sheetHandleWrap}>
              <View style={styles.sheetHandle} />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>סיכום ההעדפות</Text>
              <TouchableOpacity onPress={() => setIsSurveyOpen(false)} style={styles.closeBtn}>
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={[styles.sheetContent, { paddingBottom: 16 + (insets.bottom || 0) }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {!!surveyHighlights.length && (
                <View style={styles.surveyHighlightsRow}>
                  {surveyHighlights.map((item) => (
                    <View key={`${item.label}-${item.value}`} style={styles.surveyHighlightPill}>
                      <Text style={styles.surveyHighlightLabel}>{item.label}</Text>
                      <Text style={styles.surveyHighlightValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              )}
              {surveyResponse ? (
                surveyItems.length ? (
                  <>
                    <Text style={styles.surveyAllAnswersTitle}>{`סיכום מלא (${surveyItems.length})`}</Text>

                    <View style={styles.surveySectionCard}>
                      <Text style={styles.surveySectionTitle}>עליי</Text>
                      {surveyItems.filter((i) => i.section === 'about').map((item, idx, arr) => (
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
                    </View>

                    <View style={styles.surveySectionCard}>
                      <Text style={styles.surveySectionTitle}>הדירה שאני מחפש/ת</Text>
                      {surveyItems.filter((i) => i.section === 'apartment').map((item, idx, arr) => (
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
                    </View>

                    <View style={styles.surveySectionCard}>
                      <Text style={styles.surveySectionTitle}>השותפ/ה שאני מחפש/ת</Text>
                      {surveyItems.filter((i) => i.section === 'partner').map((item, idx, arr) => (
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
                    </View>
                  </>
                ) : (
                  <View style={styles.surveyEmptyState}>
                    <Text style={styles.surveyEmptyText}>
                      סקר ההעדפות הושלם אך אין עדיין נתונים להצגה.
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.surveyEmptyState}>
                  <Text style={styles.surveyEmptyText}>
                    ברגע שתמלא/י את סקר ההעדפות נציג כאן את ההתאמות האישיות שלך.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {(isSaving || isAddingImage) && (
        <View style={styles.fullScreenLoader}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    writingDirection: 'rtl',
  },
  // Avatar actions bottom-sheet styles removed (replaced by animated FAB menu)
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  profileCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  profileCardShadow: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 14px 32px rgba(0,0,0,0.10)' } as any)
      : null),
  },
  photoWrap: {
    position: 'relative',
    backgroundColor: '#F3F4F6',
  },
  photo: {
    width: '100%',
    height: 360,
  },
  photoBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  fullScreenLoader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  addPhotoBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#5e3f2d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  settingsBtn: {
    // removed: settings button moved below survey results
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '92%',
    height: '70%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  viewerTopBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  viewerDeleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(248,113,113,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  viewerCloseBtn: {
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
  matchBadgeWrap: {
    // removed (badge no longer displayed)
  },
  matchBadgeCircle: {
    // removed
  },
  matchBadgeText: {
    // removed
  },
  whyMatchWrap: {
    // removed (moved below image)
  },
  whyMatchTitle: {
    // removed
  },
  whyChip: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  whyChipText: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 13,
  },
  infoPanel: {
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  nameText: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'right',
  },
  metaChipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  metaChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.12)',
    maxWidth: '100%',
  },
  metaChipText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  bioCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  bioTitle: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'right',
  },
  ageText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  tagChip: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  tagText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  whyInlineWrap: {
    marginBottom: 8,
  },
  whyInlineTitle: {
    color: '#111827',
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'right',
  },
  bioText: {
    color: '#6B7280',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 8,
    textAlign: 'right',
  },
  seeMoreText: {
    color: '#111827',
    fontWeight: '800',
    textAlign: 'right',
  },

  // actions for gallery moved to edit screen
  galleryGrid: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  galleryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  galleryHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
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
  galleryAddBtn: {
    backgroundColor: '#5e3f2d',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  galleryAddBtnDisabled: {
    opacity: 0.75,
  },
  galleryEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'right',
    paddingVertical: 16,
  },
  galleryItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  galleryAddTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  galleryAddTileText: {
    marginTop: 10,
    color: '#5e3f2d',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  },
  galleryItemTall: {
    aspectRatio: 0.8,
    borderRadius: 22,
  },
  galleryImg: {
    width: '100%',
    height: '100%',
  },

  editCard: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  editTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    padding: 8,
  },
  saveButton: {
    backgroundColor: '#5e3f2d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
    textAlign: 'right',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sectionDark: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitleDark: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'right',
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
  aptPasscodeCard: {
    marginTop: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF2F7',
  },
  aptPasscodeHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  aptPasscodeTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    flex: 1,
  },
  aptPasscodeCopyBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
  },
  aptPasscodeCopyText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  aptPasscodeDigitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    direction: 'ltr',
    marginBottom: 10,
  },
  aptPasscodeDigitBox: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  aptPasscodeDigitText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  aptPasscodeHint: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 16,
  },
  apartmentsHeaderTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    flex: 1,
  },
  apartmentsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Force LTR so "row" maps to visual left-to-right even when parent is row-reverse (RTL screens).
    direction: 'ltr',
  },
  editAptCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(94,63,45,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.07)' } as any)
      : null),
  },
  deleteAptCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(220,38,38,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.08)' } as any)
      : null),
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
  aptCardSpacing: {
    marginBottom: 12,
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
  surveyCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  surveyHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  surveyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  surveyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderColor: '#E5E7EB',
  },
  surveyBadgeText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '800',
  },
  surveyBadgeSuccess: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  surveyBadgePending: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderColor: 'rgba(250,204,21,0.25)',
  },
  surveyBadgeMuted: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderColor: 'rgba(148,163,184,0.25)',
  },
  surveyHighlightsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.18)',
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
    backgroundColor: '#EEF2F7',
    marginVertical: 10,
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
  surveyGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  surveyCell: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '48%',
  },
  surveyCellLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'right',
    fontWeight: '600',
  },
  surveyCellValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
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
  surveyCTA: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  surveyCTATexts: {
    flex: 1,
    marginRight: 8,
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
  surveyCTABadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  surveyCTABadgeInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5e3f2d',
    shadowColor: '#5e3f2d',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
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
  },
  sheetHandleWrap: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
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
    paddingBottom: 8,
    gap: 12,
  },
  surveyCTAAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginLeft: 0,
  },
  surveyCTAAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    shadowColor: '#5e3f2d',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  surveyCTAAvatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginTop: 4,
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
  },
  sharedHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Force LTR so "row" maps to visual left-to-right even when the screen is RTL.
    direction: 'ltr',
  },
  sharedAddCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(94,63,45,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionActionPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 74,
  },
  sectionActionPillDanger: {
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.18)',
  },
  sectionActionPillTextDanger: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '900',
  },
  mediaActionPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaActionPillDanger: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  mediaActionPillTextDanger: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '900',
  },
  sharedMembersGrid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingTop: 10,
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
    borderColor: '#FFFFFF',
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
  sharedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  sharedAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  sharedAvatar: {
    width: '100%',
    height: '100%',
  },
  sharedMembersLine: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'right',
  },
  apartmentRow: {
    backgroundColor: '#E5E7EB',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    minHeight: 120,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any)
      : null),
  },
  aptThumb: {
    width: 120,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  aptTextWrap: {
    flex: 1,
    gap: 6,
  },
  aptTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
  },
  aptSub: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'right',
  },
  aptAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  aptAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  aptPricePill: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  aptPriceText: {
    color: '#22C55E',
    fontWeight: '900',
    fontSize: 13,
  },
  aptPricePurple: {
    color: '#5e3f2d',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'right',
    marginTop: 6,
  },
  actionButtonsRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editProfileBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editProfileBtnText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 14,
  },
  // removed sign out & delete button styles (moved to settings)

  bottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  actionCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNo: {
    shadowColor: '#EF4444',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionStar: {
    shadowColor: '#5e3f2d',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionYes: {
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
