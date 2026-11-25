/** Date et heure d'un coup d'envoi, vues depuis le fuseau du stade. */
export interface LocalParts {
  /** Date calendaire locale, AAAA-MM-JJ. */
  date: string;
  hour: number;
  minute: number;
  /** 0 = dimanche … 6 = samedi. */
  weekday: number;
  /** Fuseau réellement utilisé (UTC quand celui du stade est inconnu ou invalide). */
  timeZone: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Fuseau à utiliser pour l'affichage : celui du stade s'il est valide, sinon UTC. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    partsFormatter(timeZone);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function localParts(iso: string, timeZone: string | null | undefined): LocalParts {
  const zone = safeTimeZone(timeZone);
  const parts = partsFormatter(zone).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    timeZone: zone,
  };
}
