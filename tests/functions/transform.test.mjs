import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanText, searchKey, slugify } from '../../netlify/lib/text.mjs';
import {
  classifyLevel,
  isTimeConfirmed,
  mapStatus,
  transformFixtures,
} from '../../netlify/lib/transform.mjs';
import { apiFixture } from './helpers.mjs';

describe('text', () => {
  it('fabrique des slugs lisibles', () => {
    assert.equal(slugify('Stade Bollaert-Delelis, Lens'), 'stade-bollaert-delelis-lens');
    assert.equal(slugify('São Paulo'), 'sao-paulo');
    assert.equal(slugify('  1. FC Köln  '), '1-fc-koln');
    assert.equal(slugify(null), '');
  });

  it('fabrique des clés de recherche', () => {
    assert.equal(searchKey('Saint-Étienne'), 'saint etienne');
  });

  it('nettoie les textes', () => {
    assert.equal(cleanText('  Stade   de  France '), 'Stade de France');
    assert.equal(cleanText('   '), null);
    assert.equal(cleanText(42), null);
  });
});

describe('classifyLevel', () => {
  const level = (name, country = 'X', id = 0) => classifyLevel({ id, name, country });

  it('reconnaît le football féminin et les jeunes avant tout le reste', () => {
    assert.equal(level('Premier League Women'), 'women');
    assert.equal(level('Division 1 Féminine'), 'women');
    assert.equal(level('Frauen Bundesliga'), 'women');
    assert.equal(level('Premier League 2 U21'), 'youth');
    assert.equal(level('Campionato Primavera 1'), 'youth');
    assert.equal(level('UEFA Youth League', 'World'), 'youth');
  });

  it('reconnaît les coupes et les compétitions internationales', () => {
    assert.equal(level('FA Cup'), 'cup');
    assert.equal(level('Coupe de France'), 'cup');
    assert.equal(level('DFB Pokal'), 'cup');
    assert.equal(level('Taça de Portugal'), 'cup');
    assert.equal(level('UEFA Champions League', 'World'), 'cup');
  });

  it('distingue premières divisions et divisions inférieures', () => {
    assert.equal(level('Ligue 1'), 'top');
    assert.equal(level('Premier League', 'England', 39), 'top');
    assert.equal(level('Serie A'), 'top');
    assert.equal(level('Ligue 2'), 'lower');
    assert.equal(level('2. Bundesliga'), 'lower');
    assert.equal(level('Serie B'), 'lower');
    assert.equal(level('Championship'), 'lower');
    assert.equal(level('National 2'), 'lower');
    assert.equal(level('League One'), 'lower');
    assert.equal(level('Segunda División'), 'lower');
  });

  it('range le reste dans « autres »', () => {
    assert.equal(level('Friendlies Clubs', 'World'), 'other');
    assert.equal(level('Ykkönen'), 'other');
    assert.equal(level(''), 'other');
  });
});

describe('statuts', () => {
  it('traduit les statuts API-Football', () => {
    assert.equal(mapStatus('NS'), 'scheduled');
    assert.equal(mapStatus('TBD'), 'scheduled');
    assert.equal(mapStatus('2H'), 'live');
    assert.equal(mapStatus('FT'), 'finished');
    assert.equal(mapStatus('PST'), 'postponed');
    assert.equal(mapStatus('CANC'), 'cancelled');
    assert.equal(mapStatus('???'), 'scheduled');
  });

  it('considère l’horaire non confirmé tant que le statut est TBD', () => {
    assert.equal(isTimeConfirmed('TBD'), false);
    assert.equal(isTimeConfirmed('NS'), true);
  });
});

describe('transformFixtures', () => {
  it('produit le lot attendu par ingest_fixtures', () => {
    const { payload, skipped } = transformFixtures([apiFixture()], '2026-11-28');
    assert.equal(skipped, 0);
    assert.deepEqual(payload, {
      day: '2026-11-28',
      competitions: [
        {
          source_key: 'af:61',
          name: 'Ligue 1',
          country: 'France',
          level: 'top',
          logo_url: 'https://media.example.test/leagues/61.png',
        },
      ],
      teams: [
        {
          source_key: 'af:116',
          name: 'Lens',
          country: 'France',
          logo_url: 'https://media.example.test/teams/116.png',
        },
        {
          source_key: 'af:79',
          name: 'Lille',
          country: 'France',
          logo_url: 'https://media.example.test/teams/79.png',
        },
      ],
      venues: [
        { source_key: 'af:652', name: 'Stade Bollaert-Delelis', city: 'Lens', country: 'France' },
      ],
      fixtures: [
        {
          source_key: 'af:1001',
          competition_key: 'af:61',
          season: 2026,
          round: 'Regular Season - 14',
          home_key: 'af:116',
          away_key: 'af:79',
          venue_key: 'af:652',
          kickoff_at: '2026-11-28T20:00:00.000Z',
          time_confirmed: true,
          status: 'scheduled',
        },
      ],
    });
  });

  it('ne duplique ni compétitions, ni équipes, ni stades', () => {
    const second = apiFixture({
      fixture: { id: 1002, date: '2026-11-28T14:00:00+00:00' },
      teams: { home: { id: 116, name: 'Lens' }, away: { id: 80, name: 'Lyon' } },
    });
    const { payload } = transformFixtures([apiFixture(), second], '2026-11-28');
    assert.equal(payload.competitions.length, 1);
    assert.equal(payload.venues.length, 1);
    assert.deepEqual(
      payload.teams.map((team) => team.source_key),
      ['af:116', 'af:79', 'af:80'],
    );
    assert.equal(payload.fixtures.length, 2);
  });

  it('donne une clé stable aux stades sans identifiant', () => {
    const item = apiFixture({
      fixture: { venue: { id: null, name: 'Stade Municipal', city: 'Arras' } },
    });
    const { payload } = transformFixtures([item], '2026-11-28');
    assert.equal(payload.venues[0].source_key, 'af:n:stade-municipal-arras-france');
    assert.equal(payload.fixtures[0].venue_key, 'af:n:stade-municipal-arras-france');
  });

  it('accepte un match sans stade et une compétition internationale', () => {
    const item = apiFixture({
      fixture: { venue: { id: null, name: null, city: null }, status: { short: 'TBD' } },
      league: { id: 2, name: 'UEFA Champions League', country: 'World' },
    });
    const { payload } = transformFixtures([item], '2026-11-28');
    assert.equal(payload.venues.length, 0);
    assert.equal(payload.fixtures[0].venue_key, null);
    assert.equal(payload.fixtures[0].time_confirmed, false);
    assert.equal(payload.competitions[0].country, null);
    assert.equal(payload.competitions[0].level, 'cup');
    assert.equal(payload.teams[0].country, null);
  });

  it('convertit l’horaire en UTC', () => {
    const item = apiFixture({ fixture: { date: '2026-11-28T21:00:00+01:00' } });
    const { payload } = transformFixtures([item], '2026-11-28');
    assert.equal(payload.fixtures[0].kickoff_at, '2026-11-28T20:00:00.000Z');
  });

  it('ignore les entrées incomplètes sans tout faire échouer', () => {
    const broken = [
      {},
      apiFixture({ fixture: { id: 'abc' } }),
      apiFixture({ fixture: { date: 'pas une date' } }),
      apiFixture({ teams: { home: { id: 1, name: '' }, away: { id: 2, name: 'B' } } }),
    ];
    const { payload, skipped } = transformFixtures([...broken, apiFixture()], '2026-11-28');
    assert.equal(skipped, 4);
    assert.equal(payload.fixtures.length, 1);
    assert.deepEqual(transformFixtures(null, '2026-11-28').payload.fixtures, []);
  });
});
