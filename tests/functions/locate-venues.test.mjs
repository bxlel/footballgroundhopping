import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAdmin1, parseCity, parseCountries } from '../../netlify/lib/geonames.mjs';
import { runLocateVenues } from '../../netlify/lib/locate-venues.mjs';
import { pickAddress, pickStadium } from '../../netlify/lib/nominatim.mjs';
import { userAgent } from '../../netlify/lib/user-agent.mjs';
import { findStadium, nameSimilarity, scoreCandidate } from '../../netlify/lib/wikidata.mjs';
import { ENV, fakeFetch, jsonResponse } from './helpers.mjs';

const LENS = { lat: 50.4333, lng: 2.8333 };
const BOLLAERT = { lat: 50.4328, lng: 2.8149 };

function wikidataEntity(id, { label, types = ['Q483110'], point = BOLLAERT, description = '' }) {
  return {
    id,
    labels: { en: { value: label } },
    descriptions: { en: { value: description } },
    aliases: {},
    claims: {
      P31: types.map((type) => ({ mainsnak: { datavalue: { value: { id: type } } } })),
      ...(point
        ? {
            P625: [
              { mainsnak: { datavalue: { value: { latitude: point.lat, longitude: point.lng } } } },
            ],
          }
        : {}),
    },
  };
}

describe('Wikidata : notation des candidats', () => {
  const venue = { name: 'Stade Bollaert-Delelis', cityPoint: LENS };
  const candidate = (overrides) => ({
    label: 'Stade Bollaert-Delelis',
    aliases: [],
    description: '',
    types: ['Q483110'],
    point: BOLLAERT,
    ...overrides,
  });

  it('compare les noms sans accents ni ponctuation', () => {
    assert.equal(nameSimilarity('Stade Bollaert-Delelis', 'stade bollaert delelis'), 1);
    assert.equal(nameSimilarity('Anfield', 'Anfield Road'), 0.5);
    assert.equal(nameSimilarity('', 'x'), 0);
  });

  it('donne la note maximale à un stade du bon nom dans la bonne ville', () => {
    assert.equal(scoreCandidate(venue, candidate()), 1);
  });

  it('écarte un homonyme situé ailleurs et un candidat sans coordonnées', () => {
    assert.equal(scoreCandidate(venue, candidate({ point: { lat: 48.85, lng: 2.35 } })), 0);
    assert.equal(scoreCandidate(venue, candidate({ point: null })), 0);
  });

  it('note bas ce qui n’est pas une enceinte sportive', () => {
    const score = scoreCandidate(venue, candidate({ types: ['Q5'], description: 'French miner' }));
    assert.ok(score < 0.8);
    assert.equal(
      scoreCandidate({ name: 'Anfield' }, candidate({ label: 'Anfield', types: ['Q5'] })),
      0.45,
    );
  });

  it('reconnaît un stade à sa description ou à un autre nom', () => {
    const byDescription = candidate({ types: [], description: 'football stadium in Lens, France' });
    assert.equal(scoreCandidate(venue, byDescription), 1);
    const byAlias = candidate({
      label: 'Stade Félix-Bollaert',
      aliases: ['Stade Bollaert-Delelis'],
    });
    assert.equal(scoreCandidate(venue, byAlias), 1);
  });

  it('sans ville connue, n’accepte qu’un nom identique', () => {
    assert.equal(scoreCandidate({ name: 'Anfield' }, candidate({ label: 'Anfield' })), 0.7);
    assert.ok(scoreCandidate({ name: 'Anfield' }, candidate({ label: 'Anfield Road' })) < 0.7);
  });
});

describe('Wikidata : recherche', () => {
  it('rend le meilleur candidat au-dessus du seuil', async () => {
    const fetch = fakeFetch([
      ['wbsearchentities', () => jsonResponse({ search: [{ id: 'Q1' }, { id: 'Q2' }] })],
      [
        'wbgetentities',
        () =>
          jsonResponse({
            entities: {
              Q1: wikidataEntity('Q1', { label: 'Bollaert', types: ['Q5'], point: null }),
              Q2: wikidataEntity('Q2', { label: 'Stade Bollaert-Delelis' }),
            },
          }),
      ],
    ]);
    const found = await findStadium(
      { name: 'Stade Bollaert-Delelis', cityPoint: LENS },
      { fetch, userAgent: 'test' },
    );
    assert.deepEqual(found, { ...BOLLAERT, confidence: 1, wikidataId: 'Q2' });
    assert.equal(fetch.calls[0].init.headers['User-Agent'], 'test');
    assert.equal(fetch.calls[1].url.searchParams.get('ids'), 'Q1|Q2');
  });

  it('rend null sans résultat', async () => {
    const fetch = fakeFetch([['wbsearchentities', () => jsonResponse({ search: [] })]]);
    assert.equal(await findStadium({ name: 'Inconnu' }, { fetch, userAgent: 'test' }), null);
    assert.equal(fetch.calls.length, 1);
  });
});

describe('Nominatim : choix du résultat', () => {
  const stadium = { category: 'leisure', type: 'stadium', lat: '50.4328', lon: '2.8149' };

  it('ne garde que les enceintes sportives proches de la ville', () => {
    const street = { category: 'highway', type: 'residential', lat: '50.43', lon: '2.83' };
    assert.deepEqual(pickStadium([street, stadium], LENS), { ...BOLLAERT, confidence: 0.75 });
    assert.equal(pickStadium([street], LENS), null);
    assert.equal(pickStadium([{ ...stadium, lat: '43.3', lon: '5.4' }], LENS), null);
    assert.equal(pickStadium([{ ...stadium, type: 'pitch' }], null).confidence, 0.6);
  });

  it('met en forme une adresse', () => {
    const result = {
      name: 'Hôtel de Ville',
      display_name: 'Hôtel de Ville, Place Jean Jaurès, Lens, Pas-de-Calais, France',
      lat: '50.4291',
      lon: '2.8319',
    };
    assert.deepEqual(pickAddress([result]), {
      kind: 'address',
      name: 'Hôtel de Ville',
      detail: 'Place Jean Jaurès, Lens, Pas-de-Calais, France',
      lat: 50.4291,
      lng: 2.8319,
    });
    assert.equal(pickAddress([]), null);
    assert.equal(pickAddress([{ lat: 'x', lon: 'y' }]), null);
  });
});

describe('runLocateVenues', () => {
  const venues = [
    {
      id: 1,
      name: 'Stade Bollaert-Delelis',
      city: 'Lens',
      country: 'France',
      city_lat: LENS.lat,
      city_lng: LENS.lng,
    },
    {
      id: 2,
      name: 'Stade Municipal',
      city: 'Arras',
      country: 'France',
      city_lat: 50.29,
      city_lng: 2.78,
    },
    {
      id: 3,
      name: 'Terrain Inconnu',
      city: 'Nulle Part',
      country: 'France',
      city_lat: null,
      city_lng: null,
    },
    {
      id: 4,
      name: 'Stade Trop Tard',
      city: 'Lens',
      country: 'France',
      city_lat: null,
      city_lng: null,
    },
  ];

  function setup() {
    return fakeFetch([
      ['rpc/apply_venue_overrides', () => jsonResponse(0)],
      ['rpc/venues_to_locate', () => jsonResponse(venues)],
      [
        'wbsearchentities',
        (url) =>
          jsonResponse({
            search: url.searchParams.get('search').includes('Bollaert') ? [{ id: 'Q2' }] : [],
          }),
      ],
      [
        'wbgetentities',
        () =>
          jsonResponse({
            entities: { Q2: wikidataEntity('Q2', { label: 'Stade Bollaert-Delelis' }) },
          }),
      ],
      [
        'nominatim.openstreetmap.org',
        (url) =>
          jsonResponse(
            url.searchParams.get('q').startsWith('Stade Municipal')
              ? [{ category: 'leisure', type: 'stadium', lat: '50.2901', lon: '2.7801' }]
              : [],
          ),
      ],
      ['rpc/set_venue_coords', () => jsonResponse(true)],
      ['rpc/mark_venue_checked', () => new Response(null, { status: 204 })],
      ['/sync_runs', () => new Response(null, { status: 201 })],
    ]);
  }

  it('essaie Wikidata, puis Nominatim, en respectant son budget et son débit', async () => {
    const fetch = setup();
    const pauses = [];
    let clock = 1_000_000;
    const report = await runLocateVenues({
      env: ENV,
      fetch,
      now: () => clock,
      sleep: async (ms) => {
        pauses.push(ms);
        clock += ms;
      },
      nominatimLimit: 2,
    });

    assert.deepEqual(report, { wikidata: 1, nominatim: 1, notFound: 1, deferred: 1, errors: 0 });

    const saved = fetch.callsTo('rpc/set_venue_coords').map((call) => call.body);
    assert.deepEqual(saved[0], {
      p_venue_id: 1,
      p_lat: BOLLAERT.lat,
      p_lng: BOLLAERT.lng,
      p_source: 'wikidata',
      p_confidence: 1,
      p_wikidata_id: 'Q2',
    });
    assert.equal(saved[1].p_venue_id, 2);
    assert.equal(saved[1].p_source, 'nominatim');
    assert.deepEqual(fetch.callsTo('rpc/mark_venue_checked')[0].body, { p_venue_id: 3 });

    const nominatim = fetch.callsTo('nominatim.openstreetmap.org');
    assert.equal(nominatim.length, 2);
    assert.match(nominatim[0].init.headers['User-Agent'], /SpotTheGame.*contact@example\.test/);
    assert.deepEqual(pauses, [1100]);
  });

  it('refuse de tourner sans adresse de contact', async () => {
    const env = { ...ENV, CONTACT_EMAIL: '' };
    await assert.rejects(runLocateVenues({ env, fetch: setup() }), /CONTACT_EMAIL/);
    assert.throws(() => userAgent({}), /CONTACT_EMAIL/);
  });
});

describe('GeoNames', () => {
  const countries = parseCountries('# commentaire\nFR\tFRA\t250\tFR\tFrance\tParis\n');
  const regions = parseAdmin1('FR.32\tHauts-de-France\tHauts-de-France\t11071624\n');
  const line = [
    '3003093',
    'Lens',
    'Lens',
    'Lens,Lensi,Ланс',
    '50.43302',
    '2.82791',
    'P',
    'PPL',
    'FR',
    '',
    '32',
    '62',
    '628',
    '62498',
    '31606',
    '',
    '42',
    'Europe/Paris',
    '2024-01-01',
  ].join('\t');

  it('transforme une ligne de ville', () => {
    assert.deepEqual(parseCity(line, countries, regions), {
      geoname_id: 3003093,
      name: 'Lens',
      search_name: 'lens',
      alt_names: ',lensi,',
      country_code: 'FR',
      country_name: 'France',
      admin1: 'Hauts-de-France',
      population: 31606,
      timezone: 'Europe/Paris',
      location: 'SRID=4326;POINT(2.82791 50.43302)',
    });
  });

  it('ignore les lignes inutilisables', () => {
    assert.equal(parseCity('', countries, regions), null);
    assert.equal(parseCity(line.replace('50.43302', 'abc'), countries, regions), null);
  });
});
