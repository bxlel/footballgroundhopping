import { fixtureIcs } from './calendar';
import { makeFixture, makeVenue } from './testing/fixtures';

describe('fixtureIcs', () => {
  const SITE = 'https://spotthegame.app';
  const NOW = new Date('2026-03-01T08:00:00Z');
  const lines = (ics: string) => ics.trimEnd().split('\r\n');

  it('décrit un match à l’horaire confirmé', () => {
    expect(lines(fixtureIcs(makeFixture(), SITE, NOW))).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Spot the Game//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:2026-03-14-lens-lille@spotthegame',
      'DTSTAMP:20260301T080000Z',
      'DTSTART:20260314T194500Z',
      'DTEND:20260314T214500Z',
      'SUMMARY:Lens – Lille',
      'LOCATION:Stade Bollaert-Delelis\\, Lens',
      'GEO:50.4328;2.8149',
      'DESCRIPTION:Ligue 1\\nhttps://spotthegame.app/matchs/2026-03-14-lens-lille',
      'URL:https://spotthegame.app/matchs/2026-03-14-lens-lille',
      'END:VEVENT',
      'END:VCALENDAR',
    ]);
  });

  it('en fait une journée entière, à la date locale, quand l’horaire n’est pas confirmé', () => {
    const ics = fixtureIcs(
      makeFixture({ kickoffAt: '2026-03-14T23:30:00Z', timeConfirmed: false }),
      SITE,
      NOW,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20260315\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260316\r\n');
    expect(ics).not.toContain('DTSTART:2026');
  });

  it('omet le lieu inconnu et les coordonnées approximatives', () => {
    expect(fixtureIcs(makeFixture({ venue: null }), SITE, NOW)).not.toContain('LOCATION');
    const approx = fixtureIcs(makeFixture({ venue: makeVenue({ approximate: true }) }), SITE, NOW);
    expect(approx).toContain('LOCATION:');
    expect(approx).not.toContain('GEO:');
  });

  it('échappe les caractères réservés', () => {
    const ics = fixtureIcs(
      makeFixture({ home: { name: 'A; B, C\\D', slug: 'a', logoUrl: null } }),
      SITE,
      NOW,
    );
    expect(ics).toContain('SUMMARY:A\\; B\\, C\\\\D – Lille');
  });
});
