// Types et utilitaires géo

export type GeoPoint = { lat: number; lng: number };

export function haversineKm(a: GeoPoint, b: GeoPoint) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function part(x?: string) { return (x ?? '').toString().trim(); }

/**
 * Construit une requête de géocodage pertinente même si m.city est vide.
 * Ordre :
 *  - stade + ville + pays
 *  - stade + pays
 *  - équipe domicile + pays
 *  - ville + pays
 *  - pays
 */
export function geocodeQueryForMatch(m: {
  stadium?: string; city?: string; country?: string; home?: string; away?: string;
}) {
  const C = part(m.country);
  const V = part(m.city);
  const S = part(m.stadium);
  const H = part(m.home);
  const A = part(m.away);

  if (S && V && C) return `${S}, ${V}, ${C}`;
  if (S && C)       return `${S}, ${C}`;
  if (H && C)       return `${H}, ${C}`;
  if (V && C)       return `${V}, ${C}`;
  if (C)            return C;

  return [S, V, H, A, C].filter(Boolean).join(', ');
}
