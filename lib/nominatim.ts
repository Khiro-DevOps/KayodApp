const cache = new Map<string, unknown>();
let lastRequestAt = 0;

async function nominatim(path: string, key: string) {
  if (cache.has(key)) return cache.get(key);
  const wait = Math.max(0, 1000 - (Date.now() - lastRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  const response = await fetch(`https://nominatim.openstreetmap.org${path}`, {
    headers: { "User-Agent": "Kayod HR branch picker/1.0 (support@kayod.app)", Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`Geocoding provider returned ${response.status}`);
  const data: unknown = await response.json();
  cache.set(key, data);
  return data;
}

export function searchNominatim(query: string) {
  return nominatim(`/search?format=jsonv2&limit=5&countrycodes=ph&q=${encodeURIComponent(query)}`, `search:${query}`);
}

export function reverseNominatim(lat: number, lon: number) {
  const key = `reverse:${lat.toFixed(6)}:${lon.toFixed(6)}`;
  return nominatim(`/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, key);
}
