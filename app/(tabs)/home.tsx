import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Animated wrapper for VirtualizedList/FlatList to support native onScroll
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as any);
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, X, Plus, Map } from 'lucide-react-native';
import { getNeighborhoodsForCityName, searchCitiesWithNeighborhoods } from '@/lib/neighborhoods';
import { supabase } from '@/lib/supabase';
import { useApartmentStore } from '@/stores/apartmentStore';
import { useAuthStore } from '@/stores/authStore';
import { Apartment } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';
import FloatingTabBar from '@/components/FloatingTabBar';
import FilterChipsBar, { defaultFilterChips, selectedFiltersFromIds } from '@/components/FilterChipsBar';


export default function HomeScreen() {
  const router = useRouter();
  const { apartments, setApartments, isLoading, setLoading } =
    useApartmentStore();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredApartments, setFilteredApartments] = useState<Apartment[]>(
    []
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    city: '',
    neighborhoods: [] as string[],
    minPrice: '',
    maxPrice: '',
    minBedrooms: '',
    minBathrooms: '',
  });
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [isNeighborhoodDropdownOpen, setIsNeighborhoodDropdownOpen] = useState(false);
  const [neighborhoodSearchQuery, setNeighborhoodSearchQuery] = useState('');
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);
  const [chipSelected, setChipSelected] = useState<string[]>([]);
  // Removed cityPlaceId/sessionToken (no Google city autocomplete)

  // Animated collapse/expand for search row + chips
  const scrollY = useRef(new Animated.Value(0)).current;
  const clamped = Animated.diffClamp(scrollY, 0, 120);
  const headerScale = clamped.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });
  const headerTranslateY = clamped.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -12],
    extrapolate: 'clamp',
  });
  const chipsOpacity = clamped.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.65],
    extrapolate: 'clamp',
  });
  const chipsTranslateY = clamped.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -8],
    extrapolate: 'clamp',
  });

  // Header for the list – contains search row and filter chips so that
  // the entire grey area scrolls together.
  const renderListHeader = () => (
    <Animated.View style={{ transform: [{ translateY: headerTranslateY }] }}>
      <Animated.View style={{ transform: [{ scale: headerScale }] }}>
        <View style={styles.searchRow}>
        {/* Filter button on the left */}
        <View style={styles.actionsRowBody}>
          {/* Map button (same style as filter); rendered first so with row-reverse the filter stays near the search */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.actionBtnBody}
            onPress={() => {
              Alert.alert('מפה', 'מסך המפה יתווסף בהמשך.');
            }}
          >
            <Map size={22} color="#4C1D95" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.actionBtnBody}
            onPress={() => setIsFilterOpen(true)}
          >
            <SlidersHorizontal size={22} color="#4C1D95" />
          </TouchableOpacity>
        </View>
        {/* Search input */}
        <View style={[styles.searchContainer, { flex: 1 }]}>
          <Search size={20} color="#4C1D95" style={styles.searchIcon} />
          <TextInput
            style={styles.topSearchInput}
            placeholder="חיפוש לפי עיר, שכונה או כתובת..."
            placeholderTextColor="#9DA4AE"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        </View>
      </Animated.View>
      <Animated.View style={{ opacity: chipsOpacity, transform: [{ translateY: chipsTranslateY }] }}>
        <FilterChipsBar
          filters={defaultFilterChips}
          selectedIds={chipSelected}
          onChange={setChipSelected}
          onOpenDropdown={(chip) => {
            if (chip.id === 'price' || chip.id === 'rooms') {
              setIsFilterOpen(true);
            }
          }}
          style={{ marginTop: 8, marginBottom: 12 }}
        />
      </Animated.View>
    </Animated.View>
  );

  useEffect(() => {
    fetchApartments();
  }, []);

  useEffect(() => {
    filterApartments();
  }, [searchQuery, apartments, filters]);

  // no-op

  useEffect(() => {
    if (!isFilterOpen) {
      setIsNeighborhoodDropdownOpen(false);
    }
  }, [isFilterOpen]);

  // City suggestions (local)
  useEffect(() => {
    let active = true;
    const run = () => {
      const q = filters.city.trim();
      if (!q || q.length < 1) { setCitySuggestions([]); return; }
      const names = searchCitiesWithNeighborhoods(q, 8);
      if (active) setCitySuggestions(names);
    };
    run();
    return () => { active = false; };
  }, [filters.city]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const cityName = (filters.city || '').trim();
      if (!cityName) {
        setNeighborhoodOptions([]);
        setIsLoadingNeighborhoods(false);
        return;
      }
      setIsLoadingNeighborhoods(true);
      try {
        const list = getNeighborhoodsForCityName(cityName);
        if (!cancelled) {
          setNeighborhoodOptions(list);
          setIsLoadingNeighborhoods(false);
        }
      } catch {
        if (!cancelled) {
          setNeighborhoodOptions([]);
          setIsLoadingNeighborhoods(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [filters.city]);

  // Removed Google neighborhood autocomplete in favor of static dropdown filtering

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
    const selectedNeighborhoods = (filters.neighborhoods || []).map((n) => n.toLowerCase());

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

      // neighborhoods filter (any selected)
      if (selectedNeighborhoods.length > 0) {
        const hoodField = ((apartment as any).neighborhood || '').toLowerCase();
        if (hoodField) {
          if (!selectedNeighborhoods.some((sel) => hoodField === sel)) return false;
        } else {
          const addr = apartment.address.toLowerCase();
          if (!selectedNeighborhoods.some((sel) => addr.includes(sel))) return false;
        }
      }

      return true;
    });

    setFilteredApartments(filtered);
  };

  const clearFilters = () => {
    setFilters({ city: '', neighborhoods: [], minPrice: '', maxPrice: '', minBedrooms: '', minBathrooms: '' });
    setCitySuggestions([]);
    setNeighborhoodOptions([]);
    setIsNeighborhoodDropdownOpen(false);
  };

  const handleApartmentPress = (apartment: Apartment) => {
    router.push({ pathname: '/apartment/[id]', params: { id: apartment.id } });
  };

  const handleAddApartmentPress = async () => {
    // If regular user is already assigned as a partner to an apartment, block adding a new one
    try {
      const currentUserId = (user as any)?.id;
      const currentRole = (user as any)?.role;
      if (currentUserId && currentRole === 'user') {
        const { data, error } = await supabase
          .from('apartments')
          .select('id')
          .contains('partner_ids', [currentUserId])
          .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
          Alert.alert(
            'לא ניתן להוסיף דירה',
            'אתה כבר משויך לדירה קיימת ולא ניתן להוסיף דירה נוספת.'
          );
          return;
        }
      }
    } catch {
      Alert.alert('שגיאה', 'אירעה שגיאה בבדיקת השיוך לדירה. נסה שוב.');
      return;
    }
    router.push('/(tabs)/add-apartment');
  };

  if (isLoading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4C1D95" />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeTop}>
      <View style={[styles.topBar, { paddingTop: 52, backgroundColor: '#FFFFFF' }]} />

      {/* Page body: light grey background */}
      <View style={styles.pageBody}>
        {/* Removed hero banner */}

        <AnimatedFlatList
          data={filteredApartments}
          renderItem={({ item }) => (
            <ApartmentCard
              apartment={item}
              onPress={() => handleApartmentPress(item)}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderListHeader}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4C1D95"
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
      </View>

      {/* Floating bottom pill menu for the Apartments screen */}
      <FloatingTabBar active="home" />

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
                    setFilters((f) => ({ ...f, city: t, neighborhoods: [] }));
                    setNeighborhoodOptions([]);
                    setIsNeighborhoodDropdownOpen(false);
                  }}
                />
                {citySuggestions.length > 0 ? (
                  <View style={styles.suggestionsBox}>
                    {citySuggestions.map((name) => (
                      <TouchableOpacity
                        key={name}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setFilters((f) => ({ ...f, city: name, neighborhoods: [] }));
                          setCitySuggestions([]);
                          setNeighborhoodOptions([]);
                          setIsNeighborhoodDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.suggestionText}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.fieldGroup}> 
                <Text style={styles.fieldLabel}>שכונה</Text>
                <TouchableOpacity
                  style={[
                    styles.fieldInput,
                    styles.selectButton,
                    !filters.city ? { opacity: 0.6 } : null,
                  ]}
                  onPress={() => {
                    if (filters.city && !isLoadingNeighborhoods) {
                      setIsNeighborhoodDropdownOpen(!isNeighborhoodDropdownOpen);
                    }
                  }}
                  disabled={!filters.city}
                >
                  <Text
                    style={[
                      styles.selectButtonText,
                      (!filters.neighborhoods || filters.neighborhoods.length === 0) && styles.selectButtonPlaceholder,
                    ]}
                  >
                    {filters.neighborhoods && filters.neighborhoods.length > 0
                      ? `נבחרו ${filters.neighborhoods.length}`
                      :
                      (isLoadingNeighborhoods
                        ? 'טוען שכונות...'
                        : neighborhoodOptions.length > 0
                        ? 'בחר שכונות'
                        : filters.city
                        ? 'אין שכונות זמינות'
                        : 'בחר עיר קודם')}
                  </Text>
                  <Text style={styles.selectButtonArrow}>▼</Text>
                </TouchableOpacity>
                {isNeighborhoodDropdownOpen && neighborhoodOptions.length > 0 ? (
                  <View style={styles.suggestionsBox}>
                    <TextInput
                      style={styles.dropdownSearchInput}
                      placeholder="חפש שכונה..."
                      placeholderTextColor="#9DA4AE"
                      value={neighborhoodSearchQuery}
                      onChangeText={setNeighborhoodSearchQuery}
                      autoFocus
                    />
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                      {(neighborhoodSearchQuery
                        ? neighborhoodOptions.filter((name) =>
                            name.toLowerCase().includes(neighborhoodSearchQuery.toLowerCase())
                          )
                        : neighborhoodOptions
                      )
                        .slice(0, 100)
                        .map((name) => (
                          <TouchableOpacity
                            key={name}
                            style={[
                              styles.suggestionItem,
                              (filters.neighborhoods || []).includes(name) ? { backgroundColor: '#1B1C27' } : null,
                            ]}
                            onPress={() => {
                              setFilters((f) => {
                                const current = new Set(f.neighborhoods || []);
                                if (current.has(name)) current.delete(name);
                                else current.add(name);
                                return { ...f, neighborhoods: Array.from(current) };
                              });
                            }}
                          >
                            <Text style={styles.suggestionText}>
                              {(filters.neighborhoods || []).includes(name) ? '✓ ' : ''}{name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
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
    backgroundColor: 'transparent',
  },
  safeTop: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  pageBody: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'visible',
    paddingTop: 0,
  },
  searchRow: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    // Force LTR order to keep the filter button on the left on iOS RTL too
    // (we render [filter][search] so visually it will be left-to-right stable)
    ...(Platform.OS !== 'web' ? ({ direction: 'ltr' } as const) : {}),
    alignItems: 'center',
    gap: 12,
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
    backgroundColor: '#EFEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  actionsRowBody: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  searchContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 10,
    height: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionBtnBody: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    marginLeft: 8,
  },
  topSearchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    textAlign: 'right',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 12,
  },
  heroText: {
    color: '#4C1D95',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  listContent: {
    padding: 16,
    paddingBottom: 140, // Leave room for floating tab bar
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFEAFE',
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
    color: '#4C1D95',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipSelected: {
    backgroundColor: '#EFEAFE',
    borderColor: '#A78BFA',
  },
  chipText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#4C1D95',
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
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  clearText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4C1D95',
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
    color: '#6B7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  suggestionsBox: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: {
    color: '#111827',
    fontSize: 14,
    textAlign: 'right',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
  },
  selectButtonPlaceholder: {
    color: '#9CA3AF',
  },
  selectButtonArrow: {
    color: '#9CA3AF',
    fontSize: 12,
    marginLeft: 8,
  },
searchInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
    marginHorizontal: 8,
    marginTop: 8,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
});
