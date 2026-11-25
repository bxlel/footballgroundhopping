// Faux Supabase pour les tests de bout en bout : il répond comme l'API REST du vrai projet
// (mêmes chemins, mêmes colonnes), avec un petit jeu de matchs placé sur les trois prochains jours.
// Il sert aussi à faire tourner le site en local sans base : voir le README.

import { createServer } from 'node:http';

const port = Number(process.env.FAKE_SUPABASE_PORT) || 54399;
const DAY_MS = 86_400_000;

/** Coup d'envoi dans `days` jours, à l'heure UTC indiquée : toujours dans les 7 prochains jours. */
function inDays(days, hourUtc, minute = 0) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hourUtc, minute),
  ).toISOString();
}

const VENUES = {
  bollaert: {
    slug: 'stade-bollaert-delelis-lens',
    name: 'Stade Bollaert-Delelis',
    city: 'Lens',
    country: 'France',
    address: 'Avenue Alfred Maes',
    capacity: 38223,
    surface: 'grass',
    lat: 50.4328,
    lng: 2.8149,
    timezone: 'Europe/Paris',
    approximate: false,
  },
  mauroy: {
    slug: 'stade-pierre-mauroy-villeneuve-d-ascq',
    name: 'Stade Pierre-Mauroy',
    city: "Villeneuve-d'Ascq",
    country: 'France',
    address: '261 Boulevard de Tournai',
    capacity: 50186,
    surface: 'grass',
    lat: 50.6119,
    lng: 3.1305,
    timezone: 'Europe/Paris',
    approximate: false,
  },
  arras: {
    slug: 'stade-degouve-brabant-arras',
    name: 'Stade Degouve-Brabant',
    city: 'Arras',
    country: 'France',
    address: null,
    capacity: 6200,
    surface: null,
    lat: 50.291,
    lng: 2.7775,
    timezone: 'Europe/Paris',
    approximate: true,
  },
  tournai: {
    slug: 'stade-luc-varenne-tournai',
    name: 'Stade Luc Varenne',
    city: 'Tournai',
    country: 'Belgium',
    address: null,
    capacity: 7552,
    surface: 'grass',
    lat: 50.6017,
    lng: 3.4106,
    timezone: 'Europe/Brussels',
    approximate: false,
  },
  paris: {
    slug: 'parc-des-princes-paris',
    name: 'Parc des Princes',
    city: 'Paris',
    country: 'France',
    address: '24 Rue du Commandant Guilbaud',
    capacity: 47929,
    surface: 'grass',
    lat: 48.8414,
    lng: 2.253,
    timezone: 'Europe/Paris',
    approximate: false,
  },
};

const team = (name, slug) => ({ name, slug, logo_url: null });
const TEAMS = {
  lens: { ...team('Lens', 'lens'), country: 'France', venue: 'bollaert' },
  lille: { ...team('Lille', 'lille'), country: 'France', venue: 'mauroy' },
  lyon: { ...team('Lyon', 'lyon'), country: 'France', venue: null },
  arras: { ...team('Arras', 'arras'), country: 'France', venue: 'arras' },
  calais: { ...team('Calais', 'calais'), country: 'France', venue: null },
  tournai: { ...team('Tournai', 'tournai'), country: 'Belgium', venue: 'tournai' },
  mons: { ...team('Mons', 'mons'), country: 'Belgium', venue: null },
  paris: {
    ...team('Paris Saint-Germain', 'paris-saint-germain'),
    country: 'France',
    venue: 'paris',
  },
  nantes: { ...team('Nantes', 'nantes'), country: 'France', venue: null },
};

let nextId = 1;
function fixture(home, away, venue, kickoff, competition, extra = {}) {
  const v = VENUES[venue];
  return {
    id: nextId++,
    slug: `${kickoff.slice(0, 10)}-${TEAMS[home].slug}-${TEAMS[away].slug}`,
    kickoff_at: kickoff,
    time_confirmed: true,
    status: 'scheduled',
    competition_name: competition.name,
    competition_country: competition.country,
    competition_level: competition.level,
    home_name: TEAMS[home].name,
    home_slug: TEAMS[home].slug,
    home_logo_url: null,
    away_name: TEAMS[away].name,
    away_slug: TEAMS[away].slug,
    away_logo_url: null,
    venue_name: v.name,
    venue_slug: v.slug,
    venue_city: v.city,
    venue_country: v.country,
    going_count: 0,
    venue_lat: v.lat,
    venue_lng: v.lng,
    venue_timezone: v.timezone,
    venue_approximate: v.approximate,
    ...extra,
  };
}

const LIGUE1 = { name: 'Ligue 1', country: 'France', level: 'top' };
const NATIONAL3 = { name: 'National 3', country: 'France', level: 'lower' };
const BELGIAN_CUP = { name: 'Coupe de Belgique', country: 'Belgium', level: 'cup' };

const FIXTURES = [
  fixture('lille', 'lyon', 'mauroy', inDays(1, 19, 45), LIGUE1),
  fixture('lens', 'lille', 'bollaert', inDays(2, 20, 0), LIGUE1),
  fixture('tournai', 'mons', 'tournai', inDays(2, 13, 30), BELGIAN_CUP),
  fixture('arras', 'calais', 'arras', inDays(3, 14, 0), NATIONAL3, { time_confirmed: false }),
  fixture('paris', 'nantes', 'paris', inDays(3, 19, 45), LIGUE1),
];

const PLACES = [
  { kind: 'city', name: 'Lens', detail: 'Hauts-de-France, France', lat: 50.4329, lng: 2.8279 },
  { kind: 'city', name: 'Lille', detail: 'Hauts-de-France, France', lat: 50.633, lng: 3.0586 },
  { kind: 'city', name: 'Paris', detail: 'Île-de-France, France', lat: 48.8534, lng: 2.3488 },
  {
    kind: 'city',
    name: 'Reykjavik',
    detail: 'Capital Region, Iceland',
    lat: 64.1355,
    lng: -21.8954,
  },
];

function km(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function localDate(iso, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function searchFixtures(q) {
  const origin = { lat: Number(q.get('origin_lat')), lng: Number(q.get('origin_lng')) };
  const radius = Number(q.get('radius_km'));
  return FIXTURES.map((row) => ({
    ...row,
    distance_km: km(origin, { lat: row.venue_lat, lng: row.venue_lng }),
  }))
    .filter((row) => row.distance_km <= radius)
    .filter((row) => {
      const day = localDate(row.kickoff_at, row.venue_timezone);
      return day >= q.get('date_from') && day <= q.get('date_to');
    });
}

// « J'y vais » : qui (appareil) va à quel match, en mémoire. FAKE_SYNC_AGE_HOURS vieillit
// artificiellement la dernière synchronisation, pour tester l'avertissement de fraîcheur.
const interest = new Map();
const syncAgeHours = Number(process.env.FAKE_SYNC_AGE_HOURS) || 0;

function call(pathname, body) {
  const fixtureOf = (slug) => FIXTURES.find((row) => row.slug === slug);
  switch (pathname) {
    case '/rest/v1/rpc/set_going': {
      const row = fixtureOf(body.p_fixture_slug);
      if (!row) return null;
      const devices = interest.get(row.slug) ?? new Set();
      if (body.p_going) devices.add(body.p_device_id);
      else devices.delete(body.p_device_id);
      interest.set(row.slug, devices);
      row.going_count = devices.size;
      return [{ going: !!body.p_going, going_count: devices.size }];
    }
    case '/rest/v1/rpc/my_going':
      return (body.p_fixture_slugs ?? []).filter((slug) =>
        interest.get(slug)?.has(body.p_device_id),
      );
    default:
      return null;
  }
}

const eq = (q, name) => (q.get(name) ?? '').replace(/^eq\./, '');

function route(pathname, q) {
  switch (pathname) {
    case '/rest/v1/rpc/search_fixtures':
      return searchFixtures(q);
    case '/rest/v1/rpc/search_places': {
      const needle = (q.get('q') ?? '').toLowerCase();
      return PLACES.filter((place) => place.name.toLowerCase().startsWith(needle));
    }
    case '/rest/v1/fixture_cards': {
      if (q.has('slug')) return FIXTURES.filter((row) => row.slug === eq(q, 'slug'));
      if (q.has('venue_slug'))
        return FIXTURES.filter((row) => row.venue_slug === eq(q, 'venue_slug'));
      const or = /home_slug\.eq\.([^,)]+)/.exec(q.get('or') ?? '');
      return or ? FIXTURES.filter((row) => row.home_slug === or[1] || row.away_slug === or[1]) : [];
    }
    case '/rest/v1/rpc/data_status':
      return [
        {
          fixtures_synced_at: new Date(Date.now() - syncAgeHours * 3_600_000).toISOString(),
          upcoming_fixtures: FIXTURES.length,
        },
      ];
    case '/rest/v1/rpc/sitemap_entries':
      return [
        ...Object.values(VENUES).map((venue) => ({
          kind: 'venue',
          slug: venue.slug,
          updated_at: null,
        })),
        ...FIXTURES.map((row) => ({ kind: 'match', slug: row.slug, updated_at: row.kickoff_at })),
        ...Object.values(TEAMS).map((item) => ({
          kind: 'team',
          slug: item.slug,
          updated_at: null,
        })),
      ];
    case '/rest/v1/venue_pages':
      return Object.values(VENUES).filter((venue) => venue.slug === eq(q, 'slug'));
    case '/rest/v1/team_pages':
      return Object.values(TEAMS)
        .filter((item) => item.slug === eq(q, 'slug'))
        .map((item) => {
          const venue = item.venue ? VENUES[item.venue] : null;
          return {
            slug: item.slug,
            name: item.name,
            country: item.country,
            logo_url: null,
            venue_name: venue?.name ?? null,
            venue_slug: venue?.slug ?? null,
            venue_city: venue?.city ?? null,
          };
        });
    default:
      return null;
  }
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === '/style.json') {
    // Style de carte minimal, sans tuiles : la carte s'initialise sans dépendre d'Internet.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#e6e1d5' } }],
      }),
    );
    return;
  }
  const reply = (body) => {
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body ?? { message: 'Introuvable' }));
  };
  if (!req.headers.apikey) return reply(null);
  if (req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => reply(call(url.pathname, JSON.parse(raw || '{}'))));
    return;
  }
  reply(route(url.pathname, url.searchParams));
}).listen(port, () => process.stdout.write(`Faux Supabase : http://127.0.0.1:${port}\n`));
