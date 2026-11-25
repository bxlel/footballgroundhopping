// GET /.netlify/functions/geocode?q=<adresse> : transforme une adresse ou un nom d'hôtel en coordonnées.
// Appelée une seule fois, à la validation du formulaire (jamais pour l'autocomplétion).
// Règles : un seul paramètre accepté et validé, origine vérifiée, pas de CORS ouvert,
// résultats mis en cache sur le CDN et définitivement en base.

import { MIN_INTERVAL_MS, nominatimSearch, pickAddress } from '../lib/nominatim.mjs';
import { createAdmin, supabaseConfig } from '../lib/supabase-admin.mjs';
import { searchKey } from '../lib/text.mjs';
import { userAgent } from '../lib/user-agent.mjs';

const MIN_LENGTH = 3;
const MAX_LENGTH = 120;
const CACHE_SECONDS = 30 * 24 * 3600;

let lastCallAt = 0;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function allowedOrigins(env) {
  const fromEnv = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...fromEnv, env.URL, env.DEPLOY_PRIME_URL].filter(Boolean);
}

const cacheHeaders = {
  'Cache-Control': 'public, max-age=3600',
  'Netlify-CDN-Cache-Control': `public, s-maxage=${CACHE_SECONDS}`,
};

export async function handle(
  request,
  { env = process.env, fetch = globalThis.fetch, now = Date.now } = {},
) {
  if (request.method !== 'GET') {
    return json(405, { error: 'Méthode non autorisée' }, { Allow: 'GET' });
  }

  const origin = request.headers.get('origin');
  const allowed = allowedOrigins(env);
  if (origin && allowed.length && !allowed.includes(origin)) {
    return json(403, { error: 'Origine non autorisée' });
  }

  const params = new URL(request.url).searchParams;
  const names = [...params.keys()];
  const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim();
  if (names.some((name) => name !== 'q') || q.length < MIN_LENGTH || q.length > MAX_LENGTH) {
    return json(400, { error: 'Paramètre q invalide' });
  }

  const key = searchKey(q);
  if (key.length < MIN_LENGTH) return json(400, { error: 'Paramètre q invalide' });

  try {
    const admin = createAdmin({ ...supabaseConfig(env), fetch });
    const cached = await admin.select(
      'geocode_cache',
      `query_key=eq.${encodeURIComponent(key)}&select=found,name,detail,lat,lng`,
    );
    if (cached?.length) {
      const row = cached[0];
      const place = row.found
        ? { kind: 'address', name: row.name, detail: row.detail, lat: row.lat, lng: row.lng }
        : null;
      return json(200, { place }, cacheHeaders);
    }

    // Garde-fou local ; le cache CDN et la base absorbent l'essentiel du trafic.
    if (now() - lastCallAt < MIN_INTERVAL_MS) {
      return json(429, { error: 'Réessaie dans une seconde' }, { 'Retry-After': '1' });
    }
    lastCallAt = now();

    const results = await nominatimSearch(q, {
      fetch,
      userAgent: userAgent(env),
      baseUrl: env.GEOCODER_URL,
      limit: 1,
    });
    const place = pickAddress(results);
    await admin.upsert(
      'geocode_cache',
      {
        query_key: key,
        found: place !== null,
        name: place?.name ?? null,
        detail: place?.detail ?? null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        provider: env.GEOCODER_URL ? 'custom' : 'nominatim',
      },
      'query_key',
    );
    return json(200, { place }, cacheHeaders);
  } catch (error) {
    console.error(`Géocodage : ${error.message}`);
    return json(502, { error: 'Géocodage indisponible' });
  }
}

/** Remet à zéro le garde-fou de débit (tests). */
export function resetRateLimit() {
  lastCallAt = 0;
}

// L'URL par défaut (/.netlify/functions/geocode) est gardée exprès : le rendu serveur
// d'Angular intercepte tous les autres chemins avant les fonctions.
export default (request) => handle(request);
