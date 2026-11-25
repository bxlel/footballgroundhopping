// Synchronisation des matchs : quelques journées par passage, en surveillant le quota.
//
// Budget (plan gratuit API-Football : 100 requêtes/jour) :
//   1 requête = tous les matchs du monde pour une journée.
//   3 journées par passage × 24 passages/jour = 72 requêtes/jour.
// Chaque journée des 21 prochains jours est donc rafraîchie 3 à 4 fois par jour,
// et les 3 prochains jours deux fois plus souvent (voir la fonction SQL `days_to_sync`).

import { ApiFootballError, fetchFixturesByDate } from './api-football.mjs';
import { createAdmin, supabaseConfig } from './supabase-admin.mjs';
import { transformFixtures } from './transform.mjs';

export const DEFAULTS = {
  daysAhead: 21,
  daysPerRun: 3,
  /** On garde toujours quelques requêtes pour un rattrapage manuel. */
  quotaReserve: 10,
};

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readOptions(env) {
  return {
    daysAhead: toPositiveInt(env.SYNC_DAYS_AHEAD, DEFAULTS.daysAhead),
    daysPerRun: toPositiveInt(env.SYNC_DAYS_PER_RUN, DEFAULTS.daysPerRun),
    quotaReserve: toPositiveInt(env.SYNC_QUOTA_RESERVE, DEFAULTS.quotaReserve),
  };
}

/**
 * Synchronise les journées les plus en retard.
 * @param {{ env: Record<string, string | undefined>, fetch?: typeof fetch, now?: () => number,
 *           deadlineMs?: number, options?: Partial<typeof DEFAULTS> }} deps
 */
export async function runFixturesSync({
  env,
  fetch = globalThis.fetch,
  now = Date.now,
  deadlineMs,
  options,
}) {
  const settings = { ...readOptions(env), ...options };
  const admin = createAdmin({ ...supabaseConfig(env), fetch });
  const startedAt = now();
  const report = { days: [], requests: 0, quotaRemaining: null, stopped: null };

  const rows = await admin.rpc('days_to_sync', {
    days_ahead: settings.daysAhead,
    max_results: settings.daysPerRun,
  });

  for (const { day } of rows ?? []) {
    if (deadlineMs && now() - startedAt > deadlineMs) {
      report.stopped = 'deadline';
      break;
    }
    if (report.quotaRemaining !== null && report.quotaRemaining <= settings.quotaReserve) {
      report.stopped = 'quota-reserve';
      break;
    }

    try {
      const { response, quota } = await fetchFixturesByDate(day, {
        apiKey: env.API_FOOTBALL_KEY,
        fetch,
      });
      report.requests += 1;
      if (quota.dailyRemaining !== null) report.quotaRemaining = quota.dailyRemaining;

      const { payload, skipped } = transformFixtures(response, day);
      const result = await admin.rpc('ingest_fixtures', { payload });
      report.days.push({ day, fixtures: payload.fixtures.length, skipped, ...result });
    } catch (error) {
      if (error instanceof ApiFootballError && (error.kind === 'quota' || error.kind === 'plan')) {
        // Quota épuisé ou date hors plan : inutile d'insister sur les journées suivantes.
        report.stopped = error.kind;
        report.error = error.message;
        break;
      }
      throw error;
    }
  }

  await admin.upsert('sync_runs', {
    kind: 'fixtures',
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(now()).toISOString(),
    ok: report.stopped === null || report.stopped === 'deadline',
    requests_used: report.requests,
    quota_remaining: report.quotaRemaining,
    details: report,
  });

  return report;
}
