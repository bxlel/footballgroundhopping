// src/app/core/api-football.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Filters, MatchLite } from './models';
import { Observable, forkJoin, map, of } from 'rxjs';
import { environment } from '@env/environment';

interface ApiFootballFixtureResponse {
  response: ApiFootballFixture[];
}

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    venue: {
      name: string | null;
      city: string | null;
    };
    status: {
      short: string;
      long: string;
    };
  };
  league: {
    name: string;
    country: string;
  };
  teams: {
    home: { name: string };
    away: { name: string };
  };
}

interface ApiFootballCountriesResponse {
  response: { name: string }[];
}

@Injectable({ providedIn: 'root' })
export class ApiFootballService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiFootballBaseUrl; // '/.netlify/functions/api-football'

  /** Pays via proxy Netlify */
  getCountries(): Observable<string[]> {
    if (!this.baseUrl) {
      console.error('[ApiFootball] baseUrl is not set');
      return of([]);
    }

    return this.http
      .get<ApiFootballCountriesResponse>(`${this.baseUrl}/countries`)
      .pipe(
        map((res) => {
          const names =
            res?.response?.map((c) => c.name).filter(Boolean) ?? [];
          return Array.from(new Set(names)).sort((a, b) =>
            a.localeCompare(b)
          );
        })
      );
  }

  /** Fixtures via proxy Netlify + filtrage pays côté front */
  searchFixtures(filters: Filters): Observable<MatchLite[]> {
    const { dateFrom, dateTo, country } = filters;

    if (!dateFrom || !dateTo) {
      console.warn('[ApiFootball] Missing dates', { dateFrom, dateTo });
      return of([]);
    }

    const dates = this.buildDateRange(dateFrom, dateTo);
    if (!dates.length) {
      console.warn('[ApiFootball] Invalid date range', { dateFrom, dateTo });
      return of([]);
    }

    if (!this.baseUrl) {
      console.error('[ApiFootball] baseUrl is not set');
      return of([]);
    }

    // On limite à 14 jours max
    const safeDates = dates.slice(0, 14);

    const requests = safeDates.map((d) => {
      const params = new HttpParams()
        .set('date', d)
        .set('timezone', 'Europe/Paris');

      // ⚠️ On ne passe pas country ici, on filtrera ensuite.
      return this.http.get<ApiFootballFixtureResponse>(
        `${this.baseUrl}/fixtures`,
        { params }
      );
    });

    return forkJoin(requests).pipe(
      map((all) => {
        const raw = all.flatMap((r) => r.response ?? []);
        console.log(
          '[ApiFootball] Raw fixtures total for range',
          dateFrom,
          '→',
          dateTo,
          ':',
          raw.length
        );

        const mapped: MatchLite[] = raw.map((fx) => {
          const iso = fx.fixture.date;
          return {
            id: String(fx.fixture.id),
            iso,
            date: iso.slice(0, 10),
            time: iso.slice(11, 16),
            home: fx.teams.home.name,
            away: fx.teams.away.name,
            league: fx.league.name,
            venue: fx.fixture.venue.name || undefined,
            city: fx.fixture.venue.city || undefined,
            country: fx.league.country,
          };
        });

        let filtered = mapped;

        if (country && country.trim()) {
          const wanted = country.trim().toLowerCase();
          filtered = mapped.filter(
            (m) => (m.country || '').toLowerCase() === wanted
          );
        }

        console.log(
          '[ApiFootball] After country filter',
          country || '(no country)',
          ':',
          filtered.length
        );

        return filtered.sort((a, b) =>
          (a.iso || '').localeCompare(b.iso || '')
        );
      })
    );
  }

  /** Dates inclusives yyyy-MM-dd */
  private buildDateRange(from: string, to: string): string[] {
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return [];
    }

    const out: string[] = [];
    const d = new Date(start);

    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    return out;
  }
}
