import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiFootballError, apiFootball, classifyErrors } from '../../netlify/lib/api-football.mjs';
import { readOptions, runFixturesSync } from '../../netlify/lib/sync-fixtures.mjs';
import { apiFixture, ENV, fakeFetch, jsonResponse } from './helpers.mjs';

const quotaHeaders = (remaining) => ({
  'x-ratelimit-requests-limit': '100',
  'x-ratelimit-requests-remaining': String(remaining),
});

describe('apiFootball', () => {
  it('refuse les routes et paramètres hors liste blanche', async () => {
    const fetch = fakeFetch([]);
    const options = { apiKey: 'k', fetch };
    await assert.rejects(apiFootball('/players', {}, options), /Route non autorisée/);
    await assert.rejects(apiFootball('/fixtures', { date: '28/11/2026' }, options), /refusé/);
    await assert.rejects(
      apiFootball('/fixtures', { date: '2026-11-28', league: '61' }, options),
      /refusé/,
    );
    await assert.rejects(apiFootball('/fixtures', {}, options), /manquant/);
    await assert.rejects(
      apiFootball('/fixtures', { date: '2026-11-28' }, { fetch }),
      /API_FOOTBALL_KEY/,
    );
    assert.equal(fetch.calls.length, 0);
  });

  it('envoie la clé en en-tête et lit le quota restant', async () => {
    const fetch = fakeFetch([
      [
        'api-sports.io',
        () => jsonResponse({ errors: [], response: [apiFixture()] }, { headers: quotaHeaders(57) }),
      ],
    ]);
    const { response, quota } = await apiFootball(
      '/fixtures',
      { date: '2026-11-28' },
      { apiKey: 'k', fetch },
    );
    assert.equal(response.length, 1);
    assert.equal(quota.dailyRemaining, 57);
    assert.equal(fetch.calls[0].init.headers['x-apisports-key'], 'k');
    assert.equal(fetch.calls[0].url.searchParams.get('date'), '2026-11-28');
  });

  it('classe les erreurs renvoyées avec un statut 200', () => {
    assert.equal(classifyErrors([]), null);
    assert.equal(classifyErrors({}), null);
    assert.equal(
      classifyErrors({ requests: 'You have reached the request limit for the day' }).kind,
      'quota',
    );
    assert.equal(
      classifyErrors({ plan: 'Free plans do not have access to this date' }).kind,
      'plan',
    );
    assert.equal(classifyErrors({ token: 'Error/Missing application key' }).kind, 'config');
    assert.ok(classifyErrors({ bug: 'x' }) instanceof ApiFootballError);
  });
});

describe('runFixturesSync', () => {
  function setup({ days, remaining = [90, 89, 88], apiBody } = {}) {
    let call = 0;
    return fakeFetch([
      ['rpc/days_to_sync', () => jsonResponse(days.map((day) => ({ day })))],
      [
        'api-sports.io',
        () =>
          jsonResponse(apiBody ?? { errors: [], response: [apiFixture()] }, {
            headers: quotaHeaders(remaining[call++]),
          }),
      ],
      [
        'rpc/ingest_fixtures',
        () => jsonResponse({ fixtures: 1, venues: 1, venues_located_by_city: 0 }),
      ],
      ['/sync_runs', () => new Response(null, { status: 201 })],
    ]);
  }

  it('synchronise les journées demandées et journalise le passage', async () => {
    const fetch = setup({ days: ['2026-11-28', '2026-11-29'] });
    const report = await runFixturesSync({ env: ENV, fetch });

    assert.equal(report.requests, 2);
    assert.equal(report.quotaRemaining, 89);
    assert.equal(report.stopped, null);
    assert.deepEqual(
      report.days.map((d) => [d.day, d.fixtures]),
      [
        ['2026-11-28', 1],
        ['2026-11-29', 1],
      ],
    );

    const ingest = fetch.callsTo('rpc/ingest_fixtures');
    assert.equal(ingest.length, 2);
    assert.equal(ingest[0].body.payload.day, '2026-11-28');
    assert.equal(ingest[0].init.headers.Authorization, 'Bearer service-key');

    const [run] = fetch.callsTo('/sync_runs');
    assert.equal(run.body.kind, 'fixtures');
    assert.equal(run.body.ok, true);
    assert.equal(run.body.requests_used, 2);
  });

  it('demande les journées avec les réglages lus dans l’environnement', async () => {
    const fetch = setup({ days: [] });
    await runFixturesSync({
      env: { ...ENV, SYNC_DAYS_AHEAD: '14', SYNC_DAYS_PER_RUN: '5' },
      fetch,
    });
    assert.deepEqual(fetch.callsTo('rpc/days_to_sync')[0].body, { days_ahead: 14, max_results: 5 });
    assert.deepEqual(readOptions({ SYNC_DAYS_AHEAD: 'abc' }), {
      daysAhead: 21,
      daysPerRun: 3,
      quotaReserve: 10,
    });
  });

  it('s’arrête avant d’entamer la réserve de quota', async () => {
    const fetch = setup({
      days: ['2026-11-28', '2026-11-29', '2026-11-30'],
      remaining: [10, 9, 8],
    });
    const report = await runFixturesSync({ env: ENV, fetch });
    assert.equal(report.requests, 1);
    assert.equal(report.stopped, 'quota-reserve');
  });

  it('s’arrête proprement quand le quota est épuisé ou la date hors plan', async () => {
    const fetch = setup({
      days: ['2026-12-10', '2026-12-11'],
      apiBody: { errors: { plan: 'Free plans do not have access to this date' }, response: [] },
    });
    const report = await runFixturesSync({ env: ENV, fetch });
    assert.equal(report.stopped, 'plan');
    assert.equal(fetch.callsTo('api-sports.io').length, 1);
    assert.equal(fetch.callsTo('rpc/ingest_fixtures').length, 0);
    assert.equal(fetch.callsTo('/sync_runs')[0].body.ok, false);
  });

  it('respecte le temps imparti', async () => {
    const fetch = setup({ days: ['2026-11-28', '2026-11-29'] });
    let clock = 0;
    const report = await runFixturesSync({
      env: ENV,
      fetch,
      now: () => (clock += 6000),
      deadlineMs: 10_000,
    });
    assert.equal(report.stopped, 'deadline');
    assert.equal(report.requests, 1);
  });

  it('échoue clairement sans configuration Supabase', async () => {
    await assert.rejects(runFixturesSync({ env: {}, fetch: fakeFetch([]) }), /SUPABASE_URL/);
  });
});
