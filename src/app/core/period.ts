import { Period } from './models';

export type PeriodPreset = 'today' | 'weekend' | 'week';

export const PERIOD_PRESETS: readonly PeriodPreset[] = ['today', 'weekend', 'week'];

/** Durée maximale d'une recherche, en jours : au-delà, la base n'a pas encore les matchs. */
export const MAX_PERIOD_DAYS = 21;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date calendaire locale au format AAAA-MM-JJ. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Vrai pour une date AAAA-MM-JJ qui existe réellement (pas de 31 février). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const date = parseUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Nombre de jours entre deux dates (0 si identiques, négatif si `to` précède `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseUtc(to).getTime() - parseUtc(from).getTime()) / 86_400_000);
}

/** Jour de la semaine d'une date calendaire : 0 = dimanche … 6 = samedi. */
export function weekday(iso: string): number {
  return parseUtc(iso).getUTCDay();
}

/**
 * Période d'un raccourci, à partir d'aujourd'hui.
 * « Ce week-end » va du vendredi au dimanche : les matchs du vendredi soir en font partie.
 * Si on est déjà vendredi, samedi ou dimanche, il commence aujourd'hui.
 */
export function presetPeriod(preset: PeriodPreset, today: string): Period {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: today, to: addDays(today, 6) };
    case 'weekend': {
      const day = weekday(today);
      const untilSunday = (7 - day) % 7;
      const sinceFriday = day === 0 ? 2 : day - 5;
      const from = sinceFriday >= 0 ? today : addDays(today, -sinceFriday);
      return { from, to: addDays(today, untilSunday) };
    }
  }
}

/** Raccourci correspondant exactement à une période, s'il y en a un. */
export function matchingPreset(period: Period, today: string): PeriodPreset | null {
  return (
    PERIOD_PRESETS.find((preset) => {
      const candidate = presetPeriod(preset, today);
      return candidate.from === period.from && candidate.to === period.to;
    }) ?? null
  );
}

/**
 * Rend une période toujours utilisable : dates valides, dans l'ordre, pas dans le passé,
 * et limitée à MAX_PERIOD_DAYS. Sans dates valides, on retombe sur « ce week-end ».
 */
export function normalizePeriod(from: unknown, to: unknown, today: string): Period {
  if (!isIsoDate(from)) return presetPeriod('weekend', today);
  let start = from;
  let end = isIsoDate(to) ? to : from;
  if (end < start) [start, end] = [end, start];
  if (end < today) return presetPeriod('weekend', today);
  if (start < today) start = today;
  const maxEnd = addDays(start, MAX_PERIOD_DAYS - 1);
  if (end > maxEnd) end = maxEnd;
  return { from: start, to: end };
}
