// Recherche des coordonnées précises des stades qui n'en ont pas encore
// (ou seulement celles du centre-ville) : Wikidata d'abord, Nominatim ensuite.

import { MIN_INTERVAL_MS, nominatimSearch, pickStadium } from './nominatim.mjs';
import { createAdmin, supabaseConfig } from './supabase-admin.mjs';
import { userAgent } from './user-agent.mjs';
import { findStadium } from './wikidata.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ env: Record<string, string | undefined>, fetch?: typeof fetch, now?: () => number,
 *           sleep?: (ms: number) => Promise<void>, limit?: number, nominatimLimit?: number,
 *           deadlineMs?: number }} deps
 */
export async function runLocateVenues({
  env,
  fetch = globalThis.fetch,
  now = Date.now,
  sleep = wait,
  limit = 8,
  nominatimLimit = 4,
  deadlineMs,
}) {
  const admin = createAdmin({ ...supabaseConfig(env), fetch });
  const agent = userAgent(env);
  const startedAt = now();
  const report = { wikidata: 0, nominatim: 0, notFound: 0, deferred: 0, errors: 0 };
  let nominatimCalls = 0;
  let lastNominatimAt = 0;

  await admin.rpc('apply_venue_overrides');
  const venues = (await admin.rpc('venues_to_locate', { max_results: limit })) ?? [];

  const save = (venue, found, source) =>
    admin.rpc('set_venue_coords', {
      p_venue_id: venue.id,
      p_lat: found.lat,
      p_lng: found.lng,
      p_source: source,
      p_confidence: found.confidence,
      p_wikidata_id: found.wikidataId ?? null,
    });

  for (const venue of venues) {
    if (deadlineMs && now() - startedAt > deadlineMs) break;
    const cityPoint =
      venue.city_lat != null && venue.city_lng != null
        ? { lat: venue.city_lat, lng: venue.city_lng }
        : null;

    try {
      const fromWikidata = await findStadium(
        { name: venue.name, cityPoint },
        { fetch, userAgent: agent },
      );
      if (fromWikidata) {
        await save(venue, fromWikidata, 'wikidata');
        report.wikidata += 1;
        continue;
      }

      if (nominatimCalls >= nominatimLimit) {
        // Budget Nominatim épuisé pour ce passage : le stade sera repris au suivant.
        report.deferred += 1;
        continue;
      }
      const pause = lastNominatimAt + MIN_INTERVAL_MS - now();
      if (pause > 0) await sleep(pause);
      nominatimCalls += 1;
      lastNominatimAt = now();
      const results = await nominatimSearch(
        [venue.name, venue.city, venue.country].filter(Boolean).join(', '),
        { fetch, userAgent: agent, baseUrl: env.GEOCODER_URL },
      );
      const fromNominatim = pickStadium(results, cityPoint);
      if (fromNominatim) {
        await save(venue, fromNominatim, 'nominatim');
        report.nominatim += 1;
      } else {
        await admin.rpc('mark_venue_checked', { p_venue_id: venue.id });
        report.notFound += 1;
      }
    } catch (error) {
      console.error(`Coordonnées de « ${venue.name} » : ${error.message}`);
      report.errors += 1;
    }
  }

  await admin.upsert('sync_runs', {
    kind: 'venue-coords',
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(now()).toISOString(),
    ok: report.errors === 0,
    requests_used: nominatimCalls,
    details: report,
  });
  return report;
}
