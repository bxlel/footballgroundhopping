// src/app/core/api-football.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Filters, MatchLite } from './models';
import { Observable, forkJoin, map, of } from 'rxjs';
import { environment } from '@env/environment';

interface ApiFootballFixtureResponse {
  response: ApiFootballFixture[];
}

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string; // ISO
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
  private http = inject(HttpClient);

  // If you use proxy:
  // "/api-football" -> "https://v3.football.api-sports.io"
  // then apiFootballBaseUrl can be "/api-football" or empty + default below.
  private baseUrl = environment.apiFootballBaseUrl || '/api-football';
  private apiKey = environment.apiFootballKey;

  /** Get list of countries from API-FOOTBALL (names in English) */
  getCountries(): Observable<string[]> {
    if (!this.apiKey) {
      console.error('[ApiFootball] Missing API key for getCountries');
      return of([]);
    }

    const headers = new HttpHeaders({
      'x-apisports-key': this.apiKey,
    });

    return this.http
      .get<ApiFootballCountriesResponse>(`${this.baseUrl}/countries`, {
        headers,
      })
      .pipe(
        map((res) => {
          const names =
            res?.response?.map((c) => c.name).filter(Boolean) ?? [];
          // unique + tri
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

    if (!this.apiKey) {
      console.error('[ApiFootball] Missing API key for fixtures');
      return of([]);
    }

    const headers = new HttpHeaders({
      'x-apisports-key': this.apiKey,
    });

    // Limit to 14 days
    const safeDates = dates.slice(0, 14);

    const requests = safeDates.map((d) => {
      const params = new HttpParams()
        .set('date', d)
        .set('timezone', 'Europe/Paris');

      return this.http.get<ApiFootballFixtureResponse>(
        `${this.baseUrl}/fixtures`,
        { headers, params }
      );
    });

    return forkJoin(requests).pipe(
      map((all) => {
        const raw = all.flatMap((r) => r.response ?? []);

        console.log('[ApiFootball] Raw fixtures total:', raw.length);

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

        console.log(
          '[ApiFootball] After country filter:',
          filtered.length
        );

        return filtered.sort((a, b) =>
          (a.iso || '').localeCompare(b.iso || '')
        );
      })
    );
  }

  /** Build dates between from and to (inclusive) in yyyy-MM-dd */
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
