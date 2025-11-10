import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiFootballService } from './api-football.service';
import { Filters, MatchLite, CityCount, SearchInfo } from './models';

@Injectable({ providedIn: 'root' })
export class MatchesStoreService {
  private api = inject(ApiFootballService);

  // état filtres
  private _filters = signal<Filters>({
    dateFrom: null,
    dateTo: null,
    country: '',
    city: '',
  });

  // état données
  private _matches = signal<MatchLite[]>([]);
  private _loading = signal(false);
  private _error = signal<string | null>(null);
  private _info = signal<SearchInfo>({ count: 0 });

  /* ========= Getters utilisés dans le reste de l'app ========= */

  filters(): Filters {
    return this._filters();
  }

  loading() {
    return this._loading();
  }

  error() {
    return this._error();
  }

  list() {
    return this._matches();
  }

  counts(): CityCount[] {
    const map = new Map<string, number>();

    for (const m of this._matches()) {
      const key = m.city || m.venue || 'Inconnu';
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }

  info(): SearchInfo {
    return this._info();
  }

  /* ========= Mises à jour depuis les formulaires ========= */

  updateDateFrom(dateFrom: string | null) {
    this._filters.update((f) => ({ ...f, dateFrom: dateFrom || null }));
    this.syncInfo();
  }

  updateDateTo(dateTo: string | null) {
    this._filters.update((f) => ({ ...f, dateTo: dateTo || null }));
    this.syncInfo();
  }

  updateCountry(country: string) {
    this._filters.update((f) => ({ ...f, country: country.trim() }));
    this.syncInfo();
  }

  updateCity(city: string | null | undefined) {
    this._filters.update((f) => ({ ...f, city: city?.trim() || '' }));
    this.syncInfo();
  }

  reset() {
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
  }

  /* ========= Action: lancer la recherche ========= */

  searchNow() {
    const f = this._filters();

    if (!f.dateFrom || !f.dateTo || !f.country) {
      this._error.set('Merci de renseigner une période et un pays.');
      return;
    }

    this._loading.set(true);
    this._error.set(null);

    this.api
      .searchFixtures(f)
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (matches) => {
          this._matches.set(matches);
          this._info.update((i) => ({
            ...i,
            count: matches.length,
          }));
        },
        error: (err) => {
          console.error(err);
          this._matches.set([]);
          this._info.update((i) => ({ ...i, count: 0 }));
          this._error.set(
            "Impossible de charger les matches pour cette recherche."
          );
        },
      });
  }

  /* ========= Sync info affichée sous la barre ========= */

  private syncInfo() {
    const f = this._filters();
    this._info.update((prev) => ({
      ...prev,
      from: f.dateFrom ?? undefined,
      to: f.dateTo ?? undefined,
      country: f.country || undefined,
      city: f.city || undefined,
      count: this._matches().length,
    }));
  }
}
