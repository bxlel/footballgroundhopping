import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { handle, resetRateLimit } from '../../netlify/functions/geocode.mjs';
import { ENV, fakeFetch, jsonResponse } from './helpers.mjs';

const request = (query, init) =>
  new Request(`https://spotthegame.example.test/.netlify/functions/geocode${query}`, init);

const nominatimHit = [
  {
    name: 'Hôtel de Ville',
    display_name: 'Hôtel de Ville, Place Jean Jaurès, Lens, France',
    lat: '50.4291',
    lon: '2.8319',
  },
];

function setup({ cached = [], results = nominatimHit } = {}) {
  return fakeFetch([
    [/geocode_cache\?query_key/, () => jsonResponse(cached)],
    ['nominatim.openstreetmap.org', () => jsonResponse(results)],
    [/geocode_cache\?on_conflict/, () => new Response(null, { status: 201 })],
  ]);
}

describe('GET /.netlify/functions/geocode', () => {
  beforeEach(() => resetRateLimit());

  it('refuse les autres méthodes, origines et paramètres', async () => {
    const fetch = setup();
    const deps = { env: ENV, fetch };
    assert.equal((await handle(request('?q=lens', { method: 'POST' }), deps)).status, 405);
    assert.equal(
      (await handle(request('?q=lens', { headers: { origin: 'https://ailleurs.test' } }), deps))
        .status,
      403,
    );
    assert.equal((await handle(request(''), deps)).status, 400);
    assert.equal((await handle(request('?q=ab'), deps)).status, 400);
    assert.equal((await handle(request(`?q=${'a'.repeat(121)}`), deps)).status, 400);
    assert.equal((await handle(request('?q=lens&format=xml'), deps)).status, 400);
    assert.equal((await handle(request('?q=%2B%2B%2B%2B'), deps)).status, 400);
    assert.equal(fetch.calls.length, 0);
  });

  it('géocode une adresse, la met en cache et ne pose pas d’en-tête CORS', async () => {
    const fetch = setup();
    const res = await handle(request('?q=H%C3%B4tel%20de%20ville%20Lens'), { env: ENV, fetch });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      place: {
        kind: 'address',
        name: 'Hôtel de Ville',
        detail: 'Place Jean Jaurès, Lens, France',
        lat: 50.4291,
        lng: 2.8319,
      },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.match(res.headers.get('netlify-cdn-cache-control'), /s-maxage=2592000/);

    const [nominatim] = fetch.callsTo('nominatim.openstreetmap.org');
    assert.equal(nominatim.url.searchParams.get('q'), 'Hôtel de ville Lens');
    assert.equal(nominatim.url.searchParams.get('limit'), '1');
    const [stored] = fetch.callsTo('on_conflict=query_key');
    assert.equal(stored.body.query_key, 'hotel de ville lens');
    assert.equal(stored.body.found, true);
  });

  it('sert le cache sans rappeler le géocodeur', async () => {
    const cached = [{ found: true, name: 'Lens', detail: 'France', lat: 50.43, lng: 2.83 }];
    const fetch = setup({ cached });
    const res = await handle(request('?q=Lens%20centre'), { env: ENV, fetch });
    assert.deepEqual((await res.json()).place, {
      kind: 'address',
      name: 'Lens',
      detail: 'France',
      lat: 50.43,
      lng: 2.83,
    });
    assert.equal(fetch.callsTo('nominatim').length, 0);
  });

  it('retient aussi les adresses introuvables', async () => {
    const fetch = setup({ results: [] });
    const res = await handle(request('?q=zzzzzz'), { env: ENV, fetch });
    assert.deepEqual(await res.json(), { place: null });
    assert.equal(fetch.callsTo('on_conflict=query_key')[0].body.found, false);

    const again = setup({ cached: [{ found: false }] });
    assert.deepEqual(
      await (await handle(request('?q=zzzzzz'), { env: ENV, fetch: again })).json(),
      {
        place: null,
      },
    );
  });

  it('limite le débit vers le géocodeur à une requête par seconde', async () => {
    const fetch = setup();
    let clock = 5_000_000;
    const deps = { env: ENV, fetch, now: () => clock };
    assert.equal((await handle(request('?q=premiere adresse'), deps)).status, 200);
    clock += 300;
    const limited = await handle(request('?q=seconde adresse'), deps);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '1');
    clock += 1200;
    assert.equal((await handle(request('?q=seconde adresse'), deps)).status, 200);
  });

  it('répond 502 quand le géocodeur ou la base sont indisponibles', async () => {
    const fetch = fakeFetch([[/geocode_cache/, () => new Response('boom', { status: 500 })]]);
    assert.equal((await handle(request('?q=lens'), { env: ENV, fetch })).status, 502);
  });
});
