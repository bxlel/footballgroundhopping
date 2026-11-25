// Lecture des fichiers GeoNames (licence CC BY 4.0) pour remplir la table `places`.
// Formats : https://download.geonames.org/export/dump/readme.txt

import { searchKey } from './text.mjs';

/** countryInfo.txt -> Map(code ISO -> nom du pays). */
export function parseCountries(text) {
  const countries = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols[0] && cols[4]) countries.set(cols[0], cols[4]);
  }
  return countries;
}

/** admin1CodesASCII.txt -> Map(« FR.32 » -> « Hauts-de-France »). */
export function parseAdmin1(text) {
  const regions = new Map();
  for (const line of text.split('\n')) {
    const cols = line.split('\t');
    if (cols[0] && cols[1]) regions.set(cols[0], cols[1]);
  }
  return regions;
}

/** Une ligne de cities*.txt -> une ligne de la table `places`, ou null si elle est inutilisable. */
export function parseCity(line, countries, regions) {
  const cols = line.split('\t');
  if (cols.length < 18) return null;
  const [id, name, asciiName, altNames, lat, lng] = cols;
  const countryCode = cols[8];
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!/^\d+$/.test(id) || !name || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const mainKey = searchKey(asciiName || name);
  const alternates = new Set();
  for (const alt of altNames.split(',')) {
    const key = searchKey(alt);
    // Les noms non latins donnent une clé vide : ils ne servent pas à la recherche.
    if (key && key !== mainKey) alternates.add(key);
  }

  return {
    geoname_id: Number(id),
    name,
    search_name: mainKey,
    alt_names: alternates.size ? `,${[...alternates].join(',')},` : '',
    country_code: countryCode,
    country_name: countries.get(countryCode) ?? '',
    admin1: regions.get(`${countryCode}.${cols[10]}`) ?? '',
    population: Number.parseInt(cols[14], 10) || 0,
    timezone: cols[17] || null,
    location: `SRID=4326;POINT(${longitude} ${latitude})`,
  };
}
