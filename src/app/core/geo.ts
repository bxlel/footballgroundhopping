import { GeoPoint } from './models';

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function isValidPoint(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Distance à vol d'oiseau, en kilomètres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point atteint en partant de `origin` sur `distanceKm` dans la direction `bearingDeg`. */
export function destination(origin: GeoPoint, distanceKm: number, bearingDeg: number): GeoPoint {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(origin.lat);
  const lambda1 = toRad(origin.lng);
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lat: toDeg(phi2), lng: ((toDeg(lambda2) + 540) % 360) - 180 };
}

/** Anneau fermé [lng, lat] approchant un cercle : sert à dessiner le rayon sur la carte. */
export function circleRing(center: GeoPoint, radiusKm: number, steps = 64): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const point = destination(center, radiusKm, (i * 360) / steps);
    ring.push([point.lng, point.lat]);
  }
  return ring;
}

/** Emprise [ouest, sud, est, nord] d'un cercle : sert à cadrer la carte sur la zone cherchée. */
export function circleBounds(center: GeoPoint, radiusKm: number): [number, number, number, number] {
  const north = destination(center, radiusKm, 0).lat;
  const south = destination(center, radiusKm, 180).lat;
  const east = destination(center, radiusKm, 90).lng;
  const west = destination(center, radiusKm, 270).lng;
  return [west, south, east, north];
}
