// Client API-Football, côté serveur uniquement.
// Mêmes règles que l'ancien proxy : routes et paramètres en liste blanche, validation,
// clé jamais exposée. Il n'est plus appelé par le navigateur, seulement par la synchronisation.

const UPSTREAM = 'https://v3.football.api-sports.io';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Routes autorisées et validation de leurs paramètres. */
const ROUTES = {
  '/fixtures': {
    params: { date: (v) => ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) },
    required: ['date'],
  },
  '/venues': {
    params: { country: (v) => /^[\p{L} .'-]{2,40}$/u.test(v) },
    required: ['country'],
  },
};

export class ApiFootballError extends Error {
  /** @param {'quota' | 'plan' | 'config' | 'upstream'} kind */
  constructor(kind, message) {
    super(message);
    this.name = 'ApiFootballError';
    this.kind = kind;
  }
}

function toInt(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Lit le quota restant dans les en-têtes de réponse. */
export function readQuota(headers) {
  return {
    dailyLimit: toInt(headers.get('x-ratelimit-requests-limit')),
    dailyRemaining: toInt(headers.get('x-ratelimit-requests-remaining')),
    minuteRemaining: toInt(headers.get('x-ratelimit-remaining')),
  };
}

/** API-Football répond 200 même en erreur : le détail est dans `errors`. */
export function classifyErrors(errors) {
  const entries = Array.isArray(errors) ? [] : Object.entries(errors ?? {});
  if (!entries.length) return null;
  const text = entries.map(([key, value]) => `${key}: ${value}`).join(' ; ');
  if (/limit|quota|too many/i.test(text)) return new ApiFootballError('quota', text);
  if (/plan|subscription|do not have access/i.test(text)) return new ApiFootballError('plan', text);
  if (/token|key/i.test(text)) return new ApiFootballError('config', text);
  return new ApiFootballError('upstream', text);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Une seule relance, et seulement sur une panne passagère (réseau coupé, 502/503/504) :
 * chaque requête compte dans le quota, on ne s'acharne pas.
 */
async function fetchWithRetry(fetch, url, init, { retryDelayMs = 800, sleep = wait } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (attempt === 0 && [502, 503, 504].includes(res.status)) {
        await sleep(retryDelayMs);
        continue;
      }
      return res;
    } catch (error) {
      if (attempt > 0)
        throw new ApiFootballError('upstream', `API-Football injoignable : ${error.message}`);
      await sleep(retryDelayMs);
    }
  }
}

/**
 * Appelle une route autorisée.
 * @returns {Promise<{ response: unknown[], quota: ReturnType<typeof readQuota> }>}
 */
export async function apiFootball(path, params, { apiKey, fetch = globalThis.fetch, retry }) {
  const route = ROUTES[path];
  if (!route) throw new ApiFootballError('config', `Route non autorisée : ${path}`);
  if (!apiKey) throw new ApiFootballError('config', 'API_FOOTBALL_KEY manquante');

  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params ?? {})) {
    const validate = route.params[name];
    if (!validate || typeof value !== 'string' || !validate(value)) {
      throw new ApiFootballError('config', `Paramètre refusé : ${name}`);
    }
    query.set(name, value);
  }
  for (const name of route.required) {
    if (!query.has(name)) throw new ApiFootballError('config', `Paramètre manquant : ${name}`);
  }

  const res = await fetchWithRetry(
    fetch,
    `${UPSTREAM}${path}?${query}`,
    { headers: { 'x-apisports-key': apiKey } },
    retry,
  );
  const quota = readQuota(res.headers);
  if (res.status === 429) throw new ApiFootballError('quota', 'Trop de requêtes (429)');
  if (!res.ok) throw new ApiFootballError('upstream', `API-Football a répondu ${res.status}`);

  const body = await res.json();
  const error = classifyErrors(body?.errors);
  if (error) throw error;
  return { response: Array.isArray(body?.response) ? body.response : [], quota };
}

/** Tous les stades d'un pays, avec adresse et capacité : une seule requête. */
export function fetchVenuesByCountry(country, options) {
  // API-Football écrit les pays avec des tirets (« Costa-Rica »).
  return apiFootball('/venues', { country: country.trim().replace(/\s+/g, '-') }, options);
}

/** Tous les matchs du monde pour une journée (UTC) : une seule requête. */
export function fetchFixturesByDate(day, options) {
  return apiFootball('/fixtures', { date: day }, options);
}
