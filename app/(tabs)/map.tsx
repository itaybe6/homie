import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxMap from '@/components/MapboxMap';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { geocodeApartmentAddress, geocodePlace } from '@/lib/mapboxGeocoding';
import type { Apartment } from '@/types/database';
import type { MapboxFeatureCollection } from '@/lib/mapboxHtml';
import FilterChipsBar, { type FilterChip } from '@/components/FilterChipsBar';
import { Search, X, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location/build/Location';
import { LocationAccuracy } from 'expo-location/build/Location.types';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return (value as unknown[])
      .map((v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return normalizeStringArray(parsed);
    } catch {
      // fallback: comma separated or {a,b}
      return s
        .replace(/^\s*\{|\}\s*$/g, '')
        .split(',')
        .map((x) => x.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
  }
  return [];
}

export default function MapTabScreen() {
  const router = useRouter();
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;
  const styleUrl = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL as string | undefined;
  const insets = useSafeAreaInsets();

  const [points, setPoints] = useState<MapboxFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [pointsError, setPointsError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chipSelected, setChipSelected] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>('');
  const [searchCenter, setSearchCenter] = useState<{ lng: number; lat: number } | null>(null);

  const filterChips = useMemo<FilterChip[]>(
    () => [
      { id: 'within_3km', label: 'עד 3 ק״מ ממני', type: 'toggle', renderIcon: (c, s) => <MapPin color={c} size={s} /> },
      { id: 'within_5km', label: 'עד 5 ק״מ ממני', type: 'toggle', renderIcon: (c, s) => <MapPin color={c} size={s} /> },
      { id: 'within_10km', label: 'עד 10 ק״מ ממני', type: 'toggle', renderIcon: (c, s) => <MapPin color={c} size={s} /> },
      { id: 'within_13km', label: 'עד 13 ק״מ ממני', type: 'toggle', renderIcon: (c, s) => <MapPin color={c} size={s} /> },
    ],
    []
  );

  const onChipChange = (next: string[]) => {
    // Make distance chips mutually exclusive
    const distanceIds = ['within_3km', 'within_5km', 'within_10km', 'within_13km'];
    const prev = chipSelected || [];
    const prevSet = new Set(prev);
    const nextSet = new Set(next);
    let toggledId: string | null = null;
    for (const id of nextSet) if (!prevSet.has(id)) toggledId = id;
    if (!toggledId) for (const id of prevSet) if (!nextSet.has(id)) toggledId = id;

    if (toggledId && distanceIds.includes(toggledId) && nextSet.has(toggledId)) {
      distanceIds.forEach((id) => {
        if (id !== toggledId) nextSet.delete(id);
      });
    }

    setChipSelected(Array.from(nextSet));
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLocating(true);
      setLocationError('');
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setLocationError('אין הרשאת מיקום — כדי לפתוח את המפה עליך/עלייך לאשר גישה למיקום.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: LocationAccuracy.Balanced,
        });
        const lng = pos?.coords?.longitude;
        const lat = pos?.coords?.latitude;
        if (typeof lng === 'number' && typeof lat === 'number' && !cancelled) {
          setUserLocation({ lng, lat });
        }
      } catch (e: any) {
        if (!cancelled) setLocationError(e?.message || 'שגיאה באיתור מיקום');
      } finally {
        if (!cancelled) setLocating(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // When typing a city/place, recenter the map to that place (debounced).
  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    if (!token) return;
    if (q.length < 2) {
      setSearchCenter(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const geo = await geocodePlace({ accessToken: token, query: q, country: 'il' });
        if (cancelled) return;
        setSearchCenter(geo);
      } catch {
        if (cancelled) return;
        setSearchCenter(null);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, token]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token) return;
      setLoadingPoints(true);
      setPointsError('');
      try {
        const { data, error } = await supabase
          .from('apartments')
          .select('id,title,address,city,image_urls,partner_ids,roommate_capacity,owner_id')
          .order('created_at', { ascending: false });
        if (error) throw error;

        const apartments = (data || []) as Array<
          Pick<
            Apartment,
            'id' | 'title' | 'address' | 'city' | 'owner_id' | 'roommate_capacity' | 'image_urls' | 'partner_ids'
          >
        >;

        // Collect all occupant ids (owner + partners) to fetch avatars/names
        const occupantIds = new Set<string>();
        for (const apt of apartments) {
          const ownerId = String((apt as any).owner_id || '').trim();
          if (ownerId) occupantIds.add(ownerId);
          const partnerIds = normalizeStringArray((apt as any).partner_ids);
          partnerIds.forEach((id) => occupantIds.add(String(id).trim()));
        }

        const usersById: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {};
        const ids = Array.from(occupantIds).filter(Boolean);
        // Supabase .in has practical limits; chunk to be safe
        for (const part of chunk(ids, 100)) {
          const { data: urows } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', part);
          (urows || []).forEach((u: any) => {
            const id = String(u?.id || '').trim();
            if (!id) return;
            usersById[id] = {
              id,
              full_name: u?.full_name ?? null,
              avatar_url: u?.avatar_url ?? null,
            };
          });
        }

        // Concurrency-limited geocoding
        const limit = 4;
        let idx = 0;
        const results: Array<{
          id: string;
          title: string;
          address: string;
          city: string;
          imageUrl?: string;
          imageUrlsJson: string;
          roommateCapacity?: number | null;
          occupantsJson: string;
          partnerCount: number;
          availableSlots: number | null;
          lng: number;
          lat: number;
        }> = [];

        const worker = async () => {
          while (idx < apartments.length && !cancelled) {
            const current = apartments[idx++];
            const address = (current.address || '').trim();
            const city = (current.city || '').trim();
            if (!address || !city) continue;

            const imageUrls = normalizeStringArray((current as any).image_urls);
            const imageUrl = imageUrls[0] || undefined;

            const ownerId = String((current as any).owner_id || '').trim();
            const partnerIds = normalizeStringArray((current as any).partner_ids);
            const occupants: Array<{ id: string; name: string; avatar_url?: string; role: 'owner' | 'partner' }> = [];
            if (ownerId) {
              const u = usersById[ownerId];
              occupants.push({
                id: ownerId,
                name: (u?.full_name || 'בעל הדירה').trim(),
                avatar_url: u?.avatar_url || undefined,
                role: 'owner',
              });
            }
            // De-dupe partners and avoid duplicating owner
            const uniqPartners = Array.from(new Set(partnerIds.map((x) => String(x).trim()).filter(Boolean))).filter(
              (id) => id !== ownerId
            );
            uniqPartners.forEach((pid) => {
              const u = usersById[pid];
              occupants.push({
                id: pid,
                name: (u?.full_name || 'שותף').trim(),
                avatar_url: u?.avatar_url || undefined,
                role: 'partner',
              });
            });

            const roommateCapacity =
              typeof (current as any).roommate_capacity === 'number' ? ((current as any).roommate_capacity as number) : null;

            const usedPartners = uniqPartners.length;
            const availableSlots = typeof roommateCapacity === 'number' ? Math.max(0, roommateCapacity - usedPartners) : null;

            // Show on map only apartments with known capacity and at least 1 available spot
            if (availableSlots == null || availableSlots <= 0) continue;

            const geo = await geocodeApartmentAddress({
              accessToken: token,
              address,
              city,
              country: 'il',
            });
            if (!geo) continue;
            results.push({
              id: String(current.id),
              title: String(current.title || 'דירה'),
              address,
              city,
              imageUrl,
              roommateCapacity,
              imageUrlsJson: JSON.stringify(imageUrls.slice(0, 12)),
              occupantsJson: JSON.stringify(occupants),
              partnerCount: usedPartners,
              availableSlots,
              lng: geo.lng,
              lat: geo.lat,
            });
          }
        };

        await Promise.all(Array.from({ length: limit }, () => worker()));

        const fc: MapboxFeatureCollection = {
          type: 'FeatureCollection',
          features: results.map((r) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
            properties: {
              id: r.id,
              title: r.title,
              address: r.address,
              city: r.city,
              image_url: r.imageUrl || '',
              image_urls_json: r.imageUrlsJson || '[]',
              roommate_capacity: r.roommateCapacity ?? '',
              occupants_json: r.occupantsJson,
              available_slots: r.availableSlots ?? '',
              has_image: !!(r.imageUrl && String(r.imageUrl).trim()),
            },
          })),
        };

        if (!cancelled) setPoints(fc);
      } catch (e: any) {
        if (!cancelled) setPointsError(e?.message || 'שגיאה בטעינת הדירות למפה');
      } finally {
        if (!cancelled) setLoadingPoints(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function safeLower(v: unknown): string {
    return String(v ?? '').toLowerCase();
  }

  const totalCount = useMemo(() => points.features.length, [points.features.length]);

  const filteredPoints = useMemo<MapboxFeatureCollection>(() => {
    const query = searchQuery.trim().toLowerCase();
    const selected = new Set(chipSelected || []);
    const distanceKm =
      selected.has('within_3km') ? 3 :
      selected.has('within_5km') ? 5 :
      selected.has('within_10km') ? 10 :
      selected.has('within_13km') ? 13 :
      null;

    function toRad(d: number) {
      return (d * Math.PI) / 180;
    }

    function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371; // km
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    const features = (points.features || []).filter((f) => {
      const props = (f as any)?.properties ?? {};
      const title = safeLower(props.title);
      const address = safeLower(props.address);
      const city = safeLower(props.city);

      if (query) {
        const ok =
          title.includes(query) ||
          address.includes(query) ||
          city.includes(query);
        if (!ok) return false;
      }

      if (distanceKm != null && userLocation) {
        const coords = (f as any)?.geometry?.coordinates;
        const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
        const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          const d = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
          if (d > distanceKm) return false;
        }
      }

      return true;
    });

    return { type: 'FeatureCollection', features };
  }, [points, searchQuery, chipSelected, userLocation]);

  const filteredCount = useMemo(() => filteredPoints.features.length, [filteredPoints.features.length]);
  const isFiltering = useMemo(() => !!searchQuery.trim() || (chipSelected?.length ?? 0) > 0, [searchQuery, chipSelected]);
  const isDistanceFilteringWithoutLocation = useMemo(() => {
    const s = new Set(chipSelected || []);
    return (s.has('within_3km') || s.has('within_5km') || s.has('within_10km') || s.has('within_13km')) && !userLocation;
  }, [chipSelected, userLocation]);

  const mapCenter = useMemo(() => {
    if (searchCenter && searchQuery.trim()) return [searchCenter.lng, searchCenter.lat] as const;
    if (userLocation) return [userLocation.lng, userLocation.lat] as const;
    return undefined;
  }, [searchCenter, searchQuery, userLocation]);

  const mapZoom = useMemo(() => {
    if (searchCenter && searchQuery.trim()) return 12;
    if (userLocation) return 13;
    return 11;
  }, [searchCenter, searchQuery, userLocation]);

  return (
    <SafeAreaView edges={[]} style={styles.safeTop}>
      <View style={styles.mapWrap}>
        <MapboxMap
          accessToken={token}
          styleUrl={styleUrl}
          // Prefer search center (city/place), otherwise user location, otherwise fit-to-points.
          center={mapCenter}
          zoom={mapZoom}
          points={filteredPoints}
          onApartmentPress={(id: string) => {
            router.push({ pathname: '/apartment/[id]', params: { id, returnTo: '/(tabs)/map' } });
          }}
        />
      </View>

      {/* Search + filters overlay */}
      {token ? (
        <View pointerEvents="box-none" style={[styles.topOverlay, { top: (insets.top || 0) + 10 }]}>
          <View style={styles.searchRow}>
            <View style={[styles.searchContainer, { flex: 1 }]}>
              <Search size={20} color="#4C1D95" style={styles.searchIcon} />
              <TextInput
                style={styles.topSearchInput}
                placeholder="חיפוש לפי שם, עיר או כתובת..."
                placeholderTextColor="#9DA4AE"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
              />
              {searchQuery.trim() ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="נקה חיפוש"
                  onPress={() => setSearchQuery('')}
                  style={styles.clearBtn}
                  activeOpacity={0.85}
                >
                  <X size={18} color="#4C1D95" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <FilterChipsBar
            filters={filterChips}
            selectedIds={chipSelected}
            onChange={onChipChange}
            style={{ marginTop: 8 }}
          />
        </View>
      ) : null}

      {!token ? (
        <View pointerEvents="none" style={styles.envHint}>
          <Text style={styles.envHintText}>
            כדי שהמפה תעבוד, צור קובץ .env בשורש הפרויקט והוסף:
            {'\n'}
            EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=...
            {'\n'}
            EXPO_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/...
            {'\n'}
            ואז תריץ מחדש את Expo.
          </Text>
        </View>
      ) : null}

      {token && loadingPoints ? (
        <View pointerEvents="none" style={styles.loadingBadge}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.loadingText}>טוען דירות למפה…</Text>
        </View>
      ) : null}

      {token && !loadingPoints && pointsError ? (
        <View pointerEvents="none" style={[styles.loadingBadge, { backgroundColor: 'rgba(153, 27, 27, 0.9)' }]}>
          <Text style={styles.loadingText}>{pointsError}</Text>
        </View>
      ) : null}

      {token && !loadingPoints && !pointsError && totalCount > 0 && (!isFiltering || filteredCount > 0) ? (
        <View pointerEvents="none" style={styles.countBadge}>
          <Text style={styles.countText}>
            {isFiltering ? `מוצגות ${filteredCount} מתוך ${totalCount}` : `מוצגות ${totalCount} דירות`}
          </Text>
        </View>
      ) : null}

      {token && !loadingPoints && !pointsError && isFiltering && filteredCount === 0 ? (
        <View pointerEvents="none" style={[styles.loadingBadge, { backgroundColor: 'rgba(17, 24, 39, 0.86)' }]}>
          <Text style={styles.loadingText}>אין תוצאות לסינון/חיפוש</Text>
        </View>
      ) : null}

      {token && !loadingPoints && !pointsError && isDistanceFilteringWithoutLocation ? (
        <View pointerEvents="none" style={[styles.loadingBadge, { backgroundColor: 'rgba(17, 24, 39, 0.86)' }]}>
          <Text style={styles.loadingText}>כדי לסנן לפי מרחק צריך לאשר גישה למיקום</Text>
        </View>
      ) : null}

      {token && !loadingPoints && !pointsError && locating ? (
        <View pointerEvents="none" style={[styles.countBadge, { backgroundColor: 'rgba(17, 24, 39, 0.86)' }]}>
          <Text style={[styles.countText, { fontWeight: '800' }]}>מאתר מיקום…</Text>
        </View>
      ) : null}

      {token && !loadingPoints && !pointsError && !locating && !!locationError ? (
        <View pointerEvents="none" style={[styles.loadingBadge, { backgroundColor: 'rgba(153, 27, 27, 0.9)' }]}>
          <Text style={styles.loadingText}>{locationError}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapWrap: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 80,
  },
  searchRow: {
    flexDirection: 'row',
    ...(Platform.OS !== 'web' ? ({ direction: 'ltr' } as const) : {}),
    alignItems: 'center',
    gap: 12,
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
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  envHint: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
  },
  envHintText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  loadingBadge: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    flex: 1,
  },
  countBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(76, 29, 149, 0.92)',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});


