// Recherche des coordonnées d'un stade dans Wikidata (propriété P625, licence CC0).
// Deux appels à l'API MediaWiki par stade : recherche par nom, puis lecture des candidats.

import { haversineKm, isValidPoint } from './geo.mjs';
import { searchKey } from './text.mjs';

const API = 'https://www.wikidata.org/w/api.php';

/** Types Wikidata (P31) qui désignent une enceinte sportive. */
const VENUE_TYPES = new Set([
  'Q483110', // stade
  'Q1154710', // stade de football
  'Q1076486', // équipement sportif
]);
const VENUE_WORDS =
  /\b(stadium|stadion|stade|estadio|stadio|arena|football ground|sports venue|ground)\b/;

/** Au-delà, un candidat est considéré comme un homonyme situé ailleurs. */
export const MAX_KM_FROM_CITY = 60;
/** Confiance minimale pour accepter des coordonnées Wikidata. */
export const MIN_CONFIDENCE = 0.7;

/** Part des mots du nom du stade retrouvés dans le libellé du candidat (0 à 1). */
export function nameSimilarity(a, b) {
  const wordsA = new Set(searchKey(a).split(' ').filter(Boolean));
  const wordsB = new Set(searchKey(b).split(' ').filter(Boolean));
  if (!wordsA.size || !wordsB.size) return 0;
  let common = 0;
  for (const word of wordsA) if (wordsB.has(word)) common += 1;
  return common / Math.max(wordsA.size, wordsB.size);
}

/**
 * Note un candidat Wikidata pour un stade : type d'entité, ressemblance du nom,
 * proximité avec la ville attendue. Rend 0 si le candidat est à écarter.
 */
export function scoreCandidate(venue, candidate) {
  if (!isValidPoint(candidate.point)) return 0;

  let near = 0;
  if (isValidPoint(venue.cityPoint)) {
    const km = haversineKm(venue.cityPoint, candidate.point);
    if (km > MAX_KM_FROM_CITY) return 0;
    near = km <= 25 ? 0.3 : 0.15;
  }

  const isVenue =
    candidate.types.some((type) => VENUE_TYPES.has(type)) ||
    VENUE_WORDS.test(searchKey(candidate.description));
  const names = [candidate.label, ...(candidate.aliases ?? [])];
  const similarity = Math.max(0, ...names.map((name) => nameSimilarity(venue.name, name)));

  const score = (isVenue ? 0.4 : 0.15) + 0.3 * similarity + near;
  return Math.round(score * 100) / 100;
}

function readCandidate(entity) {
  const claims = entity?.claims ?? {};
  const coords = claims.P625?.[0]?.mainsnak?.datavalue?.value;
  return {
    id: entity?.id,
    label: entity?.labels?.en?.value ?? Object.values(entity?.labels ?? {})[0]?.value ?? '',
    aliases: Object.values(entity?.aliases ?? {})
      .flat()
      .map((alias) => alias.value),
    description: entity?.descriptions?.en?.value ?? '',
    types: (claims.P31 ?? []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean),
    point: coords ? { lat: coords.latitude, lng: coords.longitude } : null,
  };
}

async function call(params, { fetch, userAgent }) {
  const query = new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(`${API}?${query}`, { headers: { 'User-Agent': userAgent } });
  if (!res.ok) throw new Error(`Wikidata a répondu ${res.status}`);
  return res.json();
}

/**
 * Cherche un stade par son nom.
 * @param {{ name: string, cityPoint?: { lat: number, lng: number } | null }} venue
 * @returns {Promise<{ lat: number, lng: number, confidence: number, wikidataId: string } | null>}
 */
export async function findStadium(venue, deps) {
  const search = await call(
    { action: 'wbsearchentities', search: venue.name, language: 'en', type: 'item', limit: '7' },
    deps,
  );
  const ids = (search?.search ?? []).map((hit) => hit.id).filter(Boolean);
  if (!ids.length) return null;

  const details = await call(
    {
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims|labels|aliases|descriptions',
      languages: 'en|fr',
    },
    deps,
  );

  let best = null;
  for (const entity of Object.values(details?.entities ?? {})) {
    const candidate = readCandidate(entity);
    const confidence = scoreCandidate(venue, candidate);
    if (confidence >= MIN_CONFIDENCE && (!best || confidence > best.confidence)) {
      best = { ...candidate.point, confidence, wikidataId: candidate.id };
    }
  }
  return best;
}
