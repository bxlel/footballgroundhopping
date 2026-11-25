import { localParts } from './local-time';

/** « 800 m », « 4,2 km », « 12 km » : précis de près, arrondi de loin. */
export function formatDistance(km: number | null | undefined, locale: string): string {
  if (km == null || !Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const meters = Math.max(50, Math.round((km * 1000) / 50) * 50);
    return meters >= 1000 ? `1 km` : `${meters} m`;
  }
  const digits = km < 10 ? 1 : 0;
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(km);
  return `${value} km`;
}

/** Heure locale du stade, toujours sur 5 caractères (« 20:45 »), comme sur un tableau d'affichage. */
export function formatKickoffTime(iso: string, timeZone: string | null): string {
  const { hour, minute } = localParts(iso, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Jour d'une date calendaire : « samedi 14 mars » (long) ou « sam. 14 mars » (court). */
export function formatDay(
  isoDate: string,
  locale: string,
  style: 'long' | 'short' = 'long',
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: style,
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Jour local du coup d'envoi, au format court. */
export function formatKickoffDay(iso: string, timeZone: string | null, locale: string): string {
  return formatDay(localParts(iso, timeZone).date, locale, 'short');
}

/** Date complète pour les pages : « samedi 14 mars 2026 ». */
export function formatFullDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** « 12 345 » : capacité d'un stade. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
