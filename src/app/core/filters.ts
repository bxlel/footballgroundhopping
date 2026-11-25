import { FixtureCard, Level, Slot, TripFilters } from './models';
import { localParts } from './local-time';

/** Heure locale à partir de laquelle un match compte comme « en soirée ». */
export const EVENING_FROM_HOUR = 18;

export const LEVEL_ORDER: readonly Level[] = ['top', 'lower', 'cup', 'women', 'youth', 'other'];
export const SLOT_ORDER: readonly Slot[] = ['evening', 'daytime', 'weekend'];

function venueZone(fixture: FixtureCard): string | null {
  return fixture.venue?.timezone ?? null;
}

/**
 * Créneaux : « soirée » et « journée » s'additionnent (l'un ou l'autre),
 * « week-end » se combine avec eux (samedi ou dimanche, heure locale du stade).
 * Un match dont l'horaire n'est pas confirmé n'est jamais écarté sur l'heure.
 */
export function matchesSlots(fixture: FixtureCard, slots: readonly Slot[]): boolean {
  if (!slots.length) return true;
  const local = localParts(fixture.kickoffAt, venueZone(fixture));

  if (slots.includes('weekend') && local.weekday !== 0 && local.weekday !== 6) return false;

  const wantsEvening = slots.includes('evening');
  const wantsDaytime = slots.includes('daytime');
  if ((wantsEvening || wantsDaytime) && fixture.timeConfirmed) {
    const isEvening = local.hour >= EVENING_FROM_HOUR;
    if (!((wantsEvening && isEvening) || (wantsDaytime && !isEvening))) return false;
  }
  return true;
}

export function applyFilters(
  fixtures: readonly FixtureCard[],
  filters: TripFilters,
): FixtureCard[] {
  return fixtures.filter(
    (fixture) =>
      matchesSlots(fixture, filters.slots) &&
      (!filters.levels.length || filters.levels.includes(fixture.competition.level)) &&
      (!filters.countries.length ||
        (fixture.competition.country !== null &&
          filters.countries.includes(fixture.competition.country))),
  );
}

/** Tri de la liste : par jour (local au stade), puis par distance, puis par heure. */
export function sortFixtures(fixtures: readonly FixtureCard[]): FixtureCard[] {
  return fixtures
    .map((fixture) => ({ fixture, day: localParts(fixture.kickoffAt, venueZone(fixture)).date }))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.fixture.distanceKm ?? Infinity) - (b.fixture.distanceKm ?? Infinity) ||
        a.fixture.kickoffAt.localeCompare(b.fixture.kickoffAt) ||
        a.fixture.id - b.fixture.id,
    )
    .map((entry) => entry.fixture);
}

export interface DayGroup {
  /** Date calendaire locale au stade, AAAA-MM-JJ. */
  day: string;
  fixtures: FixtureCard[];
}

/** Regroupe une liste déjà triée en journées, pour les intertitres. */
export function groupByDay(fixtures: readonly FixtureCard[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const fixture of fixtures) {
    const day = localParts(fixture.kickoffAt, venueZone(fixture)).date;
    const last = groups.at(-1);
    if (last?.day === day) last.fixtures.push(fixture);
    else groups.push({ day, fixtures: [fixture] });
  }
  return groups;
}

/** Niveaux présents dans les résultats, dans l'ordre d'affichage. */
export function availableLevels(fixtures: readonly FixtureCard[]): Level[] {
  const present = new Set(fixtures.map((fixture) => fixture.competition.level));
  return LEVEL_ORDER.filter((level) => present.has(level));
}

/** Pays présents dans les résultats, triés par ordre alphabétique. */
export function availableCountries(fixtures: readonly FixtureCard[], locale: string): string[] {
  const present = new Set<string>();
  for (const fixture of fixtures) {
    if (fixture.competition.country) present.add(fixture.competition.country);
  }
  return [...present].sort((a, b) => a.localeCompare(b, locale));
}

export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function countActive(filters: TripFilters): number {
  return filters.slots.length + filters.levels.length + filters.countries.length;
}
