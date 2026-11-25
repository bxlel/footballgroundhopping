import { circleBounds, circleRing, destination, haversineKm, isValidPoint } from './geo';

describe('geo', () => {
  const PARIS = { lat: 48.8566, lng: 2.3522 };
  const LONDON = { lat: 51.5074, lng: -0.1278 };

  it('calcule la distance à vol d’oiseau', () => {
    expect(haversineKm(PARIS, LONDON)).toBeCloseTo(343.6, 0);
    expect(haversineKm(PARIS, PARIS)).toBe(0);
  });

  it('valide les coordonnées', () => {
    expect(isValidPoint(48.85, 2.35)).toBeTrue();
    expect(isValidPoint(91, 0)).toBeFalse();
    expect(isValidPoint(0, 181)).toBeFalse();
    expect(isValidPoint('48', 2)).toBeFalse();
    expect(isValidPoint(Number.NaN, 2)).toBeFalse();
  });

  it('trouve un point à une distance et un cap donnés', () => {
    const north = destination(PARIS, 50, 0);
    expect(haversineKm(PARIS, north)).toBeCloseTo(50, 3);
    expect(north.lng).toBeCloseTo(PARIS.lng, 6);
    expect(north.lat).toBeGreaterThan(PARIS.lat);
  });

  it('dessine un anneau fermé à la bonne distance du centre', () => {
    const ring = circleRing(PARIS, 25, 16);
    expect(ring.length).toBe(17);
    expect(ring[0][0]).toBeCloseTo(ring[16][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[16][1], 9);
    for (const [lng, lat] of ring) {
      expect(haversineKm(PARIS, { lat, lng })).toBeCloseTo(25, 3);
    }
  });

  it('calcule l’emprise d’un cercle', () => {
    const [west, south, east, north] = circleBounds(PARIS, 100);
    expect(west).toBeLessThan(PARIS.lng);
    expect(east).toBeGreaterThan(PARIS.lng);
    expect(south).toBeLessThan(PARIS.lat);
    expect(north).toBeGreaterThan(PARIS.lat);
    expect(haversineKm(PARIS, { lat: north, lng: PARIS.lng })).toBeCloseTo(100, 3);
  });
});
