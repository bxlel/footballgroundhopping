// Géocodage OpenStreetMap/Nominatim, en dernier recours.
// Politique d'usage (vérifiée le 25/11/2026, operations.osmfoundation.org/policies/nominatim) :
//   - 1 requête/seconde au maximum, et 4/minute pour un script récurrent ;
//   - User-Agent identifiant l'application ;
//   - pas d'autocomplétion ;
//   - résultats mis en cache de notre côté.
// L'adresse du service est configurable (GEOCODER_URL) pour passer à une instance
// auto-hébergée ou à un fournisseur commercial compatible sans toucher au code.

import { haversineKm, isValidPoint } from './geo.mjs';
import { MAX_KM_FROM_CITY } from './wikidata.mjs';

export const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org';
export const MIN_INTERVAL_MS = 1100;

const STADIUM_TYPES = { stadium: 0.75, pitch: 0.6, sports_centre: 0.6 };

export async function nominatimSearch(
  query,
  { fetch = globalThis.fetch, userAgent, baseUrl, limit = 3 },
) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(limit),
    'accept-language': 'fr',
  });
  const res = await fetch(
    `${(baseUrl || DEFAULT_GEOCODER_URL).replace(/\/+$/, '')}/search?${params}`,
    {
      headers: { 'User-Agent': userAgent },
    },
  );
  if (!res.ok) throw new Error(`Le géocodeur a répondu ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

function toPoint(result) {
  return { lat: Number(result?.lat), lng: Number(result?.lon) };
}

/**
 * Parmi les résultats, garde le premier qui est bien une enceinte sportive,
 * à une distance plausible de la ville attendue.
 */
export function pickStadium(results, cityPoint) {
  for (const result of results) {
    const confidence =
      result.category === 'leisure' || result.category === 'building'
        ? STADIUM_TYPES[result.type]
        : undefined;
    const point = toPoint(result);
    if (!confidence || !isValidPoint(point)) continue;
    if (isValidPoint(cityPoint) && haversineKm(cityPoint, point) > MAX_KM_FROM_CITY) continue;
    return { ...point, confidence };
  }
  return null;
}

/** Premier résultat utilisable pour une adresse saisie par un visiteur. */
export function pickAddress(results) {
  for (const result of results) {
    const point = toPoint(result);
    if (!isValidPoint(point)) continue;
    const [name, ...rest] = String(result.display_name ?? '').split(', ');
    return { kind: 'address', name: result.name || name, detail: rest.join(', '), ...point };
  }
  return null;
}
