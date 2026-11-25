import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handle as health } from '../../netlify/functions/health.mjs';
import { notify, syncProblem } from '../../netlify/lib/alert.mjs';
import { apiFootball } from '../../netlify/lib/api-football.mjs';
import { ENV, fakeFetch, jsonResponse } from './helpers.mjs';

const noWait = { retryDelayMs: 0, sleep: async () => {} };

describe('API-Football : relance', () => {
  it('relance une fois après une panne passagère', async () => {
    let calls = 0;
    const fetch = fakeFetch([
      [
        'api-sports.io',
        () =>
          calls++ === 0
            ? new Response('', { status: 503 })
            : jsonResponse({ errors: [], response: [] }),
      ],
    ]);
    const { response } = await apiFootball(
      '/fixtures',
      { date: '2026-11-28' },
      { apiKey: 'k', fetch, retry: noWait },
    );
    assert.deepEqual(response, []);
    assert.equal(fetch.calls.length, 2);
  });

  it('relance une fois après une coupure réseau, puis abandonne', async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      throw new Error('réseau coupé');
    };
    await assert.rejects(
      apiFootball('/fixtures', { date: '2026-11-28' }, { apiKey: 'k', fetch, retry: noWait }),
      /injoignable/,
    );
    assert.equal(calls, 2);
  });

  it('ne relance pas une réponse définitive', async () => {
    const fetch = fakeFetch([['api-sports.io', () => new Response('', { status: 500 })]]);
    await assert.rejects(
      apiFootball('/fixtures', { date: '2026-11-28' }, { apiKey: 'k', fetch, retry: noWait }),
      /a répondu 500/,
    );
    assert.equal(fetch.calls.length, 1);
  });
});

describe('alertes', () => {
  it('ne fait rien sans webhook configuré', async () => {
    const fetch = fakeFetch([]);
    assert.equal(await notify({}, 'panne', { fetch }), false);
    assert.equal(fetch.calls.length, 0);
  });

  it('envoie un message lisible par Slack et par Discord', async () => {
    const fetch = fakeFetch([['hooks.example.test', () => new Response('ok')]]);
    const sent = await notify(
      { ALERT_WEBHOOK_URL: 'https://hooks.example.test/x' },
      'quota épuisé',
      { fetch },
    );
    assert.equal(sent, true);
    assert.deepEqual(fetch.calls[0].body, {
      text: 'Spot the Game — quota épuisé',
      content: 'Spot the Game — quota épuisé',
    });
  });

  it('n’échoue jamais, même si le webhook est en panne', async () => {
    const fetch = async () => {
      throw new Error('hors ligne');
    };
    assert.equal(
      await notify({ ALERT_WEBHOOK_URL: 'https://hooks.example.test/x' }, 'panne', { fetch }),
      false,
    );
  });

  it('ne signale que les passages à problème', () => {
    assert.equal(syncProblem('Matchs', { stopped: null, errors: 0 }), null);
    assert.equal(syncProblem('Matchs', { stopped: 'deadline' }), null);
    assert.match(
      syncProblem('Matchs', { stopped: 'quota', error: 'limit' }),
      /quota API-Football épuisé/,
    );
    assert.match(syncProblem('Matchs', { stopped: 'plan' }), /plan API-Football/);
    assert.match(syncProblem('Stades', { errors: 2 }), /2 erreur/);
  });
});

describe('GET /.netlify/functions/health', () => {
  const NOW = Date.parse('2026-11-25T12:00:00Z');
  const run = (rows) =>
    health({
      env: ENV,
      now: () => NOW,
      fetch: fakeFetch([['rpc/data_status', () => jsonResponse(rows)]]),
    });

  it('répond 200 quand la synchronisation est récente', async () => {
    const res = await run([
      { fixtures_synced_at: '2026-11-25T11:05:00Z', upcoming_fixtures: 5120 },
    ]);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, syncAgeHours: 0.9, upcomingFixtures: 5120 });
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('répond 503 quand la synchronisation est en retard ou n’a jamais eu lieu', async () => {
    const late = await run([{ fixtures_synced_at: '2026-11-25T02:00:00Z', upcoming_fixtures: 10 }]);
    assert.equal(late.status, 503);
    assert.equal((await late.json()).reason, 'synchronisation en retard');
    assert.equal((await run([{ fixtures_synced_at: null }])).status, 503);
  });

  it('répond 503 quand la base est injoignable', async () => {
    const fetch = fakeFetch([['rpc/data_status', () => new Response('boom', { status: 500 })]]);
    const res = await health({ env: ENV, fetch });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).reason, 'base injoignable');
  });
});
