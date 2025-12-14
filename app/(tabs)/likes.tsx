import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Apartment } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';

export default function LikesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  
  const [likedApartments, setLikedApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLikedApartments = useCallback(async () => {
    if (!user?.id) {
      setLikedApartments([]);
      setIsLoading(false);
      return;
    }

    try {
      // First, get the user's likes array
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('likes')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user likes:', userError);
        setLikedApartments([]);
        return;
      }

      const likeIds = userData?.likes || [];

      if (likeIds.length === 0) {
        setLikedApartments([]);
        return;
      }

      // Fetch the apartments that match the liked IDs
      const { data: apartmentsData, error: apartmentsError } = await supabase
        .from('apartments')
        .select('*')
        .in('id', likeIds)
        .order('created_at', { ascending: false });

      if (apartmentsError) {
        console.error('Error fetching liked apartments:', apartmentsError);
        setLikedApartments([]);
        return;
      }

      setLikedApartments(apartmentsData || []);
    } catch (error) {
      console.error('Error in fetchLikedApartments:', error);
      setLikedApartments([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLikedApartments();
  }, [fetchLikedApartments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLikedApartments();
    setRefreshing(false);
  };

  const handleApartmentPress = (apartmentId: string) => {
    router.push(`/apartment/${apartmentId}`);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Heart size={48} color="#D1D5DB" />
      </View>
      <Text style={styles.emptyTitle}>אין דירות שאהבת</Text>
      <Text style={styles.emptySubtitle}>
        לחץ/י על הלב בכרטיס הדירה כדי להוסיף אותה לרשימת האהבתי
      </Text>
    </View>
  );

  const renderApartmentCard = ({ item }: { item: Apartment }) => (
    <ApartmentCard
      apartment={item}
      onPress={() => handleApartmentPress(item.id)}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, { paddingTop: 8 }]}>
        <Text style={styles.title}>אהבתי</Text>
        <Text style={styles.subtitle}>
          {likedApartments.length > 0
            ? `${likedApartments.length} דירות`
            : 'הדירות שסימנת באהבתי יופיעו כאן'}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : (
        <FlatList
          data={likedApartments}
          keyExtractor={(item) => item.id}
          renderItem={renderApartmentCard}
          contentContainerStyle={[
            styles.listContent,
            likedApartments.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8B5CF6"
              colors={['#8B5CF6']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
});
