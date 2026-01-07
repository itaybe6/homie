import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, Platform, ScrollView, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxMap from '@/components/MapboxMap';
import { KeyFabPanel } from '@/components/KeyFabPanel';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { geocodeApartmentAddress, geocodePlace } from '@/lib/mapboxGeocoding';
import type { Apartment } from '@/types/database';
import type { MapboxFeatureCollection } from '@/lib/mapboxHtml';
import FilterChipsBar, { defaultFilterChips, selectedFiltersFromIds, type FilterChip } from '@/components/FilterChipsBar';
import { Search, X, MapPin, LocateFixed, SlidersHorizontal } from 'lucide-react-native';
import * as Location from 'expo-location';

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

function transformSupabaseImageUrl(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Prefer the Supabase image renderer endpoint when available for better perf.
  if (trimmed.includes('/storage/v1/object/public/')) {
    const [base, query] = trimmed.split('?');
    const transformed = base.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    const params: string[] = [];
    if (query) params.push(query);
    params.push('width=800', 'quality=85', 'format=webp');
    return `${transformed}?${params.join('&')}`;
  }
  return trimmed;
}

export default function MapTabScreen() {
  const router = useRouter();
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;
  // Force Mapbox Standard style for Hebrew language support (ignore EXPO_PUBLIC_MAPBOX_STYLE_URL)
  const styleUrl = 'mapbox://styles/mapbox/standard';
  const insets = useSafeAreaInsets();
  const pointBrown = '#5e3f2d';

  const [points, setPoints] = useState<MapboxFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [pointsError, setPointsError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chipSelected, setChipSelected] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [distancePickerOpen, setDistancePickerOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>('');
  const [searchCenter, setSearchCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [centerOverride, setCenterOverride] = useState<{ lng: number; lat: number } | null>(null);
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);
  const [resultImgCandidateIdxById, setResultImgCandidateIdxById] = useState<Record<string, number>>({});

  const filterChips = useMemo<FilterChip[]>(
    () => [
      {
        id: 'distance',
        label: distanceKm ? `טווח: עד ${distanceKm} ק״מ` : 'טווח',
        type: 'dropdown',
        renderIcon: (c, s) => <MapPin color={c} size={s} />,
      },
      ...defaultFilterChips,
    ],
    [distanceKm]
  );

  const selectedChipIds = useMemo(() => {
    const ids = [...(chipSelected || [])];
    if (distanceKm != null) ids.push('distance');
    return ids;
  }, [chipSelected, distanceKm]);

  const fetchUserLocation = useCallback(async () => {
    setLocating(true);
    setLocationError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('אין הרשאת מיקום — כדי לסנן לפי מרחק או למרכז למיקום שלך, צריך לאשר גישה למיקום.');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lng = pos?.coords?.longitude;
      const lat = pos?.coords?.latitude;
      if (typeof lng === 'number' && typeof lat === 'number') {
        const next = { lng, lat };
        setUserLocation(next);
        return next;
      }
      setLocationError('לא הצלחתי לזהות את המיקום שלך');
      return null;
    } catch (e: any) {
      setLocationError(e?.message || 'שגיאה באיתור מיקום');
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    // Best-effort: prefetch location so distance chips + "my location" feel instant.
    fetchUserLocation();
  }, [fetchUserLocation]);

  // When typing a city/place, recenter the map to that place (debounced).
  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    if (!token) return;
    if (q.length < 2) {
      setSearchCenter(null);
      return;
    }
    // When searching, release any explicit manual centering.
    setCenterOverride(null);
    setZoomOverride(null);
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
          .select(
            'id,title,address,city,image_urls,partner_ids,roommate_capacity,max_roommates,owner_id,' +
              'pets_allowed,is_furnished,wheelchair_accessible,has_safe_room,has_elevator,kosher_kitchen,' +
              'has_air_conditioning,has_solar_heater,is_renovated,balcony_count'
          )
          .order('created_at', { ascending: false });
        if (error) throw error;

        type AptRow = Pick<
          Apartment,
          | 'id'
          | 'title'
          | 'address'
          | 'city'
          | 'owner_id'
          | 'roommate_capacity'
          | 'image_urls'
          | 'partner_ids'
          | 'pets_allowed'
          | 'is_furnished'
          | 'wheelchair_accessible'
          | 'has_safe_room'
          | 'has_elevator'
          | 'kosher_kitchen'
          | 'has_air_conditioning'
          | 'has_solar_heater'
          | 'is_renovated'
          | 'balcony_count'
        > & { max_roommates?: number | null };

        const apartments = (data || []) as AptRow[];

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
          // property features
          pets_allowed?: boolean;
          is_furnished?: boolean;
          wheelchair_accessible?: boolean;
          has_safe_room?: boolean;
          has_elevator?: boolean;
          kosher_kitchen?: boolean;
          has_air_conditioning?: boolean;
          has_solar_heater?: boolean;
          is_renovated?: boolean;
          balcony_count?: number | null;
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
            const maxRoommates =
              typeof (current as any).max_roommates === 'number'
                ? ((current as any).max_roommates as number)
                : roommateCapacity;
            const availableSlots = typeof maxRoommates === 'number' ? Math.max(0, maxRoommates - usedPartners) : null;

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
              roommateCapacity: maxRoommates,
              imageUrlsJson: JSON.stringify(imageUrls.slice(0, 12)),
              occupantsJson: JSON.stringify(occupants),
              partnerCount: usedPartners,
              availableSlots,
              lng: geo.lng,
              lat: geo.lat,
              pets_allowed: !!(current as any)?.pets_allowed,
              is_furnished: !!(current as any)?.is_furnished,
              wheelchair_accessible: !!(current as any)?.wheelchair_accessible,
              has_safe_room: !!(current as any)?.has_safe_room,
              has_elevator: !!(current as any)?.has_elevator,
              kosher_kitchen: !!(current as any)?.kosher_kitchen,
              has_air_conditioning: !!(current as any)?.has_air_conditioning,
              has_solar_heater: !!(current as any)?.has_solar_heater,
              is_renovated: !!(current as any)?.is_renovated,
              balcony_count: typeof (current as any)?.balcony_count === 'number' ? ((current as any).balcony_count as number) : 0,
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
              // Property features for filters
              pets_allowed: !!r.pets_allowed,
              is_furnished: !!r.is_furnished,
              wheelchair_accessible: !!r.wheelchair_accessible,
              has_safe_room: !!r.has_safe_room,
              has_elevator: !!r.has_elevator,
              kosher_kitchen: !!r.kosher_kitchen,
              has_air_conditioning: !!r.has_air_conditioning,
              has_solar_heater: !!r.has_solar_heater,
              is_renovated: !!r.is_renovated,
              balcony_count: typeof r.balcony_count === 'number' ? r.balcony_count : 0,
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
    const chipFilters = selectedFiltersFromIds(Array.from(selected));

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

      // Feature chips (same logic as Home screen)
      if (chipFilters.pets_allowed && !props?.pets_allowed) return false;
      if (chipFilters.is_furnished && !props?.is_furnished) return false;
      if (chipFilters.wheelchair_accessible && !props?.wheelchair_accessible) return false;
      if (chipFilters.has_safe_room && !props?.has_safe_room) return false;
      if (chipFilters.has_elevator && !props?.has_elevator) return false;
      if (chipFilters.kosher_kitchen && !props?.kosher_kitchen) return false;
      if (chipFilters.has_air_conditioning && !props?.has_air_conditioning) return false;
      if (chipFilters.has_solar_heater && !props?.has_solar_heater) return false;
      if (chipFilters.is_renovated && !props?.is_renovated) return false;
      if (chipFilters.balcony) {
        const bc = typeof props?.balcony_count === 'number' ? (props.balcony_count as number) : 0;
        if (bc <= 0) return false;
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
  }, [points, searchQuery, chipSelected, distanceKm, userLocation]);

  const filteredCount = useMemo(() => filteredPoints.features.length, [filteredPoints.features.length]);
  const isFiltering = useMemo(
    () => !!searchQuery.trim() || (chipSelected?.length ?? 0) > 0 || distanceKm != null,
    [searchQuery, chipSelected, distanceKm]
  );
  const isDistanceFilteringWithoutLocation = useMemo(() => {
    return distanceKm != null && !userLocation;
  }, [distanceKm, userLocation]);

  const mapCenter = useMemo(() => {
    if (centerOverride) return [centerOverride.lng, centerOverride.lat] as const;
    if (searchCenter && searchQuery.trim()) return [searchCenter.lng, searchCenter.lat] as const;
    if (userLocation) return [userLocation.lng, userLocation.lat] as const;
    return undefined;
  }, [centerOverride, searchCenter, searchQuery, userLocation]);

  const mapZoom = useMemo(() => {
    if (typeof zoomOverride === 'number') return zoomOverride;
    if (searchCenter && searchQuery.trim()) return 12;
    if (userLocation) return 13;
    return 11;
  }, [zoomOverride, searchCenter, searchQuery, userLocation]);

  const statusText = useMemo(() => {
    if (!token) return '';
    if (loadingPoints) return 'טוען דירות למפה…';
    if (pointsError) return pointsError;
    if (locating) return 'מאתר מיקום…';
    if (locationError) return locationError;
    if (isDistanceFilteringWithoutLocation) return 'כדי לסנן לפי מרחק צריך לאשר גישה למיקום';
    if (isFiltering && filteredCount === 0) return 'אין תוצאות לסינון/חיפוש';
    // Do not show a persistent "count" banner; keep status pill only for important states.
    if (totalCount > 0) return '';
    return 'אין עדיין דירות להצגה';
  }, [
    token,
    loadingPoints,
    pointsError,
    locating,
    locationError,
    isDistanceFilteringWithoutLocation,
    isFiltering,
    filteredCount,
    totalCount,
  ]);

  const statusTone = useMemo<'error' | 'neutral'>(() => {
    if (!token) return 'neutral';
    if (pointsError || locationError) return 'error';
    return 'neutral';
  }, [token, pointsError, locationError]);

  const results = useMemo(() => {
    const PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
    return (filteredPoints.features || [])
      .map((f) => {
        const props = (f as any)?.properties ?? {};
        const id = String(props.id || '').trim();
        if (!id) return null;
        // Prefer "main" image from the images JSON array; fall back to image_url; then placeholder.
        let primaryFromJson = '';
        try {
          const raw = String(props.image_urls_json || '').trim();
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed) && parsed.length > 0) primaryFromJson = String(parsed[0] || '').trim();
        } catch {
          // ignore parse errors
        }
        const imageUrlRaw = primaryFromJson || String(props.image_url || '').trim();
        const candidates = [
          transformSupabaseImageUrl(imageUrlRaw),
          imageUrlRaw,
          PLACEHOLDER,
        ]
          .map((u) => String(u || '').trim())
          .filter(Boolean);
        const imageCandidates = Array.from(new Set(candidates));
        const title = String(props.title || 'דירה');
        const city = String(props.city || '');
        const address = String(props.address || '');
        const availableSlots = Number(props.available_slots);
        return {
          id,
          imageCandidates,
          title,
          city,
          address,
          availableSlots: Number.isFinite(availableSlots) ? availableSlots : null,
        };
      })
      .filter(Boolean)
      .slice(0, 25) as Array<{
      id: string;
      imageCandidates: string[];
      title: string;
      city: string;
      address: string;
      availableSlots: number | null;
    }>;
  }, [filteredPoints]);

  const resultsKey = useMemo(() => results.map((r) => r.id).join('|'), [results]);
  useEffect(() => {
    // Keep only indices for visible results, and initialize missing ids to 0.
    setResultImgCandidateIdxById((prev) => {
      const next: Record<string, number> = {};
      for (const r of results) {
        next[r.id] = typeof prev[r.id] === 'number' ? prev[r.id] : 0;
      }
      return next;
    });
  }, [resultsKey]);

  return (
    <SafeAreaView edges={[]} style={styles.safeTop}>
      <View style={styles.mapWrap}>
        <MapboxMap
          accessToken={token}
          styleUrl={styleUrl}
          // Prefer manual center override, then search center, then user location, otherwise fit-to-points.
          center={mapCenter}
          zoom={mapZoom}
          points={filteredPoints}
          pointColor={pointBrown}
          userLocation={userLocation ? ([userLocation.lng, userLocation.lat] as const) : undefined}
          onApartmentPress={(id: string) => {
            router.push({ pathname: '/apartment/[id]', params: { id, returnTo: '/(tabs)/map' } });
          }}
        />

        {/* Floating actions */}
        {token ? (
          <View pointerEvents="box-none" style={[styles.floatingActions, { bottom: (insets.bottom || 0) + 12 + 86 + 16 }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="מרכז למיקום שלי"
              onPress={async () => {
                // Clear search centering and snap to current location.
                setSearchQuery('');
                setSearchCenter(null);
                const pos = await fetchUserLocation();
                if (pos) {
                  setCenterOverride(pos);
                  setZoomOverride(13);
                }
              }}
              activeOpacity={0.9}
              style={[styles.fabBtn, locating && { opacity: 0.7 }]}
            >
              <LocateFixed size={18} color="#111827" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Bottom results rail */}
        {token && !loadingPoints && !pointsError ? (
          <View pointerEvents="box-none" style={[styles.resultsWrap, { bottom: (insets.bottom || 0) + 12 }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.resultsContent}
              style={{ direction: 'rtl' as any }}
            >
              {results.length ? (
                results.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.92}
                    onPress={() => router.push({ pathname: '/apartment/[id]', params: { id: r.id, returnTo: '/(tabs)/map' } })}
                    style={styles.resultCard}
                    accessibilityRole="button"
                    accessibilityLabel={`פתח דירה: ${r.title}`}
                  >
                    <View style={styles.resultBody}>
                      <View style={styles.resultTopRow}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {r.title}
                        </Text>
                      </View>
                        {typeof r.availableSlots === 'number' ? (
                          <View style={styles.slotsRow}>
                            <View style={styles.slotsPill}>
                              <Text style={styles.slotsText}>{`${r.availableSlots} מקומות פנויים`}</Text>
                            </View>
                          </View>
                        ) : null}
                        <Text style={styles.resultMeta} numberOfLines={1}>
                          {r.city || r.address}
                        </Text>
                    </View>
                      <Image
                        source={{
                          uri:
                            r.imageCandidates[
                              Math.max(
                                0,
                                Math.min(
                                  resultImgCandidateIdxById[r.id] ?? 0,
                                  r.imageCandidates.length - 1
                                )
                              )
                            ],
                        }}
                        style={styles.resultImage}
                        resizeMode="cover"
                        onError={() => {
                          // Try next candidate (e.g., fall back from Supabase render URL to raw URL, then to placeholder)
                          setResultImgCandidateIdxById((prev) => {
                            const current = typeof prev[r.id] === 'number' ? prev[r.id] : 0;
                            const nextIdx = Math.min(current + 1, r.imageCandidates.length - 1);
                            if (nextIdx === current) return prev;
                            return { ...prev, [r.id]: nextIdx };
                          });
                        }}
                      />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyRail}>
                  <Text style={styles.emptyRailText}>אין תוצאות להצגה</Text>
                </View>
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* Search + filters overlay */}
      {token ? (
        <View pointerEvents="box-none" style={[styles.topOverlay, { top: (insets.top || 0) + 10 }]}>
          <View style={styles.searchRow}>
            <View style={[styles.searchContainer, { flex: 1 }]}>
              <Search size={20} color="#5e3f2d" style={styles.searchIcon} />
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

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={filtersOpen ? 'סגור סינון' : 'פתח סינון'}
              onPress={() => setFiltersOpen((v) => !v)}
              activeOpacity={0.9}
              style={styles.filterIconBtn}
            >
              <SlidersHorizontal size={18} color="#5e3f2d" />
            </TouchableOpacity>
          </View>

          {statusText ? (
            <View style={[styles.statusPill, statusTone === 'error' ? styles.statusPillError : styles.statusPillNeutral]}>
              {loadingPoints ? <ActivityIndicator color="#5e3f2d" /> : null}
              <Text
                style={[
                  styles.statusText,
                  statusTone === 'error' ? styles.statusTextError : styles.statusTextNeutral,
                ]}
              >
                {statusText}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Filters animated panel (reuses the KeyFabPanel animation) */}
      <KeyFabPanel
        isOpen={!!token && filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="סינון"
        subtitle="בחרו סינונים כדי לצמצם את הדירות המוצגות במפה"
        // Open from the top, right under the search/filter row.
        anchor="top"
        topOffset={(insets.top || 0) + 10 + 44 + 10}
      >
        <FilterChipsBar
          filters={filterChips}
          selectedIds={selectedChipIds}
          onChange={(next) => setChipSelected((next || []).filter((id) => id !== 'distance'))}
          onOpenDropdown={(chip) => {
            if (chip.id === 'distance') setDistancePickerOpen(true);
          }}
          inactiveBackgroundColor="#F3F4F6"
          inactiveBorderColor="#E5E7EB"
          activeBackgroundColor="#EFEAFE"
          activeBorderColor="rgba(76, 29, 149, 0.28)"
          style={{ marginTop: 8 }}
        />
      </KeyFabPanel>

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

      {/* Distance picker modal */}
      <Modal
        visible={distancePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDistancePickerOpen(false)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => setDistancePickerOpen(false)} style={styles.modalBackdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalCard}>
            <Text style={styles.modalTitle}>בחירת טווח</Text>
            {[
              { label: 'ללא סינון טווח', value: null as number | null },
              { label: 'עד 3 ק״מ', value: 3 },
              { label: 'עד 5 ק״מ', value: 5 },
              { label: 'עד 10 ק״מ', value: 10 },
              { label: 'עד 13 ק״מ', value: 13 },
            ].map((opt) => {
              const active = distanceKm === opt.value;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  activeOpacity={0.9}
                  onPress={() => {
                    setDistanceKm(opt.value);
                    setDistancePickerOpen(false);
                  }}
                  style={[styles.modalOption, active && styles.modalOptionActive]}
                >
                  <Text style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
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
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    // No border; rely on shadow to separate from map background
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
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
  statusPill: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.10)' } as any) : null),
  },
  statusPillNeutral: {
    backgroundColor: '#FFFFFF',
    borderColor: 'transparent',
  },
  statusPillError: {
    backgroundColor: '#FEF2F2',
    borderColor: 'rgba(153, 27, 27, 0.18)',
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    flex: 1,
  },
  statusTextNeutral: {
    color: '#5e3f2d',
  },
  statusTextError: {
    color: '#991B1B',
  },
  floatingActions: {
    position: 'absolute',
    right: 12,
    zIndex: 60,
  },
  fabBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  resultsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 55,
  },
  resultsContent: {
    paddingHorizontal: 12,
    gap: 10,
    alignItems: 'flex-end',
  },
  resultCard: {
    width: 250,
    height: 96,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.95)',
    // Use explicit LTR layout here and place the image as the last child,
    // so the image always sticks to the RIGHT even under RTL screens.
    flexDirection: 'row',
    direction: 'ltr' as any,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 18,
  },
  resultImage: {
    width: 86,
    height: '100%',
    backgroundColor: '#111827',
  },
  resultBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  resultTopRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  resultTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  slotsRow: {
    width: '100%',
    marginTop: 6,
    alignItems: 'flex-end',
  },
  slotsPill: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(94, 63, 45, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94, 63, 45, 0.18)',
  },
  slotsText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5e3f2d',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  resultMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyRail: {
    height: 86,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  emptyRailText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 10,
  },
  modalOption: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  modalOptionActive: {
    backgroundColor: '#EFEAFE',
    borderColor: '#E9D5FF',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  modalOptionTextActive: {
    color: '#4C1D95',
  },
});


