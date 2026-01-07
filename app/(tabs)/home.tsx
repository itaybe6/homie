import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  ScrollView,
  Alert,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, Map } from 'lucide-react-native';
import { getAllCitiesWithNeighborhoods, getNeighborhoodsForCityName } from '@/lib/neighborhoods';
import { supabase } from '@/lib/supabase';
import { useApartmentStore } from '@/stores/apartmentStore';
import { useAuthStore } from '@/stores/authStore';
import { Apartment } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';
import FilterChipsBar, { defaultFilterChips, selectedFiltersFromIds } from '@/components/FilterChipsBar';
import { KeyFabPanel } from '@/components/KeyFabPanel';
import { alpha, colors } from '@/lib/theme';

function parseOptionalInt(v: string): number | null {
  const t = String(v || '').trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function GaugeStepper({
  label,
  value,
  min,
  max,
  onChange,
  maxDisplay,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (next: number | null) => void;
  maxDisplay?: string;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const displayValue =
    value === null ? 'ללא' : value === max && maxDisplay ? maxDisplay : String(value);

  const dec = () => {
    if (value === null) return;
    if (value <= min) onChange(null);
    else onChange(value - 1);
  };

  const inc = () => {
    if (value === null) onChange(min);
    else onChange(Math.min(max, value + 1));
  };

  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeTopRow}>
        <Text style={styles.gaugeLabel}>{label}</Text>
        <View style={styles.gaugeTopActions}>
          <View style={styles.gaugeValueChip}>
            <Text style={styles.gaugeValueChipText}>{displayValue}</Text>
          </View>
          <Pressable
            onPress={() => onChange(null)}
            disabled={value === null}
            style={({ pressed }) => [
              styles.gaugeClearLink,
              value === null ? styles.gaugeClearLinkDisabled : null,
              pressed && value !== null ? styles.gaugeClearLinkPressed : null,
            ]}
          >
            <Text style={[styles.gaugeClearLinkText, value === null ? styles.gaugeClearLinkTextDisabled : null]}>
              נקה
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.gaugeBarWithBtns}>
        <Pressable
          onPress={dec}
          disabled={value === null}
          style={({ pressed }) => [
            styles.gaugeMiniBtn,
            value === null ? styles.gaugeMiniBtnDisabled : null,
            pressed && value !== null ? styles.gaugeMiniBtnPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label} -`}
        >
          <Text style={styles.gaugeMiniBtnText}>−</Text>
        </Pressable>

        <View style={styles.gaugeBarRow}>
          {steps.map((n) => {
            const filled = value !== null && n <= value;
            return (
              <Pressable
                key={`${label}-${n}`}
                onPress={() => onChange(n)}
                style={({ pressed }) => [
                  styles.gaugeSegment,
                  filled ? styles.gaugeSegmentFilled : null,
                  pressed ? styles.gaugeSegmentPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${label} ${n}`}
              />
            );
          })}
        </View>

        <Pressable
          onPress={inc}
          style={({ pressed }) => [styles.gaugeMiniBtn, pressed ? styles.gaugeMiniBtnPressed : null]}
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
        >
          <Text style={styles.gaugeMiniBtnText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.gaugeTicksRow}>
        <Text style={styles.gaugeTickText}>{min}</Text>
        <Text style={styles.gaugeTickText}>{maxDisplay ?? String(max)}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const PAGE_BG = '#FFFFFF';
  const { apartments, setApartments, isLoading, setLoading } =
    useApartmentStore();
  const { user } = useAuthStore();

  function normalizeIds(value: any): string[] {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {}
      return value
        .replace(/^{|}$/g, '')
        .split(',')
        .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  }

  function getMaxRoommates(apartment: Apartment): number | null {
    const anyApt = apartment as any;
    return typeof anyApt?.max_roommates === 'number'
      ? (anyApt.max_roommates as number)
      : typeof apartment.roommate_capacity === 'number'
        ? apartment.roommate_capacity
        : null;
  }

  function getNormalizedPartnerIds(apartment: Apartment): string[] {
    const anyApt = apartment as any;
    const ownerId = String(anyApt?.owner_id || '').trim();
    const raw = normalizeIds(anyApt?.partner_ids);
    const uniq = Array.from(
      new Set(
        raw
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          // Prevent counting the owner as a partner if bad data includes it
          .filter((id) => !ownerId || id !== ownerId)
      )
    );
    return uniq;
  }

  function getAvailableRoommateSlots(apartment: Apartment): number | null {
    const max = getMaxRoommates(apartment);
    if (max === null) return null;
    const used = getNormalizedPartnerIds(apartment).length;
    return Math.max(0, max - used);
  }
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
    minAvailableRoommateSlots: '',
  });
  const [cityOptions] = useState<string[]>(() => getAllCitiesWithNeighborhoods());
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [isNeighborhoodDropdownOpen, setIsNeighborhoodDropdownOpen] = useState(false);
  const [neighborhoodSearchQuery, setNeighborhoodSearchQuery] = useState('');
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);
  const [chipSelected, setChipSelected] = useState<string[]>([]);
  // Removed cityPlaceId/sessionToken (no Google city autocomplete)

  const filterBtnRef = useRef<View | null>(null);
  const DEFAULT_FILTER_TOP_OFFSET = 120;
  const [filterPanelTopOffset, setFilterPanelTopOffset] = useState(DEFAULT_FILTER_TOP_OFFSET);
  const [filterPanelHeight, setFilterPanelHeight] = useState(
    Math.max(320, Math.round(screenHeight * 0.52))
  );

  const openFilterPanel = useCallback(() => {
    const node = filterBtnRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        // Open DOWNWARD from the filter button (anchor=top)
        const desiredTop = Math.max(12, Math.round(y + h + 10));
        const bottomPadding = 18; // keep a little space from bottom edge
        const available = Math.max(240, Math.floor(screenHeight - desiredTop - bottomPadding));
        // Keep the panel relatively compact; use internal scrolling for overflow.
        const maxH = Math.min(520, Math.round(screenHeight * 0.54));
        const nextH = Math.max(240, Math.min(maxH, available));
        setFilterPanelTopOffset(desiredTop);
        setFilterPanelHeight(nextH);
        setIsFilterOpen(true);
      });
      return;
    }
    setFilterPanelTopOffset(DEFAULT_FILTER_TOP_OFFSET);
    setFilterPanelHeight(Math.max(320, Math.round(screenHeight * 0.52)));
    setIsFilterOpen(true);
  }, [screenHeight]);

  // Reanimated scroll values (drives header)
  const scrollY = useSharedValue(0); // px

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const headerOuterStyle = useAnimatedStyle(() => {
    const clamped = Math.min(120, Math.max(0, scrollY.value));
    return {
      transform: [
        {
          translateY: interpolate(clamped, [0, 120], [0, -12], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const headerInnerStyle = useAnimatedStyle(() => {
    const clamped = Math.min(120, Math.max(0, scrollY.value));
    return {
      transform: [
        {
          scale: interpolate(clamped, [0, 120], [1, 0.9], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const chipsStyle = useAnimatedStyle(() => {
    const clamped = Math.min(120, Math.max(0, scrollY.value));
    return {
      transform: [
        {
          translateY: interpolate(clamped, [0, 120], [0, -8], Extrapolation.CLAMP),
        },
      ],
    };
  });

  // Header for the list – contains search row and filter chips so that
  // the entire grey area scrolls together.
  // IMPORTANT: avoid passing an inline component function to FlatList.
  // If the function identity changes between renders, FlatList can remount the header,
  // causing the TextInput to lose focus while filtering/searching updates state.
  const listHeader = useMemo(() => (
    <Animated.View
      style={[{ backgroundColor: PAGE_BG }, headerOuterStyle]}
    >
      <Animated.View style={headerInnerStyle}>
        <View style={styles.headerFullBleed}>
          <View style={styles.searchRow}>
          {/* Filter button on the left */}
          <View style={styles.actionsRowBody}>
            {/* Map button (same style as filter); rendered first so with row-reverse the filter stays near the search */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.actionBtnBody}
              onPress={() => {
                router.push('/(tabs)/map');
              }}
            >
              <Map size={22} color={colors.primary} />
            </TouchableOpacity>
            {/* Wrap in a real View ref so measureInWindow works reliably (esp. Android) */}
            <View ref={filterBtnRef} collapsable={false}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.actionBtnBody}
                onPress={openFilterPanel}
              >
                <SlidersHorizontal size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
          {/* Search input */}
          <View style={[styles.searchContainer, { flex: 1 }]}>
            <Search size={20} color={colors.primary} style={styles.searchIcon} />
            <TextInput
              style={styles.topSearchInput}
              placeholder="חיפוש לפי עיר או שכונה..."
              placeholderTextColor="#9DA4AE"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          </View>
        </View>
      </Animated.View>
      <Animated.View style={chipsStyle}>
        <FilterChipsBar
          filters={defaultFilterChips}
          selectedIds={chipSelected}
          onChange={setChipSelected}
          withShadow={false}
          chipBorderWidth={1}
          // Inactive chips match the ApartmentCard "בניין/מ״ר" tag pills
          inactiveBackgroundColor={alpha(colors.primary, 0.08)}
          inactiveBorderColor={alpha(colors.primary, 0.18)}
          inactiveTextColor={colors.primary}
          inactiveIconColor={colors.primary}
          // Active chips: soft green highlight (less brown repetition)
          activeBackgroundColor={alpha(colors.success, 0.86)}
          activeBorderColor={alpha(colors.success, 0.6)}
          activeTextColor={colors.white}
          activeIconColor={colors.white}
          onOpenDropdown={(chip) => {
            if (chip.id === 'price' || chip.id === 'rooms') {
              openFilterPanel();
            }
          }}
          style={{ marginTop: 8, marginBottom: 20 }}
        />
      </Animated.View>
    </Animated.View>
  ), [headerOuterStyle, headerInnerStyle, chipsStyle, openFilterPanel, router, searchQuery, chipSelected]);

  useEffect(() => {
    fetchApartments();
  }, []);

  useEffect(() => {
    filterApartments();
  }, [searchQuery, apartments, filters, chipSelected]);

  // no-op

  useEffect(() => {
    if (!isFilterOpen) {
      setIsNeighborhoodDropdownOpen(false);
      setIsCityDropdownOpen(false);
      setCitySearchQuery('');
    }
  }, [isFilterOpen]);

  // Android hardware back: close the filter panel (KeyFabPanel isn't a native Modal)
  useEffect(() => {
    if (!isFilterOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsFilterOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [isFilterOpen]);

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
    const minAvailableRoommateSlots = filters.minAvailableRoommateSlots
      ? Number(filters.minAvailableRoommateSlots)
      : null;
    const cityFilter = filters.city.trim().toLowerCase();
    const selectedNeighborhoods = (filters.neighborhoods || []).map((n) => n.toLowerCase());
    const chipFilters = selectedFiltersFromIds(chipSelected || []);

    const filtered = apartments.filter((apartment) => {
      const anyApt = apartment as any;

      // Hide apartments that are already full (when capacity is known).
      const availableSlots = getAvailableRoommateSlots(apartment);
      if (availableSlots !== null && availableSlots <= 0) return false;

      // search query
      const matchesSearch = !query
        || apartment.city.toLowerCase().includes(query)
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

      // Property feature chips (toggles)
      if (chipFilters.pets_allowed && !anyApt?.pets_allowed) return false;
      if (chipFilters.is_furnished && !anyApt?.is_furnished) return false;
      if (chipFilters.wheelchair_accessible && !anyApt?.wheelchair_accessible) return false;
      if (chipFilters.has_safe_room && !anyApt?.has_safe_room) return false;
      if (chipFilters.has_elevator && !anyApt?.has_elevator) return false;
      if (chipFilters.kosher_kitchen && !anyApt?.kosher_kitchen) return false;
      if (chipFilters.has_air_conditioning && !anyApt?.has_air_conditioning) return false;
      if (chipFilters.has_solar_heater && !anyApt?.has_solar_heater) return false;
      if (chipFilters.is_renovated && !anyApt?.is_renovated) return false;
      if (chipFilters.balcony) {
        const bc = typeof anyApt?.balcony_count === 'number' ? (anyApt.balcony_count as number) : 0;
        if (bc <= 0) return false;
      }

      // roommate slots (available spots for partners)
      if (minAvailableRoommateSlots !== null) {
        const available = getAvailableRoommateSlots(apartment);
        if (available === null || available < minAvailableRoommateSlots) return false;
      }

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
    setFilters({
      city: '',
      neighborhoods: [],
      minPrice: '',
      maxPrice: '',
      minBedrooms: '',
      minBathrooms: '',
      minAvailableRoommateSlots: '',
    });
    setChipSelected([]);
    setIsCityDropdownOpen(false);
    setCitySearchQuery('');
    setNeighborhoodOptions([]);
    setIsNeighborhoodDropdownOpen(false);
    setNeighborhoodSearchQuery('');
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
    router.push('/add-apartment' as any);
  };

  if (isLoading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeTop}>
      {/* Spacer to avoid content sitting under the absolute GlobalTopBar */}
      <View style={[styles.topBar, { paddingTop: 44, paddingBottom: 0, backgroundColor: PAGE_BG }]} />

      {/* Page body: light grey background */}
      <View style={styles.pageBody}>
        {/* Removed hero banner */}

        <Animated.FlatList
          data={filteredApartments}
          renderItem={({ item }: { item: Apartment }) => (
            <View>
              <ApartmentCard apartment={item} onPress={() => handleApartmentPress(item)} variant="home" />
            </View>
          )}
          keyExtractor={(item: Apartment) => item.id}
          contentContainerStyle={styles.listContent}
          style={{ backgroundColor: PAGE_BG }}
          ListHeaderComponent={listHeader}
          onScroll={onScroll}
          scrollEventThrottle={1000 / 60}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
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

      {/* Filter panel – same animated UX as the "key" button panel on apartment page */}
      <KeyFabPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="סינון דירות"
        subtitle=""
        anchor="top"
        topOffset={filterPanelTopOffset}
      >
        <View style={{ height: filterPanelHeight }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.sheetContentInner,
              { paddingHorizontal: 0, paddingTop: 2, paddingBottom: 6 },
            ]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            persistentScrollbar={false}
          >
              <View style={styles.fieldGroup}> 
                <Text style={styles.fieldLabel}>עיר</Text>
                <TouchableOpacity
                  style={[styles.fieldInput, styles.selectButton]}
                  onPress={() => {
                    setIsCityDropdownOpen(!isCityDropdownOpen);
                    setIsNeighborhoodDropdownOpen(false);
                    setNeighborhoodSearchQuery('');
                  }}
                >
                  <Text
                    style={[
                      styles.selectButtonText,
                      !filters.city && styles.selectButtonPlaceholder,
                    ]}
                  >
                    {filters.city ? filters.city : 'בחר עיר'}
                  </Text>
                  <Text style={styles.selectButtonArrow}>▼</Text>
                </TouchableOpacity>
                {isCityDropdownOpen ? (
                  <View style={styles.suggestionsBox}>
                    <TextInput
                      style={styles.dropdownSearchInput}
                      placeholder="חפש עיר..."
                      placeholderTextColor="#9DA4AE"
                      value={citySearchQuery}
                      onChangeText={setCitySearchQuery}
                    />
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                      {(citySearchQuery
                        ? cityOptions.filter((name) =>
                            name.toLowerCase().includes(citySearchQuery.toLowerCase())
                          )
                        : cityOptions
                      )
                        .slice(0, 100)
                        .map((name) => (
                          <TouchableOpacity
                            key={name}
                            style={[
                              styles.suggestionItem,
                              filters.city === name ? styles.suggestionItemSelected : null,
                            ]}
                            onPress={() => {
                              setFilters((f) => ({ ...f, city: name, neighborhoods: [] }));
                              setIsCityDropdownOpen(false);
                              setCitySearchQuery('');
                              setNeighborhoodOptions([]);
                              setIsNeighborhoodDropdownOpen(false);
                              setNeighborhoodSearchQuery('');
                            }}
                          >
                            <Text style={[styles.suggestionText, filters.city === name ? styles.suggestionTextSelected : null]}>
                              {filters.city === name ? '✓ ' : ''}{name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
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
                              (filters.neighborhoods || []).includes(name) ? styles.suggestionItemSelected : null,
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
                            <Text
                              style={[
                                styles.suggestionText,
                                (filters.neighborhoods || []).includes(name) ? styles.suggestionTextSelected : null,
                              ]}
                            >
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
                <GaugeStepper
                  label="חדרי שינה (מינימום)"
                  min={1}
                  max={6}
                  maxDisplay="6+"
                  value={parseOptionalInt(filters.minBedrooms)}
                  onChange={(next) =>
                    setFilters((f) => ({ ...f, minBedrooms: next === null ? '' : String(clampInt(next, 1, 6)) }))
                  }
                />
              </View>

              <View style={styles.fieldGroup}> 
                <GaugeStepper
                  label="חדרי רחצה (מינימום)"
                  min={1}
                  max={4}
                  maxDisplay="4+"
                  value={parseOptionalInt(filters.minBathrooms)}
                  onChange={(next) =>
                    setFilters((f) => ({ ...f, minBathrooms: next === null ? '' : String(clampInt(next, 1, 4)) }))
                  }
                />
              </View>

              <View style={styles.fieldGroup}>
                <GaugeStepper
                  label="מקומות פנויים לשותפים (מינימום)"
                  min={1}
                  max={4}
                  maxDisplay="4+"
                  value={parseOptionalInt(filters.minAvailableRoommateSlots)}
                  onChange={(next) =>
                    setFilters((f) => ({
                      ...f,
                      minAvailableRoommateSlots: next === null ? '' : String(clampInt(next, 1, 4)),
                    }))
                  }
                />
              </View>
          </ScrollView>

          <View style={styles.sheetFooter}>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                clearFilters();
              }}
            >
              <Text style={styles.clearText}>נקה</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => {
                setIsFilterOpen(false);
                filterApartments();
              }}
            >
              <Text style={styles.applyText}>הצג תוצאות</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyFabPanel>
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
    backgroundColor: '#FFFFFF',
  },
  pageBody: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'visible',
    paddingTop: 0,
  },
  // The list has paddingHorizontal=16. This "bleeds" the header to full width,
  // then re-applies a single consistent padding so the search row isn't double-padded.
  headerFullBleed: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  searchRow: {
    paddingHorizontal: 0,
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
    backgroundColor: alpha(colors.primary, 0.1),
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
    // Floating look (no border)
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  actionBtnBody: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // Floating look (no border)
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
    writingDirection: 'rtl',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
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
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  listContent: {
    padding: 16,
    paddingBottom: 140, // Leave room for floating tab bar
    backgroundColor: '#FFFFFF',
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
    flexDirection: 'row-reverse',
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
    backgroundColor: 'rgba(94,63,45,0.10)',
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetContentInner: {
    paddingBottom: 6,
    gap: 10,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.primary,
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
    writingDirection: 'rtl',
  },
  rowBetween: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
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
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderColor: 'rgba(94,63,45,0.45)',
  },
  chipText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#5e3f2d',
  },
  gaugeWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    gap: 8,
  },
  gaugeTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  gaugeLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  gaugeTopActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  gaugeValueChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gaugeValueChipText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  gaugeClearLink: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gaugeClearLinkDisabled: {},
  gaugeClearLinkPressed: {
    backgroundColor: '#F3F4F6',
  },
  gaugeClearLinkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  gaugeClearLinkTextDisabled: {
    color: '#9CA3AF',
  },
  gaugeBarWithBtns: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  gaugeMiniBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gaugeMiniBtnDisabled: {
    opacity: 0.5,
  },
  gaugeMiniBtnPressed: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderColor: alpha(colors.primary, 0.28),
  },
  gaugeMiniBtnText: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: -1,
  },
  gaugeBarRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    flex: 1,
  },
  gaugeSegment: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  gaugeSegmentFilled: {
    backgroundColor: colors.primary,
  },
  gaugeSegmentPressed: {
    opacity: 0.88,
  },
  gaugeTicksRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  gaugeTickText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  sheetFooter: {
    flexDirection: 'row-reverse',
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
    backgroundColor: colors.success,
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
    color: colors.primary,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  suggestionItemSelected: {
    backgroundColor: colors.success,
  },
  suggestionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  selectButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    flex: 1,
    color: colors.primary,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectButtonPlaceholder: {
    color: '#9CA3AF',
  },
  selectButtonArrow: {
    color: '#9CA3AF',
    fontSize: 12,
    marginRight: 8,
  },
  dropdownSearchInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
    marginHorizontal: 8,
    marginTop: 8,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
});
