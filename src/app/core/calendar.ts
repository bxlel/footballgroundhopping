import { localParts } from './local-time';
import { FixtureCard } from './models';
import { addDays } from './period';
import { absoluteUrl, matchPath } from './urls';

/** Durée retenue pour un match dans l'agenda : deux mi-temps, la pause et un peu de marge. */
const MATCH_MINUTES = 120;

/** Échappe un texte pour le format iCalendar (RFC 5545). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/** « 20260314T194500Z » */
function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Événement d'agenda (.ics) d'un match. Sans horaire confirmé, c'est un événement
 * « journée entière » à la date locale du stade : mieux vaut pas d'heure qu'une heure fausse.
 */
export function fixtureIcs(fixture: FixtureCard, siteUrl: string, now: Date = new Date()): string {
  const venue = fixture.venue;
  const url = absoluteUrl(siteUrl, matchPath(fixture.slug));
  const start = new Date(fixture.kickoffAt);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Spot the Game//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${fixture.slug}@spotthegame`,
    `DTSTAMP:${utcStamp(now)}`,
  ];

  if (fixture.timeConfirmed) {
    lines.push(
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(new Date(start.getTime() + MATCH_MINUTES * 60_000))}`,
    );
  } else {
    const day = localParts(fixture.kickoffAt, venue?.timezone).date;
    lines.push(
      `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, '')}`,
    );
  }

  lines.push(`SUMMARY:${escapeText(`${fixture.home.name} – ${fixture.away.name}`)}`);
  if (venue) {
    lines.push(`LOCATION:${escapeText([venue.name, venue.city].filter(Boolean).join(', '))}`);
    if (venue.position && !venue.approximate) {
      lines.push(`GEO:${venue.position.lat};${venue.position.lng}`);
    }
  }
  lines.push(
    `DESCRIPTION:${escapeText(`${fixture.competition.name}\n${url}`)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n') + '\r\n';
}
