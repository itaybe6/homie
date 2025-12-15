import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxMap from '@/components/MapboxMap';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { geocodeApartmentAddress } from '@/lib/mapboxGeocoding';
import type { Apartment } from '@/types/database';
import type { MapboxFeatureCollection } from '@/lib/mapboxHtml';

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

  const [points, setPoints] = useState<MapboxFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [pointsError, setPointsError] = useState<string>('');

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

  const pointsCount = useMemo(() => points.features.length, [points.features.length]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeTop}>
      {/* Spacer under the absolute GlobalTopBar */}
      <View style={[styles.topBar, { paddingTop: 52, backgroundColor: '#FFFFFF' }]} />

      <View style={styles.mapWrap}>
        <MapboxMap
          accessToken={token}
          styleUrl={styleUrl}
          // Tel Aviv (lng, lat)
          center={[34.7818, 32.0853]}
          zoom={11}
          points={points}
          onApartmentPress={(id) => {
            router.push({ pathname: '/apartment/[id]', params: { id, returnTo: '/(tabs)/map' } });
          }}
        />
      </View>

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

      {token && !loadingPoints && !pointsError && pointsCount > 0 ? (
        <View pointerEvents="none" style={styles.countBadge}>
          <Text style={styles.countText}>{`מוצגות ${pointsCount} דירות`}</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  mapWrap: {
    flex: 1,
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


