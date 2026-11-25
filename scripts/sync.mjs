// Lance une synchronisation à la main, sans la limite de 30 s des fonctions planifiées.
//
//   npm run sync -- fixtures            # les journées les plus en retard (3 par défaut)
//   npm run sync -- fixtures --days 21  # première mise en place : 21 requêtes API-Football
//   npm run sync -- coords --limit 200  # coordonnées de 200 stades (1 requête Nominatim/s)
//   npm run sync -- venues --limit 10   # adresse et capacité des stades de 10 pays
//
// Variables : voir le README (API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONTACT_EMAIL).

import { runLocateVenues } from '../netlify/lib/locate-venues.mjs';
import { runFixturesSync } from '../netlify/lib/sync-fixtures.mjs';
import { runVenueDetailsSync } from '../netlify/lib/sync-venues.mjs';

const [command, ...rest] = process.argv.slice(2);

function option(name, fallback) {
  const index = rest.indexOf(`--${name}`);
  const value = index >= 0 ? Number.parseInt(rest[index + 1], 10) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

let report;
if (command === 'fixtures') {
  const days = option('days', undefined);
  report = await runFixturesSync({
    env: process.env,
    options: days ? { daysPerRun: days, daysAhead: Math.max(days, 21) } : undefined,
  });
} else if (command === 'coords') {
  const limit = option('limit', 50);
  report = await runLocateVenues({ env: process.env, limit, nominatimLimit: limit });
} else if (command === 'venues') {
  report = await runVenueDetailsSync({ env: process.env, limit: option('limit', 5) });
} else {
  console.error('Usage : npm run sync -- <fixtures|coords|venues> [--days N] [--limit N]');
  process.exit(1);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
