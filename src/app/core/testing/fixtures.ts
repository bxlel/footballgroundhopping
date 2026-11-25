import { FixtureCard, VenueRef } from '../models';

/** Fabriques pour les tests : seuls les champs utiles au test sont à préciser. */
export function makeVenue(overrides: Partial<VenueRef> = {}): VenueRef {
  return {
    name: 'Stade Bollaert-Delelis',
    slug: 'stade-bollaert-delelis-lens',
    city: 'Lens',
    country: 'France',
    position: { lat: 50.4328, lng: 2.8149 },
    timezone: 'Europe/Paris',
    approximate: false,
    ...overrides,
  };
}

export function makeFixture(overrides: Partial<FixtureCard> = {}): FixtureCard {
  return {
    id: 1,
    slug: '2026-03-14-lens-lille',
    kickoffAt: '2026-03-14T19:45:00Z',
    timeConfirmed: true,
    status: 'scheduled',
    home: { name: 'Lens', slug: 'lens', logoUrl: null },
    away: { name: 'Lille', slug: 'lille', logoUrl: null },
    competition: { name: 'Ligue 1', country: 'France', level: 'top' },
    venue: makeVenue(),
    distanceKm: 12,
    goingCount: 0,
    ...overrides,
  };
}
