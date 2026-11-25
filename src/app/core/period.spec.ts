import {
  addDays,
  daysBetween,
  isIsoDate,
  matchingPreset,
  normalizePeriod,
  presetPeriod,
  toIsoDate,
} from './period';

describe('period', () => {
  // 2026-11-25 est un mercredi.
  const WED = '2026-11-25';

  it('formate une date locale sans décalage de fuseau', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('reconnaît les vraies dates seulement', () => {
    expect(isIsoDate('2026-02-28')).toBeTrue();
    expect(isIsoDate('2026-02-30')).toBeFalse();
    expect(isIsoDate('28/02/2026')).toBeFalse();
    expect(isIsoDate(undefined)).toBeFalse();
  });

  it('ajoute des jours en passant les mois et les années', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  describe('presetPeriod', () => {
    it('aujourd’hui : un seul jour', () => {
      expect(presetPeriod('today', WED)).toEqual({ from: WED, to: WED });
    });

    it('7 prochains jours : aujourd’hui inclus', () => {
      expect(presetPeriod('week', WED)).toEqual({ from: WED, to: '2026-12-01' });
    });

    it('ce week-end en semaine : du vendredi au dimanche qui viennent', () => {
      expect(presetPeriod('weekend', WED)).toEqual({ from: '2026-11-27', to: '2026-11-29' });
      expect(presetPeriod('weekend', '2026-11-23')).toEqual({
        from: '2026-11-27',
        to: '2026-11-29',
      });
    });

    it('ce week-end un vendredi, un samedi ou un dimanche : commence aujourd’hui', () => {
      expect(presetPeriod('weekend', '2026-11-27')).toEqual({
        from: '2026-11-27',
        to: '2026-11-29',
      });
      expect(presetPeriod('weekend', '2026-11-28')).toEqual({
        from: '2026-11-28',
        to: '2026-11-29',
      });
      expect(presetPeriod('weekend', '2026-11-29')).toEqual({
        from: '2026-11-29',
        to: '2026-11-29',
      });
    });
  });

  it('retrouve le raccourci d’une période', () => {
    expect(matchingPreset({ from: '2026-11-27', to: '2026-11-29' }, WED)).toBe('weekend');
    expect(matchingPreset({ from: WED, to: WED }, WED)).toBe('today');
    expect(matchingPreset({ from: WED, to: '2026-11-26' }, WED)).toBeNull();
  });

  describe('normalizePeriod', () => {
    it('garde une période valide', () => {
      expect(normalizePeriod('2026-11-26', '2026-11-28', WED)).toEqual({
        from: '2026-11-26',
        to: '2026-11-28',
      });
    });

    it('remet les dates dans l’ordre', () => {
      expect(normalizePeriod('2026-11-28', '2026-11-26', WED)).toEqual({
        from: '2026-11-26',
        to: '2026-11-28',
      });
    });

    it('accepte une date seule', () => {
      expect(normalizePeriod('2026-11-26', undefined, WED)).toEqual({
        from: '2026-11-26',
        to: '2026-11-26',
      });
    });

    it('ne commence jamais dans le passé', () => {
      expect(normalizePeriod('2026-11-20', '2026-11-27', WED)).toEqual({
        from: WED,
        to: '2026-11-27',
      });
    });

    it('limite la durée à 21 jours', () => {
      expect(normalizePeriod(WED, '2027-03-01', WED)).toEqual({ from: WED, to: '2026-12-15' });
    });

    it('retombe sur ce week-end quand les dates sont invalides ou passées', () => {
      const weekend = { from: '2026-11-27', to: '2026-11-29' };
      expect(normalizePeriod('n’importe quoi', null, WED)).toEqual(weekend);
      expect(normalizePeriod('2026-11-01', '2026-11-02', WED)).toEqual(weekend);
    });
  });
});
