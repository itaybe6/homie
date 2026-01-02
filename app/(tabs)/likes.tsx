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
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Apartment } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';

export default function LikesScreen() {
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

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      <Text style={styles.title}>דירות שאהבת</Text>
      <Text style={styles.subtitle}>הלב שלך בחר — כאן מחכות לך כל הדירות שסימנת.</Text>
    </View>
  );

  const renderApartmentCard = ({ item }: { item: Apartment }) => (
    <ApartmentCard
      apartment={item}
      onPress={() => handleApartmentPress(item.id)}
      variant="home"
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Spacer to avoid content sitting under the absolute GlobalTopBar */}
      <View style={styles.globalTopBarSpacer} pointerEvents="none" />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5e3f2d" />
        </View>
      ) : (
        <FlatList
          data={likedApartments}
          keyExtractor={(item) => item.id}
          renderItem={renderApartmentCard}
          contentContainerStyle={[
            styles.listContent,
            likedApartments.length === 0 && styles.listContentEmpty,
          ]}
          ListHeaderComponent={likedApartments.length > 0 ? renderListHeader : null}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#5e3f2d"
              colors={['#5e3f2d']}
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
  globalTopBarSpacer: {
    paddingTop: 44,
    backgroundColor: '#FFFFFF',
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
    paddingBottom: 140, // Leave room for the bottom tab bar
    backgroundColor: '#FFFFFF',
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
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
