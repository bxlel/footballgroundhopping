// Transformation des matchs API-Football vers le format attendu par la fonction SQL
// `ingest_fixtures`. Fonctions pures : aucune E/S ici.

import { cleanText, searchKey, slugify } from './text.mjs';

const PROVIDER = 'af';

/** Statuts courts d'API-Football -> statuts de la base. */
const STATUS = {
  TBD: 'scheduled',
  NS: 'scheduled',
  '1H': 'live',
  HT: 'live',
  '2H': 'live',
  ET: 'live',
  BT: 'live',
  P: 'live',
  SUSP: 'live',
  INT: 'live',
  LIVE: 'live',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  AWD: 'finished',
  WO: 'finished',
  PST: 'postponed',
  CANC: 'cancelled',
  ABD: 'cancelled',
};

export function mapStatus(short) {
  return STATUS[short] ?? 'scheduled';
}

/** L'horaire n'est pas confirmé tant que le statut est « TBD » (Time To Be Defined). */
export function isTimeConfirmed(short) {
  return short !== 'TBD';
}

// Premières divisions dont l'identifiant API-Football est sûr. Les autres sont classées
// par leur nom ; une erreur se corrige en base (`competitions.level` + `level_locked`).
const TOP_LEAGUE_IDS = new Set([39, 61, 78, 135, 140, 88, 94, 144, 203, 179, 71, 128, 253, 262]);

const WOMEN =
  /\b(women|womens|feminine|feminin|feminina|femenina|femenino|femminile|frauen|damen|vrouwen|kobiet|wsl|nwsl)\b|\bw$|\(w\)/;
const YOUTH =
  /\bu ?-?(1[5-9]|2[0-3])\b|\bsub ?-?(1[5-9]|2[0-3])\b|\b(youth|junior|juniors|juvenil|primavera|jugend|reserve|reserves|academy|espoirs)\b/;
const CUP =
  /\b(cup|coupe|copa|coppa|pokal|taca|beker|cupa|kupa|kupasi|puchar|pohar|cupen|trophy|trophee|shield|supercup|supercopa|supercoppa|supercoupe|playoff|playoffs|play offs)\b/;
const LOWER =
  /\b(2|3|4|5|ii|iii|iv|second|third|fourth|segunda|tercera|seconda|terza|league one|league two|championship|national|nacional b|primera b|regional|regionalliga|oberliga|landesliga|amateur|non league|challenge league|erste liga|division one|serie b|serie c|serie d|liga b)\b/;
const TOP =
  /\b(premier league|premiership|premier division|ligue 1|serie a|la liga|primera division|primeira liga|bundesliga|eredivisie|super league|superliga|super lig|superligaen|pro league|liga profesional|liga mx|major league soccer|ekstraklasa|allsvenskan|eliteserien|veikkausliiga|j1 league|k league 1|a league|liga 1|division 1|1 division|first league|hnl|liga i)\b/;

/**
 * Niveau d'une compétition, par heuristique sur son nom.
 * @returns {'top' | 'lower' | 'cup' | 'women' | 'youth' | 'other'}
 */
export function classifyLevel(league) {
  const name = searchKey(league?.name);
  const international = searchKey(league?.country) === 'world';
  if (!name) return 'other';
  if (WOMEN.test(name)) return 'women';
  if (YOUTH.test(name)) return 'youth';
  if (/\bfriendl/.test(name)) return 'other';
  if (CUP.test(name) || international) return 'cup';
  if (TOP_LEAGUE_IDS.has(league?.id)) return 'top';
  if (LOWER.test(name)) return 'lower';
  if (TOP.test(name)) return 'top';
  return 'other';
}

const key = (id) => `${PROVIDER}:${id}`;

/** API-Football range les compétitions internationales dans le pays « World ». */
function countryOf(league) {
  const country = cleanText(league?.country);
  return country && country.toLowerCase() !== 'world' ? country.replace(/-/g, ' ') : null;
}

function venueOf(fixture, country) {
  const name = cleanText(fixture?.venue?.name);
  if (!name) return null;
  const city = cleanText(fixture.venue.city);
  const id = fixture.venue.id;
  // Sans identifiant fournisseur (fréquent en divisions inférieures), la clé est le nom.
  const sourceKey = Number.isInteger(id)
    ? key(id)
    : `${PROVIDER}:n:${slugify([name, city, country].filter(Boolean).join(' '))}`;
  return { source_key: sourceKey, name, city, country };
}

function isValid(item) {
  return (
    Number.isInteger(item?.fixture?.id) &&
    typeof item.fixture.date === 'string' &&
    !Number.isNaN(Date.parse(item.fixture.date)) &&
    Number.isInteger(item?.league?.id) &&
    cleanText(item.league.name) &&
    Number.isInteger(item?.teams?.home?.id) &&
    Number.isInteger(item?.teams?.away?.id) &&
    cleanText(item.teams.home.name) &&
    cleanText(item.teams.away.name)
  );
}

/** Transforme la réponse `/venues?country=…` en lot pour `ingest_venue_details`. */
export function transformVenues(items, country) {
  const venues = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!Number.isInteger(item?.id)) continue;
    const capacity = Number.isInteger(item.capacity) && item.capacity > 0 ? item.capacity : null;
    venues.push({
      source_key: key(item.id),
      address: cleanText(item.address),
      city: cleanText(item.city),
      capacity,
      surface: cleanText(item.surface),
      image_url: cleanText(item.image),
    });
  }
  return { country, venues };
}

/**
 * Transforme la réponse `/fixtures?date=…` en lot pour `ingest_fixtures`.
 * Les entrées incomplètes sont ignorées et comptées dans `skipped`.
 */
export function transformFixtures(items, day) {
  const competitions = new Map();
  const teams = new Map();
  const venues = new Map();
  const fixtures = [];
  let skipped = 0;

  for (const item of Array.isArray(items) ? items : []) {
    if (!isValid(item)) {
      skipped += 1;
      continue;
    }
    const { fixture, league, teams: sides } = item;
    const country = countryOf(league);

    const competitionKey = key(league.id);
    if (!competitions.has(competitionKey)) {
      competitions.set(competitionKey, {
        source_key: competitionKey,
        name: cleanText(league.name),
        country,
        level: classifyLevel(league),
        logo_url: cleanText(league.logo),
      });
    }

    for (const side of [sides.home, sides.away]) {
      const teamKey = key(side.id);
      if (!teams.has(teamKey)) {
        teams.set(teamKey, {
          source_key: teamKey,
          name: cleanText(side.name),
          country,
          logo_url: cleanText(side.logo),
        });
      }
    }

    const venue = venueOf(fixture, country);
    if (venue && !venues.has(venue.source_key)) venues.set(venue.source_key, venue);

    const short = fixture.status?.short;
    fixtures.push({
      source_key: key(fixture.id),
      competition_key: competitionKey,
      season: Number.isInteger(league.season) ? league.season : null,
      round: cleanText(league.round),
      home_key: key(sides.home.id),
      away_key: key(sides.away.id),
      venue_key: venue?.source_key ?? null,
      kickoff_at: new Date(fixture.date).toISOString(),
      time_confirmed: isTimeConfirmed(short),
      status: mapStatus(short),
    });
  }

  return {
    payload: {
      day,
      competitions: [...competitions.values()],
      teams: [...teams.values()],
      venues: [...venues.values()],
      fixtures,
    },
    skipped,
  };
}
