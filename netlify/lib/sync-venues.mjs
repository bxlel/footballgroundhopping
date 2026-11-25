// Détails des stades (adresse, capacité, pelouse) : quelques pays par passage.
// 5 pays par jour = 5 requêtes, en plus des 72 de la synchronisation des matchs.

import { ApiFootballError, fetchVenuesByCountry } from './api-football.mjs';
import { createAdmin, supabaseConfig } from './supabase-admin.mjs';
import { transformVenues } from './transform.mjs';

export async function runVenueDetailsSync({
  env,
  fetch = globalThis.fetch,
  now = Date.now,
  limit = 5,
}) {
  const admin = createAdmin({ ...supabaseConfig(env), fetch });
  const startedAt = now();
  const report = { countries: [], requests: 0, quotaRemaining: null, stopped: null };

  const rows = (await admin.rpc('countries_to_sync', { max_results: limit })) ?? [];
  for (const { country } of rows) {
    try {
      const { response, quota } = await fetchVenuesByCountry(country, {
        apiKey: env.API_FOOTBALL_KEY,
        fetch,
      });
      report.requests += 1;
      if (quota.dailyRemaining !== null) report.quotaRemaining = quota.dailyRemaining;
      const updated = await admin.rpc('ingest_venue_details', {
        payload: transformVenues(response, country),
      });
      report.countries.push({ country, received: response.length, updated });
    } catch (error) {
      if (error instanceof ApiFootballError && (error.kind === 'quota' || error.kind === 'plan')) {
        report.stopped = error.kind;
        report.error = error.message;
        break;
      }
      throw error;
    }
  }

  await admin.upsert('sync_runs', {
    kind: 'venue-details',
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(now()).toISOString(),
    ok: report.stopped === null,
    requests_used: report.requests,
    quota_remaining: report.quotaRemaining,
    details: report,
  });
  return report;
}
