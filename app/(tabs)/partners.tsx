import { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
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
import RoommateCard from '@/components/RoommateCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cityNeighborhoods, canonicalizeCityName } from '@/assets/data/neighborhoods';

type BrowseItem =
  | { type: 'user'; user: User }
  | { type: 'group'; groupId: string; users: User[] };

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

      // ACTIVE groups and members (public readable)
      const { data: groups, error: gErr } = await supabase
        .from('profile_groups')
        .select('id')
        .eq('status', 'ACTIVE');
      if (gErr) throw gErr;
      const groupIds = (groups || []).map((g: any) => g.id as string);

      let members: { group_id: string; user_id: string }[] = [];
      if (groupIds.length) {
        const { data: mRows, error: mErr } = await supabase
          .from('profile_group_members')
          .select('group_id, user_id')
          .eq('status', 'ACTIVE')
          .in('group_id', groupIds);
        if (mErr) throw mErr;
        members = mRows || [];
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
      const activeGroups: { groupId: string; users: User[] }[] = Object.entries(groupIdToUsers)
        .map(([gid, us]) => ({ groupId: gid, users: us }))
        .filter(
          (g) =>
            g.users.length >= 1 &&
            !g.users.some((u) => u.id === authId) &&
            groupPassesFilters(g.users)
        );

      // Only show merged profiles (groups)
      // Also include single users not in active groups, filtered, and not already interacted with

      let matchRows: { sender_id: string; receiver_id: string }[] = [];
      if (authId) {
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('sender_id, receiver_id')
          .or(`sender_id.eq.${authId},receiver_id.eq.${authId}`);
        if (matchesError) throw matchesError;
        matchRows = matchesData || [];
      }

      const list = (usersData || []) as User[];
      const interacted = new Set<string>();
      if (authId) {
        matchRows.forEach((row) => {
          const otherId =
            row.sender_id === authId ? row.receiver_id : row.receiver_id === authId ? row.sender_id : null;
          if (otherId) interacted.add(otherId);
        });
      }

      const memberIdsInActiveGroups = new Set(activeGroups.flatMap((g) => g.users.map((u) => u.id)));

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
      const filteredSingles = (authId
        ? list.filter((u) => u.id !== authId && !interacted.has(u.id))
        : list
      )
        .filter((u) => !memberIdsToExclude.has(u.id))
        .filter((u) => userPassesFilters(u));

      let combinedItems: BrowseItem[] = [];
      if (profileType === 'groups' || profileType === 'all') {
        combinedItems.push(
          ...activeGroups.map((g) => ({ type: 'group', groupId: g.groupId, users: g.users }) as BrowseItem)
        );
      }
      if (profileType === 'singles' || profileType === 'all') {
        combinedItems.push(...filteredSingles.map((u) => ({ type: 'user', user: u }) as BrowseItem));
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
      await supabase.from('notifications').insert({
        sender_id: currentUser.id,
        recipient_id: likedUser.id,
        title: 'בקשת שותפות חדשה',
        description: 'המשתמש מעוניין להיות שותף שלך.',
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

  const handleGroupLike = async (groupUsers: User[]) => {
    try {
      if (!currentUser?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      const recipients = groupUsers.filter((u) => u.id !== currentUser.id);
      if (!recipients.length) {
        goNext();
        return;
      }
      const recipientIds = recipients.map((u) => u.id);
      const { data: existing } = await supabase
        .from('matches')
        .select('id, receiver_id')
        .eq('sender_id', currentUser.id)
        .in('receiver_id', recipientIds);
      const existingByReceiver = new Set((existing || []).map((r: any) => r.receiver_id as string));
      const rowsToInsert = recipients
        .filter((u) => !existingByReceiver.has(u.id))
        .map((u) => ({
          sender_id: currentUser.id,
          receiver_id: u.id,
          status: 'PENDING',
        })) as any[];
      if (rowsToInsert.length) {
        const { error: insertErr } = await supabase.from('matches').insert(rowsToInsert);
        if (insertErr) throw insertErr;
        const notifications = rowsToInsert.map((r) => ({
          sender_id: currentUser.id,
          recipient_id: r.receiver_id,
          title: 'בקשת שותפות חדשה',
          description: 'המשתמש מעוניין להיות שותף שלך.',
        }));
        await supabase.from('notifications').insert(notifications as any);
      }
      Alert.alert('נשלח', 'נוצרו בקשות שותפות לחברי הקבוצה');
      goNext();
    } catch (e: any) {
      console.error('group like failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח בקשות לקבוצה');
    }
  };

  const handleGroupPass = async (groupUsers: User[]) => {
    try {
      if (!currentUser?.id) {
        Alert.alert('שגיאה', 'יש להתחבר כדי לבצע פעולה זו');
        return;
      }
      const recipients = groupUsers.filter((u) => u.id !== currentUser.id);
      if (!recipients.length) {
        goNext();
        return;
      }
      const recipientIds = recipients.map((u) => u.id);
      const { data: existing } = await supabase
        .from('matches')
        .select('id, receiver_id')
        .eq('sender_id', currentUser.id)
        .in('receiver_id', recipientIds);
      const existingByReceiver = new Map<string, string>();
      (existing || []).forEach((r: any) => existingByReceiver.set(r.receiver_id as string, r.id as string));
      const idsToUpdate = Array.from(existingByReceiver.values());
      if (idsToUpdate.length) {
        const { error: updateErr } = await supabase
          .from('matches')
          .update({ status: 'NOT_RELEVANT', updated_at: new Date().toISOString() } as any)
          .in('id', idsToUpdate);
        if (updateErr) throw updateErr;
      }
      const rowsToInsert = recipients
        .filter((u) => !existingByReceiver.has(u.id))
        .map((u) => ({
          sender_id: currentUser.id,
          receiver_id: u.id,
          status: 'NOT_RELEVANT',
        })) as any[];
      if (rowsToInsert.length) {
        const { error: insertErr } = await supabase.from('matches').insert(rowsToInsert);
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

      <View style={styles.listContent}>
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
                  users={(items[currentIndex] as any).users}
                  onLike={(users) => handleGroupLike(users)}
                  onPass={(users) => handleGroupPass(users)}
                  onOpen={(userId: string) =>
                    router.push({
                      pathname: '/(tabs)/user/[id]',
                      params: { id: userId, from: 'partners' } as any,
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
      </View>

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

function GroupCard({
  users,
  onOpen,
  onLike,
  onPass,
}: {
  users: User[];
  onOpen: (id: string) => void;
  onLike: (users: User[]) => void;
  onPass: (users: User[]) => void;
}) {
  const displayUsers = users.slice(0, 4);
  const extra = users.length - displayUsers.length;
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const cities = Array.from(new Set(displayUsers.map((u) => u.city).filter(Boolean))).join(' • ');

  return (
    <View style={groupStyles.card}>
      <View style={groupStyles.gridWrap}>
        {displayUsers.map((u, idx) => {
          const rows = Math.ceil(displayUsers.length / 2);
          const cellHeight = rows === 1 ? 240 : 120;
          const isLastWithExtra = idx === displayUsers.length - 1 && extra > 0;
          return (
            <TouchableOpacity
              key={u.id}
              activeOpacity={0.9}
              onPress={() => onOpen(u.id)}
              style={[groupStyles.cell, { height: cellHeight }]}
            >
              <Image source={{ uri: u.avatar_url || DEFAULT_AVATAR }} style={groupStyles.cellImage} />
              {isLastWithExtra ? (
                <View style={groupStyles.extraOverlay}>
                  <Text style={groupStyles.extraOverlayText}>+{extra}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Removed top summary block to avoid duplication with per-member section */}

      <View style={groupStyles.membersSection}>
        {users.map((u) => (
          <TouchableOpacity key={u.id} activeOpacity={0.9} onPress={() => onOpen(u.id)} style={groupStyles.memberRow}>
            <Image source={{ uri: u.avatar_url || DEFAULT_AVATAR }} style={groupStyles.memberAvatar} />
            <View style={groupStyles.memberInfo}>
              <Text style={groupStyles.memberNameAge} numberOfLines={1}>
                {u.full_name}{u.age ? `, ${u.age}` : ''}
              </Text>
              {!!u.city && (
                <View style={groupStyles.memberCityRow}>
                  <MapPin size={14} color="#C9CDD6" />
                  <Text style={groupStyles.memberCityText}>{u.city}</Text>
                </View>
              )}
              {u.bio ? (
                <Text style={groupStyles.memberBio} numberOfLines={3}>
                  {u.bio}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={groupStyles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[groupStyles.circleBtn, groupStyles.passBtn]}
            onPress={() => onPass(users)}
          >
            <X size={22} color="#F43F5E" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[groupStyles.circleBtn, groupStyles.likeBtn]}
            onPress={() => onLike(users)}
          >
            <Heart size={22} color="#22C55E" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const groupStyles = StyleSheet.create({
  card: {
    backgroundColor: '#17171F',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#22232E',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cell: {
    width: '50%',
    position: 'relative',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cellImage: {
    width: '100%',
    height: '100%',
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
  sub: {
    color: '#C7CBD1',
    fontSize: 13,
    marginTop: 4,
  },
  personRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
  },
  personText: {
    color: '#E6E9F0',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'right',
    flex: 1,
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
    borderColor: 'rgba(255,255,255,0.06)',
  },
  memberAvatar: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#1F1F29',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameAge: {
    color: '#FFFFFF',
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
    color: '#C9CDD6',
    fontSize: 13,
  },
  memberBio: {
    color: '#C7CBD1',
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
});
