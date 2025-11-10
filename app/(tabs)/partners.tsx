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
} from 'react-native';
import { Home, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/database';
import RoommateCard from '@/components/RoommateCard';
import NotificationsButton from '@/components/NotificationsButton';

export default function PartnersScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const screenWidth = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data || []) as User[];
      const filtered = currentUser
        ? list.filter((u) => u.id !== currentUser.id)
        : list;
      setUsers(filtered);
      setCurrentIndex(0);
    } catch (e) {
      console.error('Failed to fetch users', e);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const slideTo = (nextIndex: number, direction: 'next' | 'prev') => {
    if (nextIndex < 0 || nextIndex >= users.length) return;
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

  const handleLike = (user: User) => {
    // Placeholder handler; backend connections table can be wired later
    console.log('like', user.id);
  };
  const handlePass = (user: User) => {
    console.log('pass', user.id);
  };
  const handleFavorite = (user: User) => {
    console.log('favorite', user.id);
  };
  const handleMessage = (user: User) => {
    console.log('message', user.id);
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
      <NotificationsButton style={{ left: 16 }} />
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

      <View style={styles.headerArea}>
        <Text style={styles.headerTitle}>מצא/י שותפים</Text>
      </View>

      <View style={styles.listContent}>
        {users.length === 0 ? (
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
              <RoommateCard
                user={users[currentIndex]}
                onLike={handleLike}
                onPass={handlePass}
                onFavorite={handleFavorite}
                onMessage={handleMessage}
                onOpen={(u) => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
              />
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
                  currentIndex === users.length - 1 && styles.arrowBtnDisabled,
                ]}
                onPress={goNext}
                disabled={currentIndex === users.length - 1}
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
    paddingTop: 10,
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
