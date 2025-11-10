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
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Home, SlidersHorizontal, X, Plus } from 'lucide-react-native';
import { autocompleteCities, autocompleteNeighborhoods, createSessionToken, PlacePrediction } from '@/lib/googlePlaces';
import { supabase } from '@/lib/supabase';
import { useApartmentStore } from '@/stores/apartmentStore';
import { Apartment } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';
import NotificationsButton from '@/components/NotificationsButton';

export default function HomeScreen() {
  const router = useRouter();
  const { apartments, setApartments, isLoading, setLoading } =
    useApartmentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredApartments, setFilteredApartments] = useState<Apartment[]>(
    []
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    city: '',
    neighborhood: '',
    minPrice: '',
    maxPrice: '',
    minBedrooms: '',
    minBathrooms: '',
  });
  const [citySuggestions, setCitySuggestions] = useState<PlacePrediction[]>([]);
  const [neighborhoodSuggestions, setNeighborhoodSuggestions] = useState<string[]>([]);
  const [cityPlaceId, setCityPlaceId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string>('');

  useEffect(() => {
    fetchApartments();
  }, []);

  useEffect(() => {
    filterApartments();
  }, [searchQuery, apartments, filters]);

  useEffect(() => {
    if (!isFilterOpen) return;
    setSessionToken(createSessionToken());
  }, [isFilterOpen]);

  // City autocomplete
  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = filters.city.trim();
      if (!q || q.length < 2) { setCitySuggestions([]); return; }
      const preds = await autocompleteCities(q, sessionToken);
      if (active) setCitySuggestions(preds.slice(0, 8));
    };
    run();
    return () => { active = false; };
  }, [filters.city, sessionToken]);

  // Neighborhood autocomplete
  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = filters.neighborhood.trim();
      if (!q || q.length < 2) { setNeighborhoodSuggestions([]); return; }
      const list = await autocompleteNeighborhoods(q, cityPlaceId, sessionToken, filters.city);
      if (active) setNeighborhoodSuggestions(list.slice(0, 10));
    };
    run();
    return () => { active = false; };
  }, [filters.neighborhood, cityPlaceId, sessionToken, filters.city]);

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
    const query = searchQuery.trim().toLowerCase();
    const minPrice = filters.minPrice ? Number(filters.minPrice) : null;
    const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : null;
    const minBedrooms = filters.minBedrooms ? Number(filters.minBedrooms) : null;
    const minBathrooms = filters.minBathrooms ? Number(filters.minBathrooms) : null;
    const cityFilter = filters.city.trim().toLowerCase();
    const hoodFilter = filters.neighborhood.trim().toLowerCase();

    const filtered = apartments.filter((apartment) => {
      // search query
      const matchesSearch = !query
        || apartment.title.toLowerCase().includes(query)
        || apartment.city.toLowerCase().includes(query)
        || apartment.address.toLowerCase().includes(query)
        || (apartment as any).neighborhood?.toLowerCase?.().includes(query);

      if (!matchesSearch) return false;

      // city
      if (cityFilter && !apartment.city.toLowerCase().includes(cityFilter)) return false;

      // price range
      if (minPrice !== null && apartment.price < minPrice) return false;
      if (maxPrice !== null && apartment.price > maxPrice) return false;

      // bedrooms/bathrooms (minimum)
      if (minBedrooms !== null && apartment.bedrooms < minBedrooms) return false;
      if (minBathrooms !== null && apartment.bathrooms < minBathrooms) return false;

      // neighborhood filter (check in neighborhood field if exists, otherwise address)
      if (hoodFilter) {
        const hoodValue = (apartment as any).neighborhood?.toLowerCase?.() || apartment.address.toLowerCase();
        if (!hoodValue.includes(hoodFilter)) return false;
      }

      return true;
    });

    setFilteredApartments(filtered);
  };

  const clearFilters = () => {
    setFilters({ city: '', neighborhood: '', minPrice: '', maxPrice: '', minBedrooms: '', minBathrooms: '' });
    setCitySuggestions([]);
    setNeighborhoodSuggestions([]);
    setCityPlaceId(null);
  };

  const handleApartmentPress = (apartment: Apartment) => {
    router.push({ pathname: '/apartment/[id]', params: { id: apartment.id } });
  };

  if (isLoading && !refreshing) {
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
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.topActionBtn}
            onPress={() => router.push('/(tabs)/add-apartment')}
          >
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} style={styles.topActionBtn} onPress={() => setIsFilterOpen(true)}>
            <SlidersHorizontal size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#9DA4AE" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש לפי עיר, שכונה או כתובת..."
          placeholderTextColor="#9DA4AE"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Removed hero banner */}

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
            tintColor="#7C5CFF"
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

      {/* Filter Modal */}
      <Modal visible={isFilterOpen} animationType="slide" transparent onRequestClose={() => setIsFilterOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsFilterOpen(false)} />

          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>סינון דירות</Text>
              <TouchableOpacity onPress={() => setIsFilterOpen(false)} style={styles.closeBtn}>
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetContent}>
              <View style={styles.fieldGroup}> 
                <Text style={styles.fieldLabel}>עיר</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="לדוגמה: תל אביב-יפו"
                  placeholderTextColor="#9DA4AE"
                  value={filters.city}
                  onChangeText={(t) => {
                    setFilters((f) => ({ ...f, city: t }));
                    setCityPlaceId(null);
                  }}
                />
                {citySuggestions.length > 0 ? (
                  <View style={styles.suggestionsBox}>
                    {citySuggestions.map((p) => (
                      <TouchableOpacity
                        key={p.placeId}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setFilters((f) => ({ ...f, city: p.description }));
                          setCityPlaceId(p.placeId);
                          setCitySuggestions([]);
                        }}
                      >
                        <Text style={styles.suggestionText}>{p.description}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.fieldGroup}> 
                <Text style={styles.fieldLabel}>שכונה</Text>
                <TextInput
                  style={[styles.fieldInput, !filters.city ? { opacity: 0.6 } : null]}
                  placeholder={filters.city ? 'לדוגמה: פלורנטין' : 'בחר עיר קודם'}
                  editable={!!filters.city}
                  placeholderTextColor="#9DA4AE"
                  value={filters.neighborhood}
                  onChangeText={(t) => setFilters((f) => ({ ...f, neighborhood: t }))}
                />
                {neighborhoodSuggestions.length > 0 ? (
                  <View style={styles.suggestionsBox}>
                    {neighborhoodSuggestions.map((name) => (
                      <TouchableOpacity
                        key={name}
                        style={styles.suggestionItem}
                        onPress={() => { setFilters((f) => ({ ...f, neighborhood: name })); setNeighborhoodSuggestions([]); }}
                      >
                        <Text style={styles.suggestionText}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.rowBetween}>
                <View style={[styles.fieldGroup, styles.fieldHalf]}>
                  <Text style={styles.fieldLabel}>מחיר מינימלי (₪)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#9DA4AE"
                    value={filters.minPrice}
                    onChangeText={(t) => setFilters((f) => ({ ...f, minPrice: t.replace(/[^0-9]/g, '') }))}
                  />
                </View>
                <View style={[styles.fieldGroup, styles.fieldHalf]}>
                  <Text style={styles.fieldLabel}>מחיר מקסימלי (₪)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    keyboardType="number-pad"
                    placeholder="ללא"
                    placeholderTextColor="#9DA4AE"
                    value={filters.maxPrice}
                    onChangeText={(t) => setFilters((f) => ({ ...f, maxPrice: t.replace(/[^0-9]/g, '') }))}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}> 
                <Text style={styles.fieldLabel}>חדרי שינה (מינימום)</Text>
                <View style={styles.chipsRow}>
                  {[1,2,3,4,5].map((n) => {
                    const selected = String(n) === filters.minBedrooms;
                    return (
                      <TouchableOpacity
                        key={`bed-${n}`}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => setFilters((f) => ({ ...f, minBedrooms: selected ? '' : String(n) }))}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{n}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}> 
                <Text style={styles.fieldLabel}>חדרי רחצה (מינימום)</Text>
                <View style={styles.chipsRow}>
                  {[1,2,3].map((n) => {
                    const selected = String(n) === filters.minBathrooms;
                    return (
                      <TouchableOpacity
                        key={`bath-${n}`}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => setFilters((f) => ({ ...f, minBathrooms: selected ? '' : String(n) }))}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{n}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.clearBtn} onPress={() => { clearFilters(); }}>
                <Text style={styles.clearText}>נקה</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => { setIsFilterOpen(false); filterApartments(); }}
              >
                <Text style={styles.applyText}>הצג תוצאות</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#17171F',
    borderRadius: 22,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
  },
  heroCard: {
    backgroundColor: '#2B2141',
    marginHorizontal: 16,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 12,
  },
  heroText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  listContent: {
    padding: 16,
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
    backgroundColor: '#141420',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
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
    fontWeight: '700',
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
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: '#C9CDD6',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  fieldInput: {
    backgroundColor: '#17171F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A37',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    textAlign: 'right',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  chipSelected: {
    backgroundColor: '#2B2141',
    borderColor: '#7C5CFF',
  },
  chipText: {
    color: '#C9CDD6',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  clearBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A4A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  clearText: {
    color: '#C9CDD6',
    fontSize: 15,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C5CFF',
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
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
  suggestionsBox: {
    marginTop: 6,
    backgroundColor: '#17171F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A37',
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A37',
  },
  suggestionText: {
    color: '#E5E7EB',
    fontSize: 14,
    textAlign: 'right',
  },
});
