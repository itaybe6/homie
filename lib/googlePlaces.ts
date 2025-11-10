import 'react-native-url-polyfill/auto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace google {
    // minimal types we need
    namespace maps {
      namespace places {
        class AutocompleteService {
          getPlacePredictions(
            request: any,
            callback: (predictions: any[] | null, status: string) => void
          ): void;
        }
        class AutocompleteSessionToken {}
        class AutocompleteSuggestionService {
          getSuggestions(
            request: any,
            callback: (response: { suggestions: any[] } | null, status: string) => void
          ): void;
        }
      }
    }
  }
}

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY as string;

if (!GOOGLE_KEY) {
  // Soft warning in dev
  // eslint-disable-next-line no-console
  console.warn('EXPO_PUBLIC_GOOGLE_MAPS_KEY is not set. Google Places autocomplete will not work.');
}

export interface PlacePrediction {
  description: string;
  placeId: string;
  types?: string[];
}

let mapsJsPromise: Promise<void> | null = null;
let webSessionToken: any = null;

function isWeb(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function loadGoogleMapsJs(): Promise<void> {
  if (!isWeb()) return Promise.resolve();
  if (mapsJsPromise) return mapsJsPromise;
  mapsJsPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.maps?.places) {
      resolve();
      return;
    }
    if (!GOOGLE_KEY) {
      resolve();
      return;
    }
    const cbName = `__gmaps_cb_${Date.now().toString(36)}`;
    (window as any)[cbName] = () => {
      resolve();
      delete (window as any)[cbName];
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_KEY
    )}&libraries=places&v=weekly&language=he&region=IL&callback=${cbName}`;
    script.async = true;
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
  return mapsJsPromise;
}

function buildDescriptionFromSuggestion(s: any): string {
  const main = s?.structuredFormat?.mainText?.text || s?.structuredFormat?.mainText || '';
  const secondary = s?.structuredFormat?.secondaryText?.text || s?.structuredFormat?.secondaryText || '';
  if (main && secondary) return `${main}, ${secondary}`;
  return s?.placePrediction?.text?.text || s?.placePrediction?.text || s?.description || '';
}

export function createSessionToken(): string {
  // Simple RFC4122-ish token (not cryptographically strong)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function autocompleteCities(query: string, sessionToken?: string): Promise<PlacePrediction[]> {
  if (!query?.trim()) return [];
  if (isWeb()) {
    await loadGoogleMapsJs();
    // If maps failed to load (no key), return []
    const g = (window as any).google;
    if (!g?.maps?.places) return [];
    // Prefer new AutocompleteSuggestionService where available
    if (g.maps.places.AutocompleteSuggestionService) {
      const svc = new g.maps.places.AutocompleteSuggestionService();
      if (!webSessionToken) webSessionToken = new g.maps.places.AutocompleteSessionToken();
      return new Promise((resolve) => {
        svc.getSuggestions(
          {
            input: query,
            includedPrimaryTypes: ['locality'],
            language: 'he',
            region: 'IL',
            sessionToken: webSessionToken,
          },
          (resp: any) => {
            const list: any[] = resp?.suggestions || [];
            resolve(
              list.map((s: any) => ({
                description: buildDescriptionFromSuggestion(s),
                placeId: s?.placePrediction?.placeId || s?.placePrediction?.place_id || s?.place_id || '',
                types: s?.placePrediction?.types || s?.types,
              }))
            );
          }
        );
      });
    } else {
      const service = new g.maps.places.AutocompleteService();
      if (!webSessionToken) webSessionToken = new g.maps.places.AutocompleteSessionToken();
      return new Promise((resolve) => {
        service.getPlacePredictions(
          {
            input: query,
            types: ['(cities)'],
            componentRestrictions: { country: 'il' },
            sessionToken: webSessionToken,
          },
          (predictions: any[] | null) => {
            resolve(
              (predictions || []).map((p: any) => ({
                description: p.description,
                placeId: p.place_id,
                types: p.types,
              }))
            );
          }
        );
      });
    }
  }
  if (!GOOGLE_KEY) return [];
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', query);
  url.searchParams.set('components', 'country:il');
  url.searchParams.set('types', '(cities)');
  url.searchParams.set('language', 'he');
  if (sessionToken) url.searchParams.set('sessiontoken', sessionToken);
  url.searchParams.set('key', GOOGLE_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
  return (data.predictions || []).map((p: any) => ({
    description: p.description,
    placeId: p.place_id,
    types: p.types,
  }));
}

export async function getPlaceLocation(placeId: string): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_KEY || !placeId) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'geometry');
  url.searchParams.set('language', 'he');
  url.searchParams.set('key', GOOGLE_KEY);
  const res = await fetch(url.toString());
  const data = await res.json();
  const loc = data?.result?.geometry?.location;
  if (loc?.lat && loc?.lng) return { lat: loc.lat, lng: loc.lng };
  return null;
}

export async function autocompleteNeighborhoods(
  query: string,
  cityPlaceId?: string | null,
  sessionToken?: string,
  cityNameForFilter?: string,
): Promise<string[]> {
  if (!query?.trim()) return [];

  if (isWeb()) {
    await loadGoogleMapsJs();
    const g = (window as any).google;
    if (!g?.maps?.places) return [];
    if (g.maps.places.AutocompleteSuggestionService) {
      const svc = new g.maps.places.AutocompleteSuggestionService();
      if (!webSessionToken) webSessionToken = new g.maps.places.AutocompleteSessionToken();
      let origin: any = undefined;
      if (cityPlaceId) {
        const loc = await getPlaceLocation(cityPlaceId);
        if (loc) origin = new g.maps.LatLng(loc.lat, loc.lng);
      }
      return new Promise((resolve) => {
        const req: any = {
          input: query,
          includedPrimaryTypes: ['neighborhood', 'sublocality'],
          language: 'he',
          region: 'IL',
          sessionToken: webSessionToken,
        };
        if (origin) req.locationBias = { circle: { center: origin, radius: 30000 } };
        svc.getSuggestions(req, (resp: any) => {
          const arr: any[] = resp?.suggestions || [];
          const names = arr
            .filter((s: any) => {
              if (cityNameForFilter) return buildDescriptionFromSuggestion(s).includes(cityNameForFilter);
              return true;
            })
            .map((s: any) => s?.structuredFormat?.mainText?.text || s?.structuredFormat?.mainText || buildDescriptionFromSuggestion(s));
          resolve(names);
        });
      });
    } else {
      const service = new g.maps.places.AutocompleteService();
      if (!webSessionToken) webSessionToken = new g.maps.places.AutocompleteSessionToken();
      return new Promise((resolve) => {
        service.getPlacePredictions(
          {
            input: query,
            types: ['geocode'],
            componentRestrictions: { country: 'il' },
            sessionToken: webSessionToken,
          },
          (preds: any[] | null) => {
            const filtered = (preds || []).filter((p: any) => {
              const types: string[] = p.types || [];
              const isHood = types.includes('neighborhood') || types.some((t) => t.startsWith('sublocality'));
              if (!isHood) return false;
              if (cityNameForFilter) return String(p.description).includes(cityNameForFilter);
              return true;
            });
            resolve(filtered.map((p: any) => p.structured_formatting?.main_text || p.description));
          }
        );
      });
    }
  }

  let locationParams = '';
  if (cityPlaceId) {
    const loc = await getPlaceLocation(cityPlaceId);
    if (loc) {
      // Bias around city center (30km radius)
      locationParams = `&location=${loc.lat},${loc.lng}&radius=30000`;
    }
  }

  const base = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    query,
  )}&components=country:il&types=geocode&language=he${locationParams}`;
  const tokenPart = sessionToken ? `&sessiontoken=${encodeURIComponent(sessionToken)}` : '';
  const url = `${base}&key=${encodeURIComponent(GOOGLE_KEY)}${tokenPart}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

  const preds: any[] = data.predictions || [];
  const filtered = preds.filter((p) => {
    const types: string[] = p.types || [];
    const isHood = types.includes('neighborhood') || types.some((t) => t.startsWith('sublocality'));
    if (!isHood) return false;
    if (cityNameForFilter) {
      return String(p.description).includes(cityNameForFilter);
    }
    return true;
  });
  return filtered.map((p) => p.structured_formatting?.main_text || p.description);
}

export async function autocompleteAddresses(
  query: string,
  cityPlaceId?: string | null,
  sessionToken?: string,
  cityNameForFilter?: string,
): Promise<string[]> {
  if (!query?.trim()) return [];

  if (isWeb()) {
    await loadGoogleMapsJs();
    const g = (window as any).google;
    if (!g?.maps?.places) return [];
    if (g.maps.places.AutocompleteSuggestionService) {
      const svc = new g.maps.places.AutocompleteSuggestionService();
      if (!webSessionToken) webSessionToken = new g.maps.places.AutocompleteSessionToken();
      let origin: any = undefined;
      if (cityPlaceId) {
        const loc = await getPlaceLocation(cityPlaceId);
        if (loc) origin = new g.maps.LatLng(loc.lat, loc.lng);
      }
      return new Promise((resolve) => {
        const req: any = {
          input: query,
          includedPrimaryTypes: ['street_address', 'route', 'premise'],
          language: 'he',
          region: 'IL',
          sessionToken: webSessionToken,
        };
        if (origin) req.locationBias = { circle: { center: origin, radius: 30000 } };
        svc.getSuggestions(req, (resp: any) => {
          const arr: any[] = resp?.suggestions || [];
          resolve(arr.map((s: any) => buildDescriptionFromSuggestion(s)));
        });
      });
    } else {
      const service = new g.maps.places.AutocompleteService();
      if (!webSessionToken) webSessionToken = new g.maps.places.AutocompleteSessionToken();
      return new Promise((resolve) => {
        service.getPlacePredictions(
          {
            input: query,
            types: ['geocode'],
            componentRestrictions: { country: 'il' },
            sessionToken: webSessionToken,
          },
          (preds: any[] | null) => {
            const filtered = (preds || []).filter((p: any) => {
              const types: string[] = p.types || [];
              const isAddressLike = types.includes('street_address') || types.includes('premise') || types.includes('route') || types.includes('geocode');
              if (!isAddressLike) return false;
              if (cityNameForFilter) return String(p.description).includes(cityNameForFilter);
              return true;
            });
            resolve(filtered.map((p: any) => p.description));
          }
        );
      });
    }
  }

  let locationParams = '';
  if (cityPlaceId) {
    const loc = await getPlaceLocation(cityPlaceId);
    if (loc) {
      // Bias around city center (30km radius)
      locationParams = `&location=${loc.lat},${loc.lng}&radius=30000`;
    }
  }

  const base = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    query,
  )}&components=country:il&types=geocode&language=he${locationParams}`;
  const tokenPart = sessionToken ? `&sessiontoken=${encodeURIComponent(sessionToken)}` : '';
  const url = `${base}&key=${encodeURIComponent(GOOGLE_KEY)}${tokenPart}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

  const preds: any[] = data.predictions || [];
  const filtered = preds.filter((p) => {
    const types: string[] = p.types || [];
    const isAddressLike = types.includes('street_address') || types.includes('premise') || types.includes('route') || types.includes('geocode');
    if (!isAddressLike) return false;
    if (cityNameForFilter) {
      return String(p.description).includes(cityNameForFilter);
    }
    return true;
  });
  return filtered.map((p) => p.description);
}



