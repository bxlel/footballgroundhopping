// Faux `fetch` pour les tests : chaque appel est routé vers le premier gestionnaire qui correspond.

export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * @param {Array<[RegExp | string, (url: URL, init: RequestInit) => Response | Promise<Response>]>} routes
 */
export function fakeFetch(routes) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    for (const [pattern, handler] of routes) {
      const matches =
        typeof pattern === 'string' ? url.href.includes(pattern) : pattern.test(url.href);
      if (matches) return handler(url, init);
    }
    throw new Error(`Appel inattendu : ${url.href}`);
  };
  fetch.calls = calls;
  fetch.callsTo = (fragment) => calls.filter((call) => call.url.href.includes(fragment));
  return fetch;
}

export const ENV = {
  API_FOOTBALL_KEY: 'test-key',
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  CONTACT_EMAIL: 'contact@example.test',
  URL: 'https://spotthegame.example.test',
};

/** Un match au format API-Football, avec des valeurs par défaut réalistes. */
export function apiFixture(overrides = {}) {
  return {
    fixture: {
      id: 1001,
      date: '2026-11-28T20:00:00+00:00',
      venue: { id: 652, name: 'Stade Bollaert-Delelis', city: 'Lens' },
      status: { short: 'NS' },
      ...overrides.fixture,
    },
    league: {
      id: 61,
      name: 'Ligue 1',
      country: 'France',
      logo: 'https://media.example.test/leagues/61.png',
      season: 2026,
      round: 'Regular Season - 14',
      ...overrides.league,
    },
    teams: {
      home: { id: 116, name: 'Lens', logo: 'https://media.example.test/teams/116.png' },
      away: { id: 79, name: 'Lille', logo: 'https://media.example.test/teams/79.png' },
      ...overrides.teams,
    },
  };
}
