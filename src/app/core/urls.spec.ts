import {
  absoluteUrl,
  directionsUrl,
  matchLink,
  matchPath,
  nearestRadius,
  parseTripQuery,
  teamPath,
  tripQueryParams,
  venueLink,
  venuePath,
} from './urls';
import { makeVenue } from './testing/fixtures';

describe('urls', () => {
  const TODAY = '2026-11-25';

  it('construit les URL des pages', () => {
    expect(matchPath('2026-03-14-lens-lille')).toBe('/matchs/2026-03-14-lens-lille');
    expect(venuePath('anfield-liverpool')).toBe('/stades/anfield-liverpool');
    expect(teamPath('rc-lens')).toBe('/clubs/rc-lens');
    expect(matchLink('x')).toEqual(['/', 'matchs', 'x']);
    expect(venueLink('y')).toEqual(['/', 'stades', 'y']);
  });

  it('construit une URL absolue sans double barre', () => {
    expect(absoluteUrl('https://spotthegame.app/', '/stades/anfield-liverpool')).toBe(
      'https://spotthegame.app/stades/anfield-liverpool',
    );
    expect(absoluteUrl('https://spotthegame.app', 'voyage')).toBe('https://spotthegame.app/voyage');
  });

  describe('recherche dans l’URL', () => {
    const query = {
      origin: { lat: 50.43281234, lng: 2.81490001 },
      label: 'Lens',
      from: '2026-11-27',
      to: '2026-11-29',
      radiusKm: 50,
    };

    it('écrit des paramètres courts', () => {
      expect(tripQueryParams(query)).toEqual({
        lieu: 'Lens',
        lat: '50.4328',
        lng: '2.8149',
        du: '2026-11-27',
        au: '2026-11-29',
        rayon: '50',
      });
    });

    it('relit ce qu’elle a écrit', () => {
      expect(parseTripQuery(tripQueryParams(query), TODAY)).toEqual({
        ...query,
        origin: { lat: 50.4328, lng: 2.8149 },
      });
    });

    it('refuse une recherche sans coordonnées valides', () => {
      expect(parseTripQuery({}, TODAY)).toBeNull();
      expect(parseTripQuery({ lat: '95', lng: '2' }, TODAY)).toBeNull();
      expect(parseTripQuery({ lat: 'abc', lng: '2' }, TODAY)).toBeNull();
      expect(parseTripQuery({ lat: '', lng: '' }, TODAY)).toBeNull();
    });

    it('corrige le rayon et les dates plutôt que d’échouer', () => {
      const parsed = parseTripQuery(
        { lat: '50.4', lng: '2.8', rayon: '60', du: 'hier', lieu: '  Lens  ' },
        TODAY,
      );
      expect(parsed).toEqual({
        origin: { lat: 50.4, lng: 2.8 },
        label: 'Lens',
        from: '2026-11-27',
        to: '2026-11-29',
        radiusKm: 50,
      });
      expect(parseTripQuery({ lat: '1', lng: '1', rayon: '-5' }, TODAY)?.radiusKm).toBe(50);
    });

    it('ramène un rayon au choix le plus proche', () => {
      expect(nearestRadius(12)).toBe(10);
      expect(nearestRadius(80)).toBe(100);
      expect(nearestRadius(5000)).toBe(200);
    });
  });

  describe('itinéraire', () => {
    it('vise les coordonnées quand elles sont fiables', () => {
      const venue = makeVenue();
      expect(directionsUrl('google', venue)).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=50.4328%2C2.8149',
      );
      expect(directionsUrl('apple', venue)).toBe('https://maps.apple.com/?daddr=50.4328%2C2.8149');
    });

    it('cherche le stade par son nom quand la position est approximative', () => {
      const venue = makeVenue({ approximate: true });
      expect(directionsUrl('google', venue)).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=Stade%20Bollaert-Delelis%2C%20Lens',
      );
      expect(directionsUrl('apple', makeVenue({ position: null, city: null }))).toBe(
        'https://maps.apple.com/?daddr=Stade%20Bollaert-Delelis',
      );
    });
  });
});
