import { staleHours } from './freshness';

describe('staleHours', () => {
  const NOW = new Date('2026-11-25T12:00:00Z');

  it('ne signale rien quand les données sont fraîches ou de date inconnue', () => {
    expect(staleHours('2026-11-25T09:00:00Z', NOW)).toBeNull();
    expect(staleHours('2026-11-24T12:00:01Z', NOW)).toBeNull();
    expect(staleHours(null, NOW)).toBeNull();
    expect(staleHours('pas une date', NOW)).toBeNull();
  });

  it('donne l’ancienneté en heures à partir de 24 h', () => {
    expect(staleHours('2026-11-24T12:00:00Z', NOW)).toBe(24);
    expect(staleHours('2026-11-22T10:30:00Z', NOW)).toBe(73);
  });
});
