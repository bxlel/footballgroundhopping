import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { DataApi } from './data-api.service';
import {
  applyFilters,
  availableCountries,
  availableLevels,
  groupByDay,
  sortFixtures,
} from './filters';
import { MESSAGES } from './i18n/messages';
import { venueMarkers } from './markers';
import { EMPTY_FILTERS, FixtureCard, TripFilters, TripQuery } from './models';

export type TripStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * État du mode Voyage : la recherche en cours, ses résultats, les filtres et le stade
 * mis en évidence (partagé entre la liste et la carte).
 * Les filtres s'appliquent en mémoire : aucun rechargement.
 */
@Injectable()
export class TripStore {
  private readonly api = inject(DataApi);
  private readonly locale = inject(MESSAGES).locale;

  private readonly _query = signal<TripQuery | null>(null);
  private readonly _status = signal<TripStatus>('idle');
  private readonly _all = signal<FixtureCard[]>([]);
  private readonly _filters = signal<TripFilters>(EMPTY_FILTERS);
  private readonly _activeVenue = signal<string | null>(null);

  readonly query = this._query.asReadonly();
  readonly status = this._status.asReadonly();
  readonly filters = this._filters.asReadonly();
  /** Slug du stade survolé ou focalisé, dans la liste ou sur la carte. */
  readonly activeVenue = this._activeVenue.asReadonly();

  readonly total = computed(() => this._all().length);
  readonly visible = computed(() => sortFixtures(applyFilters(this._all(), this._filters())));
  readonly days = computed(() => groupByDay(this.visible()));
  readonly markers = computed(() => venueMarkers(this.visible()));
  readonly levels = computed(() => availableLevels(this._all()));
  readonly countries = computed(() => availableCountries(this._all(), this.locale));

  private readonly requests = new Subject<TripQuery>();

  constructor() {
    this.requests
      .pipe(
        switchMap((query) =>
          this.api.searchFixtures(query).pipe(
            map((fixtures) => ({ ok: true as const, fixtures })),
            catchError(() => of({ ok: false as const })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (!result.ok) {
          this._all.set([]);
          this._status.set('error');
          return;
        }
        this._all.set(result.fixtures);
        this.pruneFilters();
        this._status.set('ready');
      });
  }

  /** Lance une recherche ; `null` remet l'écran à zéro. */
  search(query: TripQuery | null): void {
    this._query.set(query);
    this._activeVenue.set(null);
    if (!query) {
      this._all.set([]);
      this._status.set('idle');
      return;
    }
    this._status.set('loading');
    this.requests.next(query);
  }

  retry(): void {
    this.search(this._query());
  }

  setFilters(filters: TripFilters): void {
    this._filters.set(filters);
  }

  clearFilters(): void {
    this._filters.set(EMPTY_FILTERS);
  }

  setActiveVenue(slug: string | null): void {
    this._activeVenue.set(slug);
  }

  /** Après une nouvelle recherche, retire les filtres qui ne correspondent plus à rien. */
  private pruneFilters(): void {
    const levels = this.levels();
    const countries = this.countries();
    this._filters.update((filters) => ({
      slots: filters.slots,
      levels: filters.levels.filter((level) => levels.includes(level)),
      countries: filters.countries.filter((country) => countries.includes(country)),
    }));
  }
}
