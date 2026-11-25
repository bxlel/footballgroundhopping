/** Niveau de compétition, tel que stocké dans `competitions.level`. */
export type Level = 'top' | 'lower' | 'cup' | 'women' | 'youth' | 'other';

/** Créneaux proposés dans les filtres. */
export type Slot = 'evening' | 'daytime' | 'weekend';

export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TeamRef {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface VenueRef {
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  /** `null` tant que le stade n'a pas de coordonnées. */
  position: GeoPoint | null;
  /** Fuseau IANA du stade ; `null` tant qu'il n'a pas pu être déterminé. */
  timezone: string | null;
  /** Vrai quand les coordonnées sont celles du centre-ville, faute de mieux. */
  approximate: boolean;
}

export interface CompetitionRef {
  name: string;
  country: string | null;
  level: Level;
}

/** Un match prêt à afficher, dans une liste ou sur sa page. */
export interface FixtureCard {
  id: number;
  slug: string;
  /** Coup d'envoi, ISO 8601 en UTC. */
  kickoffAt: string;
  timeConfirmed: boolean;
  status: FixtureStatus;
  home: TeamRef;
  away: TeamRef;
  competition: CompetitionRef;
  /** `null` quand le stade n'est pas encore annoncé. */
  venue: VenueRef | null;
  /** Distance depuis le point de départ ; `null` hors recherche. */
  distanceKm: number | null;
  /** Nombre de personnes qui ont indiqué « J'y vais ». */
  goingCount: number;
}

export interface VenuePage extends VenueRef {
  address: string | null;
  capacity: number | null;
  surface: string | null;
}

export interface TeamPage extends TeamRef {
  country: string | null;
  venue: { name: string; slug: string; city: string | null } | null;
}

/** Suggestion du champ « Où ? ». */
export interface Place extends GeoPoint {
  kind: 'city' | 'venue' | 'address';
  name: string;
  /** Région et pays, pour départager les homonymes. */
  detail: string;
}

/** Une période en dates calendaires (AAAA-MM-JJ), bornes incluses. */
export interface Period {
  from: string;
  to: string;
}

/** Une recherche du mode Voyage. */
export interface TripQuery extends Period {
  origin: GeoPoint;
  /** Nom affiché du point de départ (« Lens », « Ma position »…). */
  label: string;
  radiusKm: number;
}

export interface TripFilters {
  slots: readonly Slot[];
  levels: readonly Level[];
  countries: readonly string[];
}

export const EMPTY_FILTERS: TripFilters = { slots: [], levels: [], countries: [] };
