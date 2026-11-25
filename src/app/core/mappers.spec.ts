import {
  toFixtureCard,
  toFixtureCards,
  toPlace,
  toPlaces,
  toTeamPage,
  toVenuePage,
} from './mappers';

const ROW = {
  id: 7,
  slug: '2026-03-14-lens-lille',
  kickoff_at: '2026-03-14T20:45:00+01:00',
  time_confirmed: true,
  status: 'scheduled',
  competition_name: 'Ligue 1',
  competition_country: 'France',
  competition_level: 'top',
  home_name: 'Lens',
  home_slug: 'lens',
  home_logo_url: 'https://media.example/116.png',
  away_name: 'Lille',
  away_slug: 'lille',
  away_logo_url: null,
  venue_name: 'Stade Bollaert-Delelis',
  venue_slug: 'stade-bollaert-delelis-lens',
  venue_city: 'Lens',
  venue_country: 'France',
  venue_lat: 50.4328,
  venue_lng: 2.8149,
  venue_timezone: 'Europe/Paris',
  venue_approximate: false,
  distance_km: 12.34,
  going_count: 7,
};

describe('mappers', () => {
  it('transforme une ligne de match complète', () => {
    expect(toFixtureCard(ROW)).toEqual({
      id: 7,
      slug: '2026-03-14-lens-lille',
      kickoffAt: '2026-03-14T19:45:00.000Z',
      timeConfirmed: true,
      status: 'scheduled',
      home: { name: 'Lens', slug: 'lens', logoUrl: 'https://media.example/116.png' },
      away: { name: 'Lille', slug: 'lille', logoUrl: null },
      competition: { name: 'Ligue 1', country: 'France', level: 'top' },
      venue: {
        name: 'Stade Bollaert-Delelis',
        slug: 'stade-bollaert-delelis-lens',
        city: 'Lens',
        country: 'France',
        position: { lat: 50.4328, lng: 2.8149 },
        timezone: 'Europe/Paris',
        approximate: false,
      },
      distanceKm: 12.34,
      goingCount: 7,
    });
  });

  it('accepte un match sans stade, ou avec un stade sans coordonnées', () => {
    const noVenue = toFixtureCard({ ...ROW, venue_name: null, venue_slug: null });
    expect(noVenue?.venue).toBeNull();

    const noCoords = toFixtureCard({ ...ROW, venue_lat: null, venue_lng: null });
    expect(noCoords?.venue?.position).toBeNull();
    expect(noCoords?.venue?.name).toBe('Stade Bollaert-Delelis');
  });

  it('remplace les valeurs inconnues par des valeurs sûres', () => {
    const card = toFixtureCard({
      ...ROW,
      status: 'bizarre',
      competition_level: 'galactique',
      distance_km: undefined,
      time_confirmed: false,
      venue_approximate: true,
    });
    expect(card?.status).toBe('scheduled');
    expect(card?.competition.level).toBe('other');
    expect(card?.distanceKm).toBeNull();
    expect(toFixtureCard({ ...ROW, going_count: undefined })?.goingCount).toBe(0);
    expect(toFixtureCard({ ...ROW, going_count: -3 })?.goingCount).toBe(0);
    expect(card?.timeConfirmed).toBeFalse();
    expect(card?.venue?.approximate).toBeTrue();
  });

  it('écarte les lignes inutilisables', () => {
    expect(toFixtureCard({})).toBeNull();
    expect(toFixtureCard({ ...ROW, kickoff_at: 'demain' })).toBeNull();
    expect(toFixtureCard({ ...ROW, home_name: '' })).toBeNull();
    expect(toFixtureCards([ROW, {}, null]).length).toBe(1);
    expect(toFixtureCards({ message: 'erreur' })).toEqual([]);
  });

  it('transforme une fiche stade', () => {
    expect(
      toVenuePage({
        slug: 'anfield-liverpool',
        name: 'Anfield',
        city: 'Liverpool',
        country: 'England',
        address: 'Anfield Road',
        capacity: 61276,
        surface: 'grass',
        lat: 53.4308,
        lng: -2.9608,
        timezone: 'Europe/London',
        approximate: false,
      }),
    ).toEqual({
      name: 'Anfield',
      slug: 'anfield-liverpool',
      city: 'Liverpool',
      country: 'England',
      position: { lat: 53.4308, lng: -2.9608 },
      timezone: 'Europe/London',
      approximate: false,
      address: 'Anfield Road',
      capacity: 61276,
      surface: 'grass',
    });
    expect(toVenuePage({ name: 'Sans slug' })).toBeNull();
  });

  it('transforme une fiche club, avec ou sans stade', () => {
    expect(
      toTeamPage({
        slug: 'lens',
        name: 'Lens',
        country: 'France',
        logo_url: null,
        venue_name: 'Stade Bollaert-Delelis',
        venue_slug: 'stade-bollaert-delelis-lens',
        venue_city: 'Lens',
      }),
    ).toEqual({
      name: 'Lens',
      slug: 'lens',
      logoUrl: null,
      country: 'France',
      venue: { name: 'Stade Bollaert-Delelis', slug: 'stade-bollaert-delelis-lens', city: 'Lens' },
    });
    expect(toTeamPage({ slug: 'x', name: 'X' })?.venue).toBeNull();
    expect(toTeamPage({})).toBeNull();
  });

  it('transforme les suggestions de lieux', () => {
    expect(
      toPlace({ kind: 'venue', name: 'Anfield', detail: 'Liverpool', lat: 53.43, lng: -2.96 }),
    ).toEqual({
      kind: 'venue',
      name: 'Anfield',
      detail: 'Liverpool',
      lat: 53.43,
      lng: -2.96,
    });
    expect(toPlace({ name: 'Lens', lat: 50.43, lng: 2.83 })?.kind).toBe('city');
    expect(toPlace({ name: 'Nulle part', lat: 999, lng: 0 })).toBeNull();
    expect(toPlaces([{ name: 'Lens', lat: 50.43, lng: 2.83 }, {}, null]).length).toBe(1);
    expect(toPlaces(null)).toEqual([]);
  });
});
