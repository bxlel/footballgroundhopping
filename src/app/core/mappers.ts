import { isValidPoint } from './geo';
import {
  FixtureCard,
  FixtureStatus,
  GeoPoint,
  Level,
  Place,
  TeamPage,
  VenuePage,
  VenueRef,
} from './models';

/** Ligne brute renvoyée par PostgREST : on ne fait confiance à aucun champ. */
export type Row = Readonly<Record<string, unknown>>;

const LEVELS: readonly Level[] = ['top', 'lower', 'cup', 'women', 'youth', 'other'];
const STATUSES: readonly FixtureStatus[] = [
  'scheduled',
  'live',
  'finished',
  'postponed',
  'cancelled',
];

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function point(lat: unknown, lng: unknown): GeoPoint | null {
  return isValidPoint(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

function venueRef(row: Row, prefix: string): VenueRef | null {
  const name = text(row[`${prefix}name`]);
  const slug = text(row[`${prefix}slug`]);
  if (!name || !slug) return null;
  return {
    name,
    slug,
    city: text(row[`${prefix}city`]),
    country: text(row[`${prefix}country`]),
    position: point(row[`${prefix}lat`], row[`${prefix}lng`]),
    timezone: text(row[`${prefix}timezone`]),
    approximate: row[`${prefix}approximate`] === true,
  };
}

/** Ligne de `fixture_cards` ou de `search_fixtures` -> match affichable ; `null` si elle est inutilisable. */
export function toFixtureCard(row: Row): FixtureCard | null {
  const id = num(row['id']);
  const slug = text(row['slug']);
  const kickoffAt = text(row['kickoff_at']);
  const homeName = text(row['home_name']);
  const awayName = text(row['away_name']);
  const homeSlug = text(row['home_slug']);
  const awaySlug = text(row['away_slug']);
  if (id === null || !slug || !kickoffAt || Number.isNaN(Date.parse(kickoffAt))) return null;
  if (!homeName || !awayName || !homeSlug || !awaySlug) return null;

  const level = row['competition_level'] as Level;
  const status = row['status'] as FixtureStatus;
  return {
    id,
    slug,
    kickoffAt: new Date(kickoffAt).toISOString(),
    timeConfirmed: row['time_confirmed'] !== false,
    status: STATUSES.includes(status) ? status : 'scheduled',
    home: { name: homeName, slug: homeSlug, logoUrl: text(row['home_logo_url']) },
    away: { name: awayName, slug: awaySlug, logoUrl: text(row['away_logo_url']) },
    competition: {
      name: text(row['competition_name']) ?? '',
      country: text(row['competition_country']),
      level: LEVELS.includes(level) ? level : 'other',
    },
    venue: venueRef(row, 'venue_'),
    distanceKm: num(row['distance_km']),
    goingCount: Math.max(0, Math.trunc(num(row['going_count']) ?? 0)),
  };
}

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null;

export function toFixtureCards(rows: unknown): FixtureCard[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isRow)
    .map(toFixtureCard)
    .filter((card): card is FixtureCard => card !== null);
}

/** Ligne de `venue_pages` -> fiche stade. */
export function toVenuePage(row: Row): VenuePage | null {
  const ref = venueRef(row, '');
  if (!ref) return null;
  return {
    ...ref,
    address: text(row['address']),
    capacity: num(row['capacity']),
    surface: text(row['surface']),
  };
}

/** Ligne de `team_pages` -> fiche club. */
export function toTeamPage(row: Row): TeamPage | null {
  const name = text(row['name']);
  const slug = text(row['slug']);
  if (!name || !slug) return null;
  const venueName = text(row['venue_name']);
  const venueSlug = text(row['venue_slug']);
  return {
    name,
    slug,
    logoUrl: text(row['logo_url']),
    country: text(row['country']),
    venue:
      venueName && venueSlug
        ? { name: venueName, slug: venueSlug, city: text(row['venue_city']) }
        : null,
  };
}

/** Ligne de `search_places` ou réponse du géocodeur -> suggestion de lieu. */
export function toPlace(row: Row): Place | null {
  const name = text(row['name']);
  const position = point(row['lat'], row['lng']);
  if (!name || !position) return null;
  const kind = row['kind'];
  return {
    kind: kind === 'venue' || kind === 'address' ? kind : 'city',
    name,
    detail: text(row['detail']) ?? '',
    ...position,
  };
}

export function toPlaces(rows: unknown): Place[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isRow)
    .map(toPlace)
    .filter((place): place is Place => place !== null);
}
