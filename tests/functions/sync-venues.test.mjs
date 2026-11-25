import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiFootball } from '../../netlify/lib/api-football.mjs';
import { runVenueDetailsSync } from '../../netlify/lib/sync-venues.mjs';
import { transformVenues } from '../../netlify/lib/transform.mjs';
import { ENV, fakeFetch, jsonResponse } from './helpers.mjs';

const apiVenue = {
  id: 652,
  name: 'Stade Bollaert-Delelis',
  address: 'Avenue Alfred Maes',
  city: 'Lens',
  country: 'France',
  capacity: 38223,
  surface: 'grass',
  image: 'https://media.example.test/venues/652.png',
};

describe('transformVenues', () => {
  it('garde les détails utiles et ignore les entrées sans identifiant', () => {
    assert.deepEqual(
      transformVenues([apiVenue, { name: 'Sans id' }, { id: 9, capacity: 0 }], 'France'),
      {
        country: 'France',
        venues: [
          {
            source_key: 'af:652',
            address: 'Avenue Alfred Maes',
            city: 'Lens',
            capacity: 38223,
            surface: 'grass',
            image_url: 'https://media.example.test/venues/652.png',
          },
          {
            source_key: 'af:9',
            address: null,
            city: null,
            capacity: null,
            surface: null,
            image_url: null,
          },
        ],
      },
    );
    assert.deepEqual(transformVenues(undefined, 'France').venues, []);
  });
});

describe('runVenueDetailsSync', () => {
  it('complète les stades pays par pays', async () => {
    const fetch = fakeFetch([
      [
        'rpc/countries_to_sync',
        () => jsonResponse([{ country: 'France' }, { country: 'Costa Rica' }]),
      ],
      ['api-sports.io/venues', () => jsonResponse({ errors: [], response: [apiVenue] })],
      ['rpc/ingest_venue_details', () => jsonResponse(1)],
      ['/sync_runs', () => new Response(null, { status: 201 })],
    ]);
    const report = await runVenueDetailsSync({ env: ENV, fetch, limit: 2 });

    assert.deepEqual(report.countries, [
      { country: 'France', received: 1, updated: 1 },
      { country: 'Costa Rica', received: 1, updated: 1 },
    ]);
    const calls = fetch.callsTo('api-sports.io/venues');
    assert.equal(calls[0].url.searchParams.get('country'), 'France');
    assert.equal(calls[1].url.searchParams.get('country'), 'Costa-Rica');
    assert.equal(fetch.callsTo('rpc/ingest_venue_details')[1].body.payload.country, 'Costa Rica');
    assert.equal(fetch.callsTo('/sync_runs')[0].body.kind, 'venue-details');
  });

  it('s’arrête quand le quota est épuisé', async () => {
    const fetch = fakeFetch([
      ['rpc/countries_to_sync', () => jsonResponse([{ country: 'France' }, { country: 'Spain' }])],
      [
        'api-sports.io/venues',
        () => jsonResponse({ errors: { requests: 'request limit reached' }, response: [] }),
      ],
      ['/sync_runs', () => new Response(null, { status: 201 })],
    ]);
    const report = await runVenueDetailsSync({ env: ENV, fetch });
    assert.equal(report.stopped, 'quota');
    assert.equal(fetch.callsTo('api-sports.io/venues').length, 1);
  });

  it('valide le nom du pays', async () => {
    const options = { apiKey: 'k', fetch: fakeFetch([]) };
    await assert.rejects(apiFootball('/venues', { country: 'France&league=1' }, options), /refusé/);
    await assert.rejects(apiFootball('/venues', {}, options), /manquant/);
  });
});
