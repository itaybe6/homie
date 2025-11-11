// Fetch neighborhoods for a city using OpenStreetMap Overpass API (read-only public data)
// This is used as a fallback to provide a complete dropdown list per city

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function overpassQuery(body: string): Promise<OverpassElement[]> {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(body)}`,
  });
  const json = await res.json();
  return json.elements || [];
}

export async function fetchNeighborhoodsForCity(params: {
  lat: number;
  lng: number;
  radiusMeters?: number;
}): Promise<string[]> {
  const { lat, lng, radiusMeters = 20000 } = params;
  const query = `
    [out:json][timeout:90];
    (
      node(around:${radiusMeters},${lat},${lng})[place~"^(neighbourhood|suburb)$"];
      way(around:${radiusMeters},${lat},${lng})[place~"^(neighbourhood|suburb)$"];
      relation(around:${radiusMeters},${lat},${lng})[place~"^(neighbourhood|suburb)$"];
    );
    out body center tags;
  `;
  try {
    const elements = await overpassQuery(query);
    const names: string[] = [];
    for (const e of elements) {
      const t = e.tags || {};
      const he = t['name:he'];
      const name = he || t['name'];
      if (name) names.push(name);
    }
    // uniq + sort
    const uniq = Array.from(new Set(names.map((n) => n.trim()))).filter(Boolean);
    uniq.sort((a, b) => a.localeCompare(b, 'he'));
    return uniq;
  } catch {
    return [];
  }
}





