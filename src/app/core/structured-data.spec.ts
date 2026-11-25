import { serializeJsonLd, sportsEventJsonLd } from './structured-data';
import { makeFixture, makeVenue } from './testing/fixtures';

describe('sportsEventJsonLd', () => {
  const SITE = 'https://spotthegame.app';

  it('décrit un match complet', () => {
    expect(sportsEventJsonLd(makeFixture(), SITE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: 'Lens – Lille',
      description: 'Ligue 1',
      sport: 'Football',
      startDate: '2026-03-14T19:45:00Z',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: 'https://spotthegame.app/matchs/2026-03-14-lens-lille',
      homeTeam: { '@type': 'SportsTeam', name: 'Lens', url: 'https://spotthegame.app/clubs/lens' },
      awayTeam: {
        '@type': 'SportsTeam',
        name: 'Lille',
        url: 'https://spotthegame.app/clubs/lille',
      },
      competitor: [
        { '@type': 'SportsTeam', name: 'Lens', url: 'https://spotthegame.app/clubs/lens' },
        { '@type': 'SportsTeam', name: 'Lille', url: 'https://spotthegame.app/clubs/lille' },
      ],
      location: {
        '@type': 'StadiumOrArena',
        name: 'Stade Bollaert-Delelis',
        url: 'https://spotthegame.app/stades/stade-bollaert-delelis-lens',
        address: { '@type': 'PostalAddress', addressLocality: 'Lens', addressCountry: 'France' },
        geo: { '@type': 'GeoCoordinates', latitude: 50.4328, longitude: 2.8149 },
      },
    });
  });

  it('ne publie que la date locale quand l’horaire n’est pas confirmé', () => {
    const fixture = makeFixture({
      kickoffAt: '2026-03-14T23:30:00Z',
      timeConfirmed: false,
    });
    expect(sportsEventJsonLd(fixture, SITE)['startDate']).toBe('2026-03-15');
  });

  it('signale un match reporté ou annulé', () => {
    expect(sportsEventJsonLd(makeFixture({ status: 'postponed' }), SITE)['eventStatus']).toBe(
      'https://schema.org/EventPostponed',
    );
    expect(sportsEventJsonLd(makeFixture({ status: 'cancelled' }), SITE)['eventStatus']).toBe(
      'https://schema.org/EventCancelled',
    );
  });

  it('omet le lieu inconnu et les coordonnées approximatives', () => {
    expect(sportsEventJsonLd(makeFixture({ venue: null }), SITE)['location']).toBeUndefined();
    const approx = sportsEventJsonLd(
      makeFixture({ venue: makeVenue({ approximate: true, country: null }) }),
      SITE,
    )['location'] as Record<string, unknown>;
    expect(approx['geo']).toBeUndefined();
    expect(approx['address']).toEqual({ '@type': 'PostalAddress', addressLocality: 'Lens' });
  });

  it('neutralise les chevrons dans le JSON sérialisé', () => {
    expect(serializeJsonLd({ name: '</script><script>alert(1)' })).not.toContain('<');
  });
});
