import { venueMarkers } from './markers';
import { makeFixture, makeVenue } from './testing/fixtures';

describe('venueMarkers', () => {
  it('fait un repère par stade, avec le nombre de matchs', () => {
    const bollaert = makeVenue();
    const mauroy = makeVenue({
      name: 'Stade Pierre-Mauroy',
      slug: 'stade-pierre-mauroy-villeneuve-d-ascq',
      position: { lat: 50.6119, lng: 3.1305 },
      approximate: true,
    });
    const markers = venueMarkers([
      makeFixture({ id: 1, venue: bollaert }),
      makeFixture({ id: 2, venue: mauroy }),
      makeFixture({ id: 3, venue: bollaert }),
    ]);
    expect(markers).toEqual([
      {
        id: 'stade-bollaert-delelis-lens',
        position: { lat: 50.4328, lng: 2.8149 },
        name: 'Stade Bollaert-Delelis',
        count: 2,
        approximate: false,
      },
      {
        id: 'stade-pierre-mauroy-villeneuve-d-ascq',
        position: { lat: 50.6119, lng: 3.1305 },
        name: 'Stade Pierre-Mauroy',
        count: 1,
        approximate: true,
      },
    ]);
  });

  it('ignore les matchs sans stade ou sans coordonnées', () => {
    expect(
      venueMarkers([
        makeFixture({ venue: null }),
        makeFixture({ venue: makeVenue({ position: null }) }),
      ]),
    ).toEqual([]);
  });
});
