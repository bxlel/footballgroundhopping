import { isValidPoint } from './geo';
import { TripQuery, VenueRef } from './models';
import { normalizePeriod } from './period';

/** Rayons proposés, en kilomètres. Toute autre valeur dans une URL est ramenée au plus proche. */
export const RADIUS_OPTIONS: readonly number[] = [10, 25, 50, 100, 200];
export const DEFAULT_RADIUS_KM = 50;

export const ROUTES = {
  trip: 'voyage',
  match: 'matchs',
  venue: 'stades',
  team: 'clubs',
} as const;

export const matchLink = (slug: string): string[] => ['/', ROUTES.match, slug];
export const venueLink = (slug: string): string[] => ['/', ROUTES.venue, slug];
export const teamLink = (slug: string): string[] => ['/', ROUTES.team, slug];

export const matchPath = (slug: string): string => `/${ROUTES.match}/${slug}`;
export const venuePath = (slug: string): string => `/${ROUTES.venue}/${slug}`;
export const teamPath = (slug: string): string => `/${ROUTES.team}/${slug}`;

/** URL absolue à partir de l'origine du site, sans double barre oblique. */
export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function nearestRadius(value: number): number {
  return RADIUS_OPTIONS.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  );
}

/** Paramètres d'URL d'une recherche : courts, lisibles et en français. */
export function tripQueryParams(query: TripQuery): Record<string, string> {
  return {
    lieu: query.label,
    lat: query.origin.lat.toFixed(4),
    lng: query.origin.lng.toFixed(4),
    du: query.from,
    au: query.to,
    rayon: String(query.radiusKm),
  };
}

type RawParams = Readonly<Record<string, unknown>>;

/**
 * Reconstruit une recherche depuis l'URL. Rend `null` sans coordonnées valides ;
 * les dates et le rayon sont corrigés plutôt que refusés, pour qu'un vieux lien reste utilisable.
 */
export function parseTripQuery(params: RawParams, today: string): TripQuery | null {
  const lat = toNumber(params['lat']);
  const lng = toNumber(params['lng']);
  if (lat === null || lng === null || !isValidPoint(lat, lng)) return null;

  const radius = toNumber(params['rayon']);
  const label = typeof params['lieu'] === 'string' ? params['lieu'].trim().slice(0, 80) : '';
  return {
    origin: { lat, lng },
    label,
    ...normalizePeriod(params['du'], params['au'], today),
    radiusKm: radius === null || radius <= 0 ? DEFAULT_RADIUS_KM : nearestRadius(radius),
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type DirectionsProvider = 'google' | 'apple';

type DirectionsTarget = Pick<VenueRef, 'name' | 'city' | 'position' | 'approximate'>;

/**
 * Lien d'itinéraire vers le stade. Avec des coordonnées fiables on vise le point exact ;
 * sinon on laisse l'appli de cartes chercher le stade par son nom.
 */
export function directionsUrl(provider: DirectionsProvider, venue: DirectionsTarget): string {
  const byName = [venue.name, venue.city].filter(Boolean).join(', ');
  const point = venue.approximate ? null : venue.position;
  const target = point ? `${point.lat},${point.lng}` : byName;
  const encoded = encodeURIComponent(target);
  return provider === 'apple'
    ? `https://maps.apple.com/?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
