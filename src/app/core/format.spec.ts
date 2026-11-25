import {
  formatCount,
  formatDay,
  formatDistance,
  formatFullDate,
  formatKickoffDay,
  formatKickoffTime,
} from './format';
import { localParts, safeTimeZone } from './local-time';

/** Les espaces insécables d'Intl varient selon les moteurs : on les normalise pour comparer. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('format', () => {
  describe('formatDistance', () => {
    it('affiche des mètres arrondis à 50 m sous 1 km', () => {
      expect(formatDistance(0.82, 'fr-FR')).toBe('800 m');
      expect(formatDistance(0.01, 'fr-FR')).toBe('50 m');
      expect(formatDistance(0.99, 'fr-FR')).toBe('1 km');
    });

    it('garde une décimale sous 10 km, aucune au-delà', () => {
      expect(formatDistance(4.23, 'fr-FR')).toBe('4,2 km');
      expect(formatDistance(4, 'fr-FR')).toBe('4 km');
      expect(formatDistance(12.6, 'fr-FR')).toBe('13 km');
      expect(plain(formatDistance(1234.4, 'fr-FR'))).toBe('1 234 km');
    });

    it('rend une chaîne vide quand la distance est inconnue', () => {
      expect(formatDistance(null, 'fr-FR')).toBe('');
      expect(formatDistance(Number.NaN, 'fr-FR')).toBe('');
      expect(formatDistance(-3, 'fr-FR')).toBe('');
    });
  });

  describe('horaires', () => {
    // 14 mars 2026, 19:45 UTC = 20:45 à Paris, 04:45 le 15 à Tokyo.
    const KICKOFF = '2026-03-14T19:45:00Z';

    it('affiche l’heure du stade, pas celle du visiteur', () => {
      expect(formatKickoffTime(KICKOFF, 'Europe/Paris')).toBe('20:45');
      expect(formatKickoffTime(KICKOFF, 'Asia/Tokyo')).toBe('04:45');
    });

    it('retombe sur UTC sans fuseau ou avec un fuseau invalide', () => {
      expect(formatKickoffTime(KICKOFF, null)).toBe('19:45');
      expect(formatKickoffTime(KICKOFF, 'Mars/Olympus')).toBe('19:45');
      expect(safeTimeZone('Mars/Olympus')).toBe('UTC');
    });

    it('change de jour avec le fuseau', () => {
      expect(formatKickoffDay(KICKOFF, 'Europe/Paris', 'fr-FR')).toBe('sam. 14 mars');
      expect(formatKickoffDay(KICKOFF, 'Asia/Tokyo', 'fr-FR')).toBe('dim. 15 mars');
    });

    it('donne les composantes locales', () => {
      expect(localParts(KICKOFF, 'Asia/Tokyo')).toEqual({
        date: '2026-03-15',
        hour: 4,
        minute: 45,
        weekday: 0,
        timeZone: 'Asia/Tokyo',
      });
      expect(localParts('2026-03-14T23:30:00Z', 'Europe/Paris').hour).toBe(0);
    });
  });

  it('formate les jours et les nombres en français', () => {
    expect(formatDay('2026-03-14', 'fr-FR')).toBe('samedi 14 mars');
    expect(formatDay('2026-03-14', 'fr-FR', 'short')).toBe('sam. 14 mars');
    expect(formatFullDate('2026-03-14', 'fr-FR')).toBe('samedi 14 mars 2026');
    expect(plain(formatCount(38223, 'fr-FR'))).toBe('38 223');
  });
});
