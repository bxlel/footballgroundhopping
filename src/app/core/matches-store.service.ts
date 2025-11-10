import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiFootballService } from './api-football.service';
import { Filters, MatchLite, CityCount, SearchInfo } from './models';

@Injectable({ providedIn: 'root' })
export class MatchesStoreService {
  private readonly api = inject(ApiFootballService);

  private readonly _filters = signal<Filters>({
    dateFrom: null,
    dateTo: null,
    country: '',
    city: '',
  });

  private readonly _matches = signal<MatchLite[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _info = signal<SearchInfo>({ count: 0 });

  constructor() {
    console.log('[MatchesStore] init with filters', this._filters());
  }

  filters(): Filters {
    return this._filters();
  }

  loading(): boolean {
    return this._loading();
  }

  error(): string | null {
    return this._error();
  }

  list(): MatchLite[] {
    return this._matches();
  }

  counts(): CityCount[] {
    const map = new Map<string, number>();

    for (const m of this._matches()) {
      const key = m.city || m.venue || 'Inconnu';
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const arr = Array.from(map.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);

    console.log('[MatchesStore] counts computed:', arr);
    return arr;
  }

  info(): SearchInfo {
    return this._info();
  }

  updateDateFrom(dateFrom: string | null) {
    console.log('[MatchesStore] updateDateFrom:', dateFrom);
    this._filters.update((f) => ({ ...f, dateFrom: dateFrom || null }));
    this.syncInfo();
  }

  updateDateTo(dateTo: string | null) {
    console.log('[MatchesStore] updateDateTo:', dateTo);
    this._filters.update((f) => ({ ...f, dateTo: dateTo || null }));
    this.syncInfo();
  }

  updateCountry(country: string) {
    console.log('[MatchesStore] updateCountry:', country);
    this._filters.update((f) => ({ ...f, country: country.trim() }));
    this.syncInfo();
  }

  updateCity(city: string | null | undefined) {
    console.log('[MatchesStore] updateCity:', city);
    this._filters.update((f) => ({
      ...f,
      city: city?.trim() || '',
    }));
    this.syncInfo();
  }

  reset() {
    console.log('[MatchesStore] reset() called');
    this._filters.set({
      dateFrom: null,
      dateTo: null,
      country: '',
      city: '',
    });

    this._matches.set([]);
    this._error.set(null);
    this._info.set({ count: 0 });
    this._loading.set(false);

    this.syncInfo();
  }

  searchNow() {
    const f = this._filters();
    console.log('[MatchesStore] searchNow with filters', f);

    if (!f.dateFrom || !f.dateTo) {
      this._error.set('Merci de renseigner une période.');
      console.warn('[MatchesStore] blocked: missing dates');
      return;
    }

    // 👉 TEMP : autoriser sans pays pour debug
    // if (!f.country) {
    //   this._error.set('Merci de choisir un pays.');
    //   console.warn('[MatchesStore] blocked: missing country');
    //   return;
    // }

    this._loading.set(true);
    this._error.set(null);

    this.api
      .searchFixtures(f)
      .pipe(
        finalize(() => {
          this._loading.set(false);
          console.log('[MatchesStore] loading=false');
        })
      )
      .subscribe({
        next: (matches) => {
          console.log(
            '[MatchesStore] fixtures received from ApiFootball =',
            matches?.length ?? 0
          );

          const safe = matches || [];
          this._matches.set(safe);

          this._info.update((i) => ({
            ...i,
            count: safe.length,
          }));

          this.syncInfo();

          if (safe.length === 0) {
            console.warn(
              '[MatchesStore] No matches for current filters',
              this._filters()
            );
          } else {
            console.log(
              '[MatchesStore] First match sample:',
              safe[0]
            );
          }
        },
        error: (err) => {
          console.error('[MatchesStore] search failed', err);

          this._matches.set([]);
          this._info.update((i) => ({ ...i, count: 0 }));
          this._error.set(
            "Impossible de charger les matches pour cette recherche."
          );

          this.syncInfo();
        },
      });
  }

  private syncInfo() {
    const f = this._filters();
    const count = this._matches().length;

    const next: SearchInfo = {
      ...this._info(),
      from: f.dateFrom ?? undefined,
      to: f.dateTo ?? undefined,
      country: f.country || undefined,
      city: f.city || undefined,
      count,
    };

    this._info.set(next);
    console.log('[MatchesStore] syncInfo ->', next);
  }
}
