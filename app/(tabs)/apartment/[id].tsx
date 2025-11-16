import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  MapPin,
  Bed,
  Bath,
  Users,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  X,
  UserPlus,
  Search,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { Apartment, User } from '@/types/database';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ApartmentDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const removeApartment = useApartmentStore((state) => state.removeApartment);

  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [owner, setOwner] = useState<User | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addCandidates, setAddCandidates] = useState<User[]>([]);
  const [sharedGroups, setSharedGroups] = useState<{ id: string; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRequestingJoin, setIsRequestingJoin] = useState(false);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
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

  useEffect(() => {
    fetchApartmentDetails();
  }, [id]);

  const fetchApartmentDetails = async () => {
    try {
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

      const partnerIds = (aptData as any).partner_ids as string[] | undefined;
      if (partnerIds && partnerIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .in('id', partnerIds);
        if (usersError) throw usersError;
        setMembers(usersData || []);
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
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  if (!apartment) {
    return null;
  }

  const isOwner = user?.id === apartment.owner_id;
  const PLACEHOLDER =
    'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  const normalizeImages = (value: any): string[] => {
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
  };

  const images: string[] = (() => {
    const arr = normalizeImages((apartment as any).image_urls);
    return arr.length ? arr : [PLACEHOLDER];
  })();

  const roommatesCount = members.length;
  const roommatesNeeded = Math.max(
    0,
    (apartment.bedrooms || 0) - (roommatesCount + 1)
  );
  const currentPartnerIds: string[] = Array.isArray((apartment as any).partner_ids)
    ? ((apartment as any).partner_ids as string[])
    : [];
  const isMember = !!(user?.id && currentPartnerIds.includes(user.id));

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
      if (isOwner || isMember) return;

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
      const description = `${senderName} מעוניין להצטרף לדירה: ${apartment.title} (${apartment.city})`;

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

  const filteredCandidates = (() => {
    const q = (addSearch || '').trim().toLowerCase();
    const excludeIds = new Set<string>([
      apartment.owner_id,
      ...((apartment as any).partner_ids || []),
    ]);
    const base = addCandidates.filter((u) => !excludeIds.has(u.id));
    if (!q) return base;
    return base.filter((u) => (u.full_name || '').toLowerCase().includes(q));
  })();
  const filteredSharedGroups = (() => {
    const q = (addSearch || '').trim().toLowerCase();
    const excludeIds = new Set<string>([
      apartment.owner_id,
      ...((apartment as any).partner_ids || []),
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
      const currentIds = new Set<string>([apartment.owner_id, ...(apartment.partner_ids || [])]);
      // Load all users
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'user')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const all = (data || []) as User[];
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
              if (u?.id) byId[u.id] = { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url };
            });
            grouped = groupedIds.map((gid) => ({
              id: gid,
              members: (groupToMemberIds[gid] || [])
                .map((uid) => byId[uid])
                .filter(Boolean),
            }));
            setSharedGroups(grouped);
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
      const currentPartnerIds = Array.isArray((apartment as any).partner_ids)
        ? ((apartment as any).partner_ids as string[])
        : [];
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
      const currentPartnerIds = Array.isArray((apartment as any).partner_ids)
        ? ((apartment as any).partner_ids as string[])
        : [];
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

  const goPrev = () => {
    if (activeIdx <= 0) return;
    const next = activeIdx - 1;
    galleryRef.current?.scrollTo({ x: next * screenWidth, animated: true });
    setActiveIdx(next);
  };

  const goNext = () => {
    if (activeIdx >= images.length - 1) return;
    const next = activeIdx + 1;
    galleryRef.current?.scrollTo({ x: next * screenWidth, animated: true });
    setActiveIdx(next);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 400, paddingTop: 50 }}>
        {/* Owner actions pinned to top of the page */}
        {isOwner ? (
          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push({ pathname: '/apartment/edit/[id]', params: { id: apartment.id } })}
              activeOpacity={0.9}
            >
              <Pencil size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>עריכה</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnDanger}
              onPress={handleDeleteApartment}
              activeOpacity={0.9}
            >
              <Trash2 size={16} color="#F87171" />
              <Text style={styles.actionBtnDangerText}>מחק</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.topHeader}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {apartment.title}
          </Text>
          <View style={styles.heroLocation}>
            <MapPin size={16} color="#C9CDD6" />
            <Text style={styles.heroLocationText} numberOfLines={1}>
              {apartment.neighborhood ? `${apartment.neighborhood}, ` : ''}
              {apartment.city}
            </Text>
          </View>
          <Text style={styles.subMeta}>
            {apartment.bedrooms} חדרים · {roommatesNeeded} מחפשי שותף
          </Text>
        </View>
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
            {images.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={[styles.slide, { width: screenWidth }]}>
                <Image
                  source={{ uri: failed[idx] ? PLACEHOLDER : uri }}
                  style={styles.image}
                  resizeMode="cover"
                  onError={() => setFailed((f) => ({ ...f, [idx]: true }))}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(15,15,20,0.6)', 'rgba(15,15,20,0.95)']}
                  style={styles.imageGradient}
                />
              </View>
            ))}
          </ScrollView>

          {/* Price overlay at bottom-left of the image */}
          <View style={styles.priceOverlay}>
            <View style={styles.pricePill}>
              <Text style={styles.currencyText}>₪</Text>
              <Text style={styles.priceText}>{apartment.price}</Text>
              <Text style={styles.priceUnitDark}>/חודש</Text>
            </View>
          </View>

          {images.length > 1 ? (
            <>
              <TouchableOpacity onPress={goPrev} style={[styles.navBtn, styles.navBtnLeft]} activeOpacity={0.85}>
                <ChevronLeft size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={goNext} style={[styles.navBtn, styles.navBtnRight]} activeOpacity={0.85}>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.dotsRow}>
                {images.map((_, i) => (
                  <View key={`dot-${i}`} style={[styles.dot, i === activeIdx && styles.dotActive]} />
                ))}
              </View>
            </>
          ) : null}

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/(tabs)/home')}>
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.avatarStack}>
            {members.slice(0, 5).map((m, idx) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.id } })}
                activeOpacity={0.9}
              >
                <Image
                  source={{
                    uri:
                      (m as any).avatar_url ||
                      'https://cdn-icons-png.flaticon.com/512/847/847969.png',
                  }}
                  style={[styles.avatar, idx > 0 ? { marginLeft: -10 } : null]}
                />
              </TouchableOpacity>
            ))}
            {members.length > 5 ? (
              <View style={[styles.avatar, styles.moreAvatar]}>
                <Text style={styles.moreAvatarText}>+{members.length - 5}</Text>
              </View>
            ) : null}
            {isOwner ? (
              <TouchableOpacity
                onPress={openAddPartnerModal}
                activeOpacity={0.9}
                style={styles.addAvatar}
              >
                <UserPlus size={16} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* owner actions above the roommates avatars */}
          {null}
        </View>

        <View style={styles.content}>
          <View style={styles.detailsRow}>
            <View style={styles.detailBoxDark}>
              <Bed size={20} color="#7C5CFF" />
              <Text style={styles.detailValueDark}>{apartment.bedrooms}</Text>
              <Text style={styles.detailLabelDark}>חדרי שינה</Text>
            </View>
            <View style={styles.detailBoxDark}>
              <Bath size={20} color="#7C5CFF" />
              <Text style={styles.detailValueDark}>{apartment.bathrooms}</Text>
              <Text style={styles.detailLabelDark}>חדרי רחצה</Text>
            </View>
            <TouchableOpacity style={styles.detailBoxDark} onPress={() => setIsMembersOpen(true)} activeOpacity={0.9}>
              <Users size={20} color="#7C5CFF" />
              <Text style={styles.detailValueDark}>{roommatesCount}</Text>
              <Text style={styles.detailLabelDark}>שותפים</Text>
            </TouchableOpacity>
          </View>

          {apartment.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>תיאור</Text>
              <Text style={styles.descriptionDark}>{apartment.description}</Text>
            </View>
          ) : null}

          {owner ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>בעל הדירה</Text>
              <View style={styles.ownerCardDark}>
                <Text style={styles.ownerNameDark}>{owner.full_name}</Text>
                <Text style={styles.ownerEmailDark}>{owner.email}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Join as roommate button (for non-owner, non-member viewers) */}
      {!isOwner && !isMember ? (
        <View style={[styles.footer, { bottom: (insets.bottom || 0) + 78 }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleRequestJoin}
            disabled={isRequestingJoin || hasRequestedJoin}
            style={[
              styles.joinBtn,
              (isRequestingJoin || hasRequestedJoin) ? styles.joinBtnDisabled : null,
            ]}
          >
            <Text style={styles.joinBtnText}>
              {isRequestingJoin ? 'שולח...' : hasRequestedJoin ? 'נשלחה בקשה' : 'מעוניין להיכנס שותף בדירה'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Members Modal */}
      <Modal visible={isMembersOpen} animationType="slide" transparent onRequestClose={() => setIsMembersOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsMembersOpen(false)} />

          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>שותפים</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sheetCount}>{roommatesCount} שותפים</Text>
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

      {/* Add Partner Modal */}
      <Modal visible={isAddOpen} animationType="slide" transparent onRequestClose={() => setIsAddOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsAddOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>הוסף שותף</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sheetCount}>{filteredCandidates.length} מועמדים</Text>
                <TouchableOpacity onPress={() => setIsAddOpen(false)} style={styles.closeBtn}>
                  <X size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
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
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {isAdding ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#7C5CFF" />
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
                              onPress={() => first && confirmAddPartner(first as any)}
                            >
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
                              <View style={styles.candidateRight}>
                                <UserPlus size={16} color="#A78BFA" />
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
                        <View style={styles.candidateLeft}>
                          <Image
                            source={{ uri: (u as any).avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.candidateAvatar}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.candidateName} numberOfLines={1}>{u.full_name}</Text>
                          <View style={styles.candidateBadges}>
                            <View style={styles.candidateBadge}><Text style={styles.candidateBadgeText}>זמין</Text></View>
                            <View style={styles.candidateBadge}><Text style={styles.candidateBadgeText}>מתאים</Text></View>
                          </View>
                        </View>
                        <View style={styles.candidateRight}>
                          <UserPlus size={16} color="#A78BFA" />
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
                style={[styles.confirmBtn, styles.confirmApprove]}
                onPress={() => {
                  const fn = confirmState.onConfirm;
                  setConfirmState((s) => ({ ...s, visible: false }));
                  fn?.();
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.confirmApproveText}>{confirmState.confirmLabel || 'אישור'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
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
    backgroundColor: '#0F0F14',
  },
  galleryContainer: {
    position: 'relative',
  },
  slide: {
    width: '100%',
  },
  image: {
    width: '100%',
    height: 280,
    backgroundColor: '#22232E',
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  backButton: {
    position: 'absolute',
    top: 44,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarStack: {
    position: 'absolute',
    top: 44,
    right: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    writingDirection: 'rtl',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(15,15,20,0.9)',
    backgroundColor: '#1F1F29',
  },
  moreAvatar: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(15,15,20,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  navBtn: {
    position: 'absolute',
    top: '45%',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnLeft: {
    left: 12,
  },
  navBtnRight: {
    right: 12,
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  infoCard: {
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  topActionsRow: {
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 8,
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
  pricePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 8,
  },
  priceText: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '900',
  },
  currencyText: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '900',
    marginRight: 4,
  },
  priceUnitDark: {
    color: '#C9F7D7',
    fontSize: 12,
    marginLeft: 2,
  },
  priceOverlay: {
    position: 'absolute',
    left: 16,
    bottom: 12,
    zIndex: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroLocation: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroLocationText: {
    color: '#C9CDD6',
    fontSize: 14,
    textAlign: 'right',
  },
  subMeta: {
    color: '#B0B4BF',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'right',
  },
  content: {
    padding: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  detailBoxDark: {
    flex: 1,
    backgroundColor: '#17171F',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  detailLabelDark: {
    fontSize: 12,
    color: '#9DA4AE',
    marginTop: 6,
  },
  detailValueDark: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  section: {
    marginTop: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  descriptionDark: {
    fontSize: 15,
    color: '#C7CBD1',
    lineHeight: 22,
  },
  ownerCardDark: {
    backgroundColor: '#17171F',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  ownerNameDark: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  ownerEmailDark: {
    fontSize: 13,
    color: '#9DA4AE',
  },
  joinBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.45)',
  },
  joinBtnDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(124,92,255,0.25)',
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
    backgroundColor: '#A78BFA',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  editButtonText: {
    color: '#0F0F14',
    fontSize: 15,
    fontWeight: '800',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#141420',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: '70%',
    writingDirection: 'rtl',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1B1B28',
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetCount: {
    color: '#C9CDD6',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeading: {
    color: '#C9CDD6',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'right',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2030',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#17171F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  candidateLeft: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
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
    backgroundColor: 'rgba(124,92,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.25)',
  },
  candidateName: {
    color: '#FFFFFF',
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
    backgroundColor: '#1F1F29',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  candidateBadgeText: {
    color: '#C9CDD6',
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
    borderColor: 'rgba(15,15,20,0.9)',
    backgroundColor: '#1F1F29',
  },
  groupAvatarMd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: 'rgba(15,15,20,0.9)',
    backgroundColor: '#1F1F29',
  },
  groupAvatarSm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: 'rgba(15,15,20,0.9)',
    backgroundColor: '#1F1F29',
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1F1F29',
  },
  memberName: {
    color: '#FFFFFF',
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
    color: '#9DA4AE',
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
    backgroundColor: '#141420',
    marginHorizontal: 16,
    marginBottom: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A37',
    padding: 16,
    writingDirection: 'rtl',
  },
  confirmTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'right',
  },
  confirmMessage: {
    color: '#C9CDD6',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  confirmApprove: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
  },
  confirmCancelText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  confirmApproveText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '900',
  },
});




