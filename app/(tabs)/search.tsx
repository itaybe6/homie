import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  FlatList,
  Platform,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, X, Users, MapPin } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type SearchUserRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city?: string | null;
};

export default function SearchUsersScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SearchUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const debounceRef = useRef<any>(null);

  const trimmed = useMemo(() => query.trim(), [query]);

  const runSearch = async (q: string) => {
    const safe = q.trim();
    if (!safe) {
      setRows([]);
      return;
    }
    setIsLoading(true);
    try {
      // Basic user search by full name (case-insensitive). Keep results small & fast.
      let req = supabase
        .from('users')
        .select('id, full_name, avatar_url, city')
        .ilike('full_name', `%${safe}%`)
        .limit(30);

      // Exclude current user when possible
      if (user?.id) req = req.neq('id', user.id);

      const { data, error } = await req;
      if (error) throw error;
      setRows(((data || []) as any[]).filter(Boolean) as SearchUserRow[]);
    } catch (e) {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await runSearch(trimmed);
    setRefreshing(false);
  };

  const renderItem = ({ item, index }: { item: SearchUserRow; index: number }) => {
    const displayName = (item.full_name || 'משתמש/ת').toString();
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
        <TouchableOpacity
          style={styles.userCard}
          activeOpacity={0.95}
          onPress={() => {
            Keyboard.dismiss();
            router.push({ pathname: '/user/[id]', params: { id: item.id } } as any);
          }}
        >
          <View style={styles.cardContent}>
            <View style={styles.userTextWrap}>
              <Text style={styles.userName} numberOfLines={1}>
                {displayName}
              </Text>
              {!!item.city ? (
                <View style={styles.cityRow}>
                  <MapPin size={11} color="#6B7280" />
                  <Text style={styles.userCity} numberOfLines={1}>
                    {item.city}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={['#5e3f2d', '#8B6F47']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={styles.avatarInner}>
                  <Image
                    source={{ uri: item.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                    style={styles.avatar}
                  />
                </View>
              </LinearGradient>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Spacer to avoid content sitting under the absolute GlobalTopBar */}
      <View style={styles.globalTopBarSpacer} pointerEvents="none" />

      {/* Search bar (no header) */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBarShadow}>
          <View style={styles.searchBar}>
            <TouchableOpacity
              style={[styles.clearBtn, !query && styles.clearBtnHidden]}
              accessibilityRole="button"
              accessibilityLabel="נקה חיפוש"
              onPress={() => setQuery('')}
              disabled={!query}
              activeOpacity={0.8}
            >
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חפש/י לפי שם..."
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              onSubmitEditing={() => {
                Keyboard.dismiss();
                runSearch(trimmed);
              }}
            />
            <LinearGradient
              colors={['#5e3f2d', '#8B6F47']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchIconGradient}
            >
              <Search size={20} color="#FFFFFF" />
            </LinearGradient>
          </View>
        </View>
      </View>

      {/* Results */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#5e3f2d" />
          <Text style={styles.loadingText}>מחפש משתמשים...</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#5e3f2d"
              colors={['#5e3f2d']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconContainer}>
                {trimmed ? <Search size={48} color="#D1D5DB" /> : <Users size={48} color="#D1D5DB" />}
              </View>
              <Text style={styles.emptyTitle}>
                {trimmed ? 'לא נמצאו תוצאות' : 'התחל/י חיפוש'}
              </Text>
              <Text style={styles.emptySub}>
                {trimmed ? 'נסה/י שם אחר או בדוק/י איות' : 'הקלד/י שם כדי למצוא משתמשים'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  globalTopBarSpacer: {
    paddingTop: 52,
    backgroundColor: '#F9FAFB',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  searchBarShadow: {
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px rgba(0,0,0,0.12)' } as any) : null),
  },
  searchBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIconGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5e3f2d',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  clearBtnHidden: {
    opacity: 0.4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 140,
  },
  emptyWrap: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  userCard: {
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.08)' } as any) : null),
  },
  cardContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  avatarContainer: {
    marginLeft: 0,
  },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  userTextWrap: {
    flex: 1,
    marginRight: 14,
    alignItems: 'flex-end',
    gap: 5,
  },
  userName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: -0.3,
  },
  cityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(94,63,45,0.05)',
  },
  userCity: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

