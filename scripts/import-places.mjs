// Remplit la table `places` à partir des fichiers GeoNames.
//
//   mkdir -p tmp/geonames && cd tmp/geonames
//   curl -O https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
//   curl -O https://download.geonames.org/export/dump/countryInfo.txt
//   curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt
//   cd ../.. && npm run import:places -- tmp/geonames
//
// À relancer une ou deux fois par an. Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAdmin1, parseCity, parseCountries } from '../netlify/lib/geonames.mjs';
import { createAdmin, supabaseConfig } from '../netlify/lib/supabase-admin.mjs';

const BATCH = 500;

const dir = process.argv[2];
if (!dir) {
  console.error('Usage : npm run import:places -- <dossier des fichiers GeoNames>');
  process.exit(1);
}

const citiesFile = process.argv[3] ?? 'cities15000.txt';
const [cities, countriesText, admin1Text] = await Promise.all([
  readFile(join(dir, citiesFile), 'utf8'),
  readFile(join(dir, 'countryInfo.txt'), 'utf8'),
  readFile(join(dir, 'admin1CodesASCII.txt'), 'utf8'),
]);

const countries = parseCountries(countriesText);
const regions = parseAdmin1(admin1Text);
const rows = cities
  .split('\n')
  .map((line) => parseCity(line, countries, regions))
  .filter(Boolean);

const admin = createAdmin(supabaseConfig(process.env));
for (let i = 0; i < rows.length; i += BATCH) {
  await admin.upsert('places', rows.slice(i, i + BATCH), 'geoname_id');
  process.stdout.write(`\r${Math.min(i + BATCH, rows.length)} / ${rows.length} villes`);
}
process.stdout.write('\n');

// Les stades déjà connus profitent tout de suite des nouvelles villes.
const located = await admin.rpc('apply_city_fallback');
process.stdout.write(`${located} stade(s) situé(s) au centre de leur ville en attendant mieux.\n`);
