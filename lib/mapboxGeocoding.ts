import AsyncStorage from '@react-native-async-storage/async-storage';

type GeocodeResult = { lng: number; lat: number };

const CACHE_PREFIX = 'mapbox_geocode_v1:';
const TEXT_CACHE_PREFIX = 'mapbox_geocode_text_v1:';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function cacheKey(address: string, city: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(`${address}|||${city}`)}`;
}

function cacheKeyText(query: string): string {
  return `${TEXT_CACHE_PREFIX}${encodeURIComponent(query)}`;
}

async function readCache(address: string, city: string): Promise<GeocodeResult | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(address, city));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lng: number; lat: number; ts: number };
    if (!parsed || typeof parsed.lng !== 'number' || typeof parsed.lat !== 'number') return null;
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return { lng: parsed.lng, lat: parsed.lat };
  } catch {
    return null;
  }
}

async function readTextCache(query: string): Promise<GeocodeResult | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKeyText(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lng: number; lat: number; ts: number };
    if (!parsed || typeof parsed.lng !== 'number' || typeof parsed.lat !== 'number') return null;
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return { lng: parsed.lng, lat: parsed.lat };
  } catch {
    return null;
  }
}

async function writeCache(address: string, city: string, value: GeocodeResult): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKey(address, city),
      JSON.stringify({ ...value, ts: Date.now() })
    );
  } catch {
    // ignore
  }
}

async function writeTextCache(query: string, value: GeocodeResult): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKeyText(query),
      JSON.stringify({ ...value, ts: Date.now() })
    );
  } catch {
    // ignore
  }
}

export async function geocodeApartmentAddress(params: {
  accessToken: string;
  address: string;
  city: string;
  country?: string;
}): Promise<GeocodeResult | null> {
  const token = params.accessToken;
  const address = (params.address || '').trim();
  const city = (params.city || '').trim();
  const country = params.country ?? 'il';

  if (!token || !address || !city) return null;

  const cached = await readCache(address, city);
  if (cached) return cached;

  const query = `${address}, ${city}`;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(query)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&limit=1` +
    `&language=he` +
    `&country=${encodeURIComponent(country)}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const feature = json?.features?.[0];
    const center = feature?.center;
    if (!Array.isArray(center) || center.length < 2) return null;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const result = { lng, lat };
    await writeCache(address, city, result);
    return result;
  } catch {
    return null;
  }
}

export async function geocodePlace(params: {
  accessToken: string;
  query: string;
  country?: string;
}): Promise<GeocodeResult | null> {
  const token = params.accessToken;
  const query = (params.query || '').trim();
  const country = params.country ?? 'il';

  if (!token || !query) return null;

  const cached = await readTextCache(query);
  if (cached) return cached;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(query)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&limit=1` +
    `&language=he` +
    `&country=${encodeURIComponent(country)}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const feature = json?.features?.[0];
    const center = feature?.center;
    if (!Array.isArray(center) || center.length < 2) return null;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const result = { lng, lat };
    await writeTextCache(query, result);
    return result;
  } catch {
    return null;
  }
}


