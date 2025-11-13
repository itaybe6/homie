import { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  Alert,
  Image,
} from 'react-native';
import { Home, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/database';
import RoommateCard from '@/components/RoommateCard';

type BrowseItem =
  | { type: 'user'; user: User }
  | { type: 'group'; groupId: string; users: User[] };

export default function PartnersScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const screenWidth = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(0)).current;

useEffect(() => {
  fetchUsersAndGroups();
}, [currentUser?.id]);

  const fetchUsersAndGroups = async () => {
    setIsLoading(true);
    try {
      const authId = useAuthStore.getState().user?.id || currentUser?.id;

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

      // Filter to groups with at least 2 users and not including the current user
      const activeGroups: { groupId: string; users: User[] }[] = Object.entries(groupIdToUsers)
        .map(([gid, us]) => ({ groupId: gid, users: us }))
        .filter((g) => g.users.length >= 2 && !g.users.some((u) => u.id === authId));

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

      // Exclude users who belong to active groups (we will show their group card instead)
      const memberIdsInActiveGroups = new Set(activeGroups.flatMap((g) => g.users.map((u) => u.id)));
      const filteredSingles = (authId
        ? list.filter((u) => u.id !== authId && !interacted.has(u.id))
        : list
      ).filter((u) => !memberIdsInActiveGroups.has(u.id));

      const combinedItems: BrowseItem[] = [
        ...activeGroups.map((g) => ({ type: 'group', groupId: g.groupId, users: g.users }) as BrowseItem),
        ...filteredSingles.map((u) => ({ type: 'user', user: u }) as BrowseItem),
      ];

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
        <View style={styles.brandRow}>
          <View style={styles.brandIconWrap}>
            <Home size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.brandText}>Homie</Text>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity activeOpacity={0.8} style={styles.topActionBtn}>
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
                  user={items[currentIndex].user}
                  onLike={handleLike}
                  onPass={handlePass}
                  onOpen={(u) => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
                />
              ) : (
                <GroupCard
                  users={items[currentIndex].users}
                  onOpen={(userId: string) => router.push({ pathname: '/user/[id]', params: { id: userId } })}
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
    justifyContent: 'space-between',
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
});

function GroupCard({ users, onOpen }: { users: User[]; onOpen: (id: string) => void }) {
  const firstTwo = users.slice(0, 2);
  const extra = users.length - firstTwo.length;
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const namesLine =
    firstTwo.map((u) => `${u.full_name}${u.age ? `, ${u.age}` : ''}`).join(' + ') +
    (extra > 0 ? ` ועוד ${extra}` : '');
  const cities = Array.from(new Set(firstTwo.map((u) => u.city).filter(Boolean))).join(' • ');

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={() => onOpen(firstTwo[0]?.id)} style={groupStyles.card}>
      <View style={groupStyles.circleWrap}>
        {firstTwo.length === 2 ? (
          <View style={groupStyles.splitCircle}>
            <Image source={{ uri: firstTwo[0].avatar_url || DEFAULT_AVATAR }} style={[groupStyles.half, groupStyles.halfRight]} />
            <Image source={{ uri: firstTwo[1].avatar_url || DEFAULT_AVATAR }} style={[groupStyles.half, groupStyles.halfLeft]} />
          </View>
        ) : (
          <View style={groupStyles.singleCircle}>
            <Image source={{ uri: firstTwo[0]?.avatar_url || DEFAULT_AVATAR }} style={groupStyles.singleImg} />
          </View>
        )}
        {extra > 0 ? (
          <View style={groupStyles.extraBadge}>
            <Text style={groupStyles.extraText}>+{extra}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, alignItems: 'flex-end' }}>
        <Text style={groupStyles.title} numberOfLines={1}>{namesLine}</Text>
        {!!cities && <Text style={groupStyles.sub} numberOfLines={1}>{cities}</Text>}
        <View style={{ marginTop: 10, gap: 6 as any, width: '100%' }}>
          {firstTwo.map((u) => (
            <View key={u.id} style={groupStyles.personRow}>
              <View style={groupStyles.dot} />
              <Text style={groupStyles.personText} numberOfLines={1}>
                {u.full_name}{u.age ? `, ${u.age}` : ''}{u.city ? ` • ${u.city}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
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
  circleWrap: {
    alignItems: 'center',
    paddingTop: 16,
  },
  splitCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: 'rgba(124,92,255,0.35)',
    backgroundColor: '#22232E',
  },
  half: {
    width: '50%',
    height: '100%',
  },
  halfRight: {
    transform: [{ scaleX: -1 }],
  },
  halfLeft: {},
  singleCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(124,92,255,0.35)',
    backgroundColor: '#22232E',
  },
  singleImg: {
    width: '100%',
    height: '100%',
  },
  extraBadge: {
    position: 'absolute',
    bottom: 10,
    left: 20,
    backgroundColor: 'rgba(124,92,255,0.9)',
    paddingHorizontal: 8,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  extraText: {
    color: '#0F0F14',
    fontWeight: '900',
    fontSize: 13,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
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
});
