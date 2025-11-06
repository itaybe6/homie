import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useApartmentStore } from '@/stores/apartmentStore';
import { Apartment } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';

export default function HomeScreen() {
  const router = useRouter();
  const { apartments, setApartments, isLoading, setLoading } =
    useApartmentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredApartments, setFilteredApartments] = useState<Apartment[]>(
    []
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchApartments();
  }, []);

  useEffect(() => {
    filterApartments();
  }, [searchQuery, apartments]);

  const fetchApartments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('apartments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApartments(data || []);
    } catch (error) {
      console.error('Error fetching apartments:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchApartments();
    setRefreshing(false);
  };

  const filterApartments = () => {
    if (!searchQuery.trim()) {
      setFilteredApartments(apartments);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = apartments.filter(
      (apartment) =>
        apartment.title.toLowerCase().includes(query) ||
        apartment.city.toLowerCase().includes(query) ||
        apartment.address.toLowerCase().includes(query)
    );
    setFilteredApartments(filtered);
  };

  const handleApartmentPress = (apartment: Apartment) => {
    router.push(`/apartment/${apartment.id}`);
  };

  if (isLoading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00BCD4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>דירות זמינות</Text>

        <View style={styles.searchContainer}>
          <Search size={20} color="#757575" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="חפש לפי עיר, כתובת או שם..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredApartments}
        renderItem={({ item }) => (
          <ApartmentCard
            apartment={item}
            onPress={() => handleApartmentPress(item)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00BCD4"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>לא נמצאו דירות</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? 'נסה לשנות את החיפוש'
                : 'התחל להוסיף דירות חדשות'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
  },
});
