// GET /.netlify/functions/health : état du service, pour un outil de surveillance
// (UptimeRobot, Better Stack…). Répond 200 si la base répond et que les matchs ont été
// synchronisés récemment, 503 sinon.

import { createAdmin, supabaseConfig } from '../lib/supabase-admin.mjs';

/** Au-delà, la synchronisation horaire a manqué plusieurs passages. */
export const MAX_SYNC_AGE_HOURS = 6;

export async function handle({ env = process.env, fetch = globalThis.fetch, now = Date.now } = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });

  try {
    const admin = createAdmin({ ...supabaseConfig(env), fetch });
    const [status] = (await admin.rpc('data_status')) ?? [];
    const syncedAt = status?.fixtures_synced_at
      ? Date.parse(status.fixtures_synced_at)
      : Number.NaN;
    if (Number.isNaN(syncedAt)) return reply(503, { ok: false, reason: 'jamais synchronisé' });

    const ageHours = Math.round(((now() - syncedAt) / 3_600_000) * 10) / 10;
    const ok = ageHours <= MAX_SYNC_AGE_HOURS;
    return reply(ok ? 200 : 503, {
      ok,
      ...(ok ? {} : { reason: 'synchronisation en retard' }),
      syncAgeHours: ageHours,
      upcomingFixtures: status.upcoming_fixtures ?? null,
    });
  } catch (error) {
    console.error(`Santé : ${error.message}`);
    return reply(503, { ok: false, reason: 'base injoignable' });
  }
}

export default () => handle();
