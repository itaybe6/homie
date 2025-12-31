export type MapboxGeocodingContextItem = {
  id: string;
  text: string;
  short_code?: string;
};

export type MapboxGeocodingFeature = {
  id: string;
  text: string;
  place_name: string;
  place_type: string[];
  center: [number, number];
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  address?: string;
  context?: MapboxGeocodingContextItem[];
};

export async function autocompleteMapbox(params: {
  accessToken: string;
  query: string;
  country?: string;
  language?: string;
  limit?: number;
  types?: string; // comma-separated, e.g. "address,place,neighborhood"
  bbox?: [number, number, number, number]; // restrict results
  proximity?: { lng: number; lat: number }; // bias results
}): Promise<MapboxGeocodingFeature[]> {
  const token = (params.accessToken || '').trim();
  const query = (params.query || '').trim();
  const country = (params.country || 'il').trim();
  const language = (params.language || 'he').trim();
  const limit = typeof params.limit === 'number' ? Math.max(1, Math.min(10, params.limit)) : 6;
  const types = (params.types || '').trim();
  const bbox = params.bbox;
  const proximity = params.proximity;

  if (!token || !query) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(query)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&autocomplete=true` +
    `&limit=${encodeURIComponent(String(limit))}` +
    `&language=${encodeURIComponent(language)}` +
    `&country=${encodeURIComponent(country)}` +
    `&fuzzyMatch=true` +
    (types ? `&types=${encodeURIComponent(types)}` : '') +
    (Array.isArray(bbox) && bbox.length === 4 ? `&bbox=${encodeURIComponent(bbox.join(','))}` : '') +
    (proximity && Number.isFinite(proximity.lng) && Number.isFinite(proximity.lat)
      ? `&proximity=${encodeURIComponent(`${proximity.lng},${proximity.lat}`)}`
      : '');

  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const features = (json?.features || []) as any[];
    return features
      .map((f) => {
        const id = String(f?.id || '').trim();
        const text = String(f?.text || '').trim();
        const place_name = String(f?.place_name || '').trim();
        const place_type = Array.isArray(f?.place_type) ? (f.place_type as string[]) : [];
        const center = Array.isArray(f?.center) ? f.center : null;
        if (!id || !text || !place_name || !Array.isArray(center) || center.length < 2) return null;
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

        const bboxRaw = Array.isArray(f?.bbox) ? (f.bbox as any[]) : null;
        const bboxParsed =
          bboxRaw && bboxRaw.length === 4
            ? ([Number(bboxRaw[0]), Number(bboxRaw[1]), Number(bboxRaw[2]), Number(bboxRaw[3])] as const)
            : null;
        const bboxFinal =
          bboxParsed && bboxParsed.every((n) => Number.isFinite(n))
            ? ([bboxParsed[0], bboxParsed[1], bboxParsed[2], bboxParsed[3]] as [number, number, number, number])
            : undefined;

        const context = Array.isArray(f?.context)
          ? (f.context as any[])
              .map((c) => {
                const cid = String(c?.id || '').trim();
                const ctext = String(c?.text || '').trim();
                const short_code = typeof c?.short_code === 'string' ? c.short_code : undefined;
                if (!cid || !ctext) return null;
                return { id: cid, text: ctext, short_code } as MapboxGeocodingContextItem;
              })
              .filter(Boolean)
          : undefined;

        const address = typeof f?.address === 'string' ? f.address : undefined;
        return {
          id,
          text,
          place_name,
          place_type,
          center: [lng, lat],
          bbox: bboxFinal,
          address,
          context,
        } as MapboxGeocodingFeature;
      })
      .filter(Boolean) as MapboxGeocodingFeature[];
  } catch {
    return [];
  }
}

export async function reverseGeocodeMapbox(params: {
  accessToken: string;
  lng: number;
  lat: number;
  country?: string;
  language?: string;
  limit?: number;
  types?: string; // comma-separated
}): Promise<MapboxGeocodingFeature[]> {
  const token = (params.accessToken || '').trim();
  const lng = Number(params.lng);
  const lat = Number(params.lat);
  const country = (params.country || 'il').trim();
  const language = (params.language || 'he').trim();
  const limit = typeof params.limit === 'number' ? Math.max(1, Math.min(10, params.limit)) : 3;
  const types = (params.types || '').trim();

  if (!token || !Number.isFinite(lng) || !Number.isFinite(lat)) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(`${lng},${lat}`)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&limit=${encodeURIComponent(String(limit))}` +
    `&language=${encodeURIComponent(language)}` +
    `&country=${encodeURIComponent(country)}` +
    (types ? `&types=${encodeURIComponent(types)}` : '');

  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const features = (json?.features || []) as any[];
    // Reuse the same normalization logic by mapping a subset inline (keep it simple)
    return features
      .map((f) => {
        const id = String(f?.id || '').trim();
        const text = String(f?.text || '').trim();
        const place_name = String(f?.place_name || '').trim();
        const place_type = Array.isArray(f?.place_type) ? (f.place_type as string[]) : [];
        const center = Array.isArray(f?.center) ? f.center : null;
        if (!id || !text || !place_name || !Array.isArray(center) || center.length < 2) return null;
        const lng2 = Number(center[0]);
        const lat2 = Number(center[1]);
        if (!Number.isFinite(lng2) || !Number.isFinite(lat2)) return null;

        const context = Array.isArray(f?.context)
          ? (f.context as any[])
              .map((c) => {
                const cid = String(c?.id || '').trim();
                const ctext = String(c?.text || '').trim();
                const short_code = typeof c?.short_code === 'string' ? c.short_code : undefined;
                if (!cid || !ctext) return null;
                return { id: cid, text: ctext, short_code } as MapboxGeocodingContextItem;
              })
              .filter(Boolean)
          : undefined;

        const address = typeof f?.address === 'string' ? f.address : undefined;
        return {
          id,
          text,
          place_name,
          place_type,
          center: [lng2, lat2],
          address,
          context,
        } as MapboxGeocodingFeature;
      })
      .filter(Boolean) as MapboxGeocodingFeature[];
  } catch {
    return [];
  }
}


