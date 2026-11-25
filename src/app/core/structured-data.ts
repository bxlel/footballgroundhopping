import { localParts } from './local-time';
import { FixtureCard, FixtureStatus } from './models';
import { absoluteUrl, matchPath, teamPath, venuePath } from './urls';

const EVENT_STATUS: Record<FixtureStatus, string> = {
  scheduled: 'https://schema.org/EventScheduled',
  live: 'https://schema.org/EventScheduled',
  finished: 'https://schema.org/EventScheduled',
  postponed: 'https://schema.org/EventPostponed',
  cancelled: 'https://schema.org/EventCancelled',
};

type JsonLd = Record<string, unknown>;

/** Données structurées schema.org d'un match (type SportsEvent). */
export function sportsEventJsonLd(fixture: FixtureCard, siteUrl: string): JsonLd {
  const venue = fixture.venue;
  const team = (side: FixtureCard['home']): JsonLd => ({
    '@type': 'SportsTeam',
    name: side.name,
    url: absoluteUrl(siteUrl, teamPath(side.slug)),
  });

  const event: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${fixture.home.name} – ${fixture.away.name}`,
    description: fixture.competition.name,
    sport: 'Football',
    // Sans horaire confirmé, on ne publie que la date (locale au stade).
    startDate: fixture.timeConfirmed
      ? fixture.kickoffAt
      : localParts(fixture.kickoffAt, venue?.timezone).date,
    eventStatus: EVENT_STATUS[fixture.status],
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: absoluteUrl(siteUrl, matchPath(fixture.slug)),
    homeTeam: team(fixture.home),
    awayTeam: team(fixture.away),
    competitor: [team(fixture.home), team(fixture.away)],
  };

  if (venue) {
    const address: JsonLd = { '@type': 'PostalAddress' };
    if (venue.city) address['addressLocality'] = venue.city;
    if (venue.country) address['addressCountry'] = venue.country;
    const location: JsonLd = {
      '@type': 'StadiumOrArena',
      name: venue.name,
      url: absoluteUrl(siteUrl, venuePath(venue.slug)),
      address,
    };
    if (venue.position && !venue.approximate) {
      location['geo'] = {
        '@type': 'GeoCoordinates',
        latitude: venue.position.lat,
        longitude: venue.position.lng,
      };
    }
    event['location'] = location;
  }

  return event;
}

/** Sérialise du JSON-LD pour une balise <script>, sans pouvoir la refermer par accident. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
