import { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  Easing,
  Alert,
  Image,
} from 'react-native';
import { SlidersHorizontal, ChevronLeft, ChevronRight, Heart, X, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';
import RoommateCard from '@/components/RoommateCard';
import GroupCard from '@/components/GroupCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cityNeighborhoods, canonicalizeCityName } from '@/assets/data/neighborhoods';
import { Apartment } from '@/types/database';
// ApartmentCard is used inside GroupCard

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
  const [gender, setGender] = useState<'any' | 'male' | 'female'>('any');
  const [ageMin, setAgeMin] = useState<number>(20);
  const [ageMax, setAgeMax] = useState<number>(40);
  const [ageActive, setAgeActive] = useState<boolean>(false);
  const [profileType, setProfileType] = useState<'all' | 'singles' | 'groups'>('all');
  const [groupGender, setGroupGender] = useState<'any' | 'male' | 'female'>('any');
  const [groupSize, setGroupSize] = useState<'any' | 2 | 3>('any');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const screenWidth = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(0)).current;

useEffect(() => {
  fetchUsersAndGroups();
}, [currentUser?.id]);

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

      let matchRows: { id: string; sender_id: string; receiver_id: string | null; receiver_group_id?: string | null }[] = [];
      if (authId) {
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('id, sender_id, receiver_id, receiver_group_id')
          .or(`sender_id.eq.${authId},receiver_id.eq.${authId}`);
        if (matchesError) throw matchesError;
        matchRows = matchesData || [];
      }

      const list = (usersData || []) as User[];
      const interacted = new Set<string>();
      const interactedGroupIds = new Set<string>();
      if (authId) {
        matchRows.forEach((row) => {
          const otherId =
            row.sender_id === authId ? row.receiver_id : row.receiver_id === authId ? row.sender_id : null;
          if (otherId) interacted.add(otherId);
          if (row.sender_id === authId && row.receiver_group_id) {
            interactedGroupIds.add(row.receiver_group_id);
          }
        });
      }

      // Exclude everyone who belongs to any merged/active group (by membership), not just visible groups
      const memberIdsInActiveGroups = new Set(members.map((m) => m.user_id));

      // Exclude members who share a group with the current user (so you don't see your own group-mates as singles)
      const groupIdsWithCurrentUser = new Set(
        members.filter((m) => m.user_id === authId).map((m) => m.group_id)
      );
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
    } catch (e) {
      console.error('Failed to fetch users', e);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const slideTo = (nextIndex: number, direction: 'next' | 'prev') => {
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const outTarget = direction === 'next' ? -screenWidth : screenWidth;
    Animated.timing(translateX, {
      toValue: outTarget,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setCurrentIndex(nextIndex);
      translateX.setValue(direction === 'next' ? screenWidth : -screenWidth);
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 50,
      }).start();
    });
  };

  const goNext = () => slideTo(currentIndex + 1, 'next');
  const goPrev = () => slideTo(currentIndex - 1, 'prev');

  const handleLike = async (likedUser: User) => {
    if (currentUser?.id && likedUser.id === currentUser.id) {
      goNext();
      return;
    }
    try {
      if (!currentUser?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
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
        status: 'PENDING',
      } as any);
      if (insertErr) throw insertErr;

      // optional: also notify the recipient
      // If sender is part of a merged profile, reflect that in the content
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
      const notifDesc = `${senderLabel} מעוניין/ת להיות שותף/ה שלך.`;
      await supabase.from('notifications').insert({
        sender_id: currentUser.id,
        recipient_id: likedUser.id,
        title: notifTitle,
        description: notifDesc,
      });

      Alert.alert('נשלח', 'נוצרה בקשת שותפות ונשלחה הודעה למשתמש');
      goNext();
    } catch (e: any) {
      console.error('like failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח בקשה');
    }
  };
  const handlePass = async (user: User) => {
    if (!currentUser?.id) {
      Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
      return;
    }
    if (currentUser?.id && user.id === currentUser.id) {
      goNext();
      return;
    }
    try {
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
        const { error: updateErr } = await supabase
          .from('matches')
          .update({
            status: 'NOT_RELEVANT',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('matches').insert({
          sender_id: currentUser.id,
          receiver_id: user.id,
          status: 'NOT_RELEVANT',
        } as any);
        if (insertErr) throw insertErr;
      }
    } catch (e: any) {
      console.error('pass failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לסמן כלא רלוונטי');
    } finally {
      goNext();
    }
  };
  // Removed favorite action per request

  const handleGroupLike = async (groupId: string, groupUsers: User[]) => {
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
      goNext();
    } catch (e: any) {
      console.error('group like failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח בקשות לקבוצה');
    }
  };

  const handleGroupPass = async (groupId: string, groupUsers: User[]) => {
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
      goNext();
    }
  };
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
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
        contentContainerStyle={[styles.listContent, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>לא נמצאו שותפים</Text>
            <Text style={styles.emptySubtext}>חזרו מאוחר יותר</Text>
          </View>
        ) : (
          <View>
            <Animated.View
              style={[
                styles.animatedCard,
                {
                  transform: [
                    { translateX },
                    {
                      scale: translateX.interpolate({
                        inputRange: [-screenWidth, 0, screenWidth],
                        outputRange: [0.96, 1, 0.96],
                      }),
                    },
                  ],
                  opacity: translateX.interpolate({
                    inputRange: [-screenWidth, 0, screenWidth],
                    outputRange: [0.85, 1, 0.85],
                  }),
                },
              ]}
            >
              {items[currentIndex].type === 'user' ? (
                <RoommateCard
                  user={(items[currentIndex] as any).user}
                  onLike={handleLike}
                  onPass={handlePass}
                  onOpen={(u) =>
                    router.push({
                      pathname: '/(tabs)/user/[id]',
                      params: { id: u.id, from: 'partners' } as any,
                    })
                  }
                />
              ) : (
                <GroupCard
                  groupId={(items[currentIndex] as any).groupId}
                  users={(items[currentIndex] as any).users}
                  apartment={(items[currentIndex] as any).apartment}
                  onLike={(groupId, users) => handleGroupLike(groupId, users)}
                  onPass={(groupId, users) => handleGroupPass(groupId, users)}
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
                />
              )}
            </Animated.View>

            <View style={styles.arrowRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.arrowBtn, currentIndex === 0 && styles.arrowBtnDisabled]}
                onPress={goPrev}
                disabled={currentIndex === 0}
              >
                <ChevronRight size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.arrowBtn,
                  currentIndex === items.length - 1 && styles.arrowBtnDisabled,
                ]}
                onPress={goNext}
                disabled={currentIndex === items.length - 1}
              >
                <ChevronLeft size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

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
    backgroundColor: '#0F0F14',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 8,
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
  animatedCard: {
    // separate style for Animated.View wrapper
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
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  arrowBtnDisabled: {
    opacity: 0.4,
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
    backgroundColor: '#7C5CFF',
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
    backgroundColor: '#A78BFA',
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

 

 
