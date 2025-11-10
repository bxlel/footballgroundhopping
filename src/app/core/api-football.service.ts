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

  // AUCUN fallback ici. Tu forces l'usage de la Netlify Function.
  private readonly baseUrl = environment.apiFootballBaseUrl;

  /** Get list of countries (via Netlify function) */
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

  /** Search fixtures by date range + optional country */
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

    const safeDates = dates.slice(0, 14);

    const requests = safeDates.map((d) => {
      let params = new HttpParams()
        .set('date', d)
        .set('timezone', 'Europe/Paris');

      if (country && country.trim()) {
        params = params.set('country', country.trim());
      }

      return this.http.get<ApiFootballFixtureResponse>(
        `${this.baseUrl}/fixtures`,
        { params }
      );
    });

    return forkJoin(requests).pipe(
      map((all) => {
        const raw = all.flatMap((r) => r.response ?? []);

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

        const filtered =
          country && country.trim()
            ? mapped.filter(
                (m) =>
                  (m.country || '').toLowerCase() ===
                  country.toLowerCase()
              )
            : mapped;

        return filtered.sort((a, b) =>
          (a.iso || '').localeCompare(b.iso || '')
        );
      })
    );
  }

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
