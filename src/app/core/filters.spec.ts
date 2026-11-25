import {
  applyFilters,
  availableCountries,
  availableLevels,
  countActive,
  groupByDay,
  matchesSlots,
  sortFixtures,
  toggle,
} from './filters';
import { EMPTY_FILTERS } from './models';
import { makeFixture, makeVenue } from './testing/fixtures';

describe('filters', () => {
  // Samedi 14 mars 2026 : 20:45 à Paris.
  const saturdayEvening = makeFixture({ id: 1, kickoffAt: '2026-03-14T19:45:00Z' });
  // Samedi 14 mars 2026 : 15:00 à Paris.
  const saturdayAfternoon = makeFixture({ id: 2, kickoffAt: '2026-03-14T14:00:00Z' });
  // Mercredi 18 mars 2026 : 21:00 à Paris.
  const wednesdayEvening = makeFixture({ id: 3, kickoffAt: '2026-03-18T20:00:00Z' });

  describe('créneaux', () => {
    it('sans créneau, tout passe', () => {
      expect(matchesSlots(wednesdayEvening, [])).toBeTrue();
    });

    it('soirée : à partir de 18 h, heure du stade', () => {
      expect(matchesSlots(saturdayEvening, ['evening'])).toBeTrue();
      expect(matchesSlots(saturdayAfternoon, ['evening'])).toBeFalse();
      // 19:45 UTC = 04:45 à Tokyo : ce n'est pas une soirée là-bas.
      const tokyo = makeFixture({ venue: makeVenue({ timezone: 'Asia/Tokyo' }) });
      expect(matchesSlots(tokyo, ['evening'])).toBeFalse();
      expect(matchesSlots(tokyo, ['daytime'])).toBeTrue();
    });

    it('soirée + journée : l’un ou l’autre', () => {
      expect(matchesSlots(saturdayAfternoon, ['evening', 'daytime'])).toBeTrue();
    });

    it('week-end se combine avec l’heure', () => {
      expect(matchesSlots(saturdayEvening, ['weekend'])).toBeTrue();
      expect(matchesSlots(wednesdayEvening, ['weekend'])).toBeFalse();
      expect(matchesSlots(saturdayAfternoon, ['weekend', 'evening'])).toBeFalse();
      expect(matchesSlots(saturdayEvening, ['weekend', 'evening'])).toBeTrue();
    });

    it('un horaire non confirmé n’est pas écarté sur l’heure', () => {
      const unconfirmed = makeFixture({ kickoffAt: '2026-03-14T00:00:00Z', timeConfirmed: false });
      expect(matchesSlots(unconfirmed, ['evening'])).toBeTrue();
      expect(matchesSlots(unconfirmed, ['daytime'])).toBeTrue();
    });
  });

  describe('applyFilters', () => {
    const cup = makeFixture({
      id: 4,
      competition: { name: 'FA Cup', country: 'England', level: 'cup' },
    });
    const noCountry = makeFixture({
      id: 5,
      competition: { name: 'Amical', country: null, level: 'other' },
    });
    const all = [saturdayEvening, saturdayAfternoon, wednesdayEvening, cup, noCountry];

    it('ne filtre rien par défaut', () => {
      expect(applyFilters(all, EMPTY_FILTERS).length).toBe(5);
    });

    it('filtre par niveau et par pays', () => {
      expect(applyFilters(all, { ...EMPTY_FILTERS, levels: ['cup'] })).toEqual([cup]);
      expect(applyFilters(all, { ...EMPTY_FILTERS, countries: ['England'] })).toEqual([cup]);
      expect(
        applyFilters(all, { ...EMPTY_FILTERS, levels: ['top', 'cup'], countries: ['France'] })
          .length,
      ).toBe(3);
    });

    it('combine tous les filtres', () => {
      expect(
        applyFilters(all, {
          slots: ['weekend', 'evening'],
          levels: ['top'],
          countries: ['France'],
        }),
      ).toEqual([saturdayEvening]);
    });
  });

  it('trie par jour, puis par distance, puis par heure', () => {
    const far = makeFixture({ id: 10, kickoffAt: '2026-03-14T12:00:00Z', distanceKm: 40 });
    const near = makeFixture({ id: 11, kickoffAt: '2026-03-14T19:00:00Z', distanceKm: 5 });
    const nearLater = makeFixture({ id: 12, kickoffAt: '2026-03-14T20:00:00Z', distanceKm: 5 });
    const dayBefore = makeFixture({ id: 13, kickoffAt: '2026-03-13T19:00:00Z', distanceKm: 90 });
    const unknown = makeFixture({ id: 14, kickoffAt: '2026-03-14T10:00:00Z', distanceKm: null });

    const sorted = sortFixtures([unknown, nearLater, far, near, dayBefore]);
    expect(sorted.map((f) => f.id)).toEqual([13, 11, 12, 10, 14]);
  });

  it('regroupe par journée locale', () => {
    // 23:30 UTC le 14 = 00:30 le 15 à Paris.
    const lateNight = makeFixture({ id: 20, kickoffAt: '2026-03-14T23:30:00Z' });
    const groups = groupByDay(sortFixtures([saturdayEvening, lateNight, saturdayAfternoon]));
    expect(groups.map((g) => [g.day, g.fixtures.length])).toEqual([
      ['2026-03-14', 2],
      ['2026-03-15', 1],
    ]);
  });

  it('liste les niveaux et pays présents', () => {
    const list = [
      makeFixture({ competition: { name: 'A', country: 'France', level: 'lower' } }),
      makeFixture({ competition: { name: 'B', country: 'Belgique', level: 'top' } }),
      makeFixture({ competition: { name: 'C', country: null, level: 'top' } }),
    ];
    expect(availableLevels(list)).toEqual(['top', 'lower']);
    expect(availableCountries(list, 'fr-FR')).toEqual(['Belgique', 'France']);
  });

  it('bascule une valeur et compte les filtres actifs', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    expect(countActive({ slots: ['weekend'], levels: ['top', 'cup'], countries: [] })).toBe(3);
  });
});
