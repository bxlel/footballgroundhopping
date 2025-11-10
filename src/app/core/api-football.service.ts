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
  private readonly baseUrl = environment.apiFootballBaseUrl;

  constructor() {
    console.log(
      '[ApiFootballService] constructed with baseUrl =',
      this.baseUrl
    );
  }

  /** Get countries */
  getCountries(): Observable<string[]> {
    if (!this.baseUrl) {
      console.error('[ApiFootball] baseUrl is not set in environment');
      return of([]);
    }

    const url = `${this.baseUrl}/countries`;
    console.log('[ApiFootball] getCountries ->', url);

    return this.http.get<ApiFootballCountriesResponse>(url).pipe(
      map((res) => {
        const raw = res?.response || [];
        console.log(
          '[ApiFootball] getCountries raw length =',
          raw.length
        );

        const names = raw
          .map((c) => c.name)
          .filter((n): n is string => !!n);

        const unique = Array.from(new Set(names)).sort((a, b) =>
          a.localeCompare(b)
        );

        console.log(
          '[ApiFootball] getCountries unique length =',
          unique.length
        );

        return unique;
      })
    );
  }

  /** Search fixtures for date range, filtered by country client-side */
  searchFixtures(filters: Filters): Observable<MatchLite[]> {
    console.log('[ApiFootball] searchFixtures called with filters:', filters);

    const { dateFrom, dateTo, country } = filters;

    if (!dateFrom || !dateTo) {
      console.warn(
        '[ApiFootball] searchFixtures aborted: missing dates',
        { dateFrom, dateTo }
      );
      return of([]);
    }

    if (!this.baseUrl) {
      console.error('[ApiFootball] baseUrl is not set');
      return of([]);
    }

    const dates = this.buildDateRange(dateFrom, dateTo);
    console.log('[ApiFootball] buildDateRange ->', dates);

    if (!dates.length) {
      console.warn(
        '[ApiFootball] searchFixtures aborted: invalid date range',
        { dateFrom, dateTo }
      );
      return of([]);
    }

    const safeDates = dates.slice(0, 14);
    console.log('[ApiFootball] safeDates (max 14) ->', safeDates);

    const requests = safeDates.map((d) => {
      const params = new HttpParams()
        .set('date', d)
        .set('timezone', 'Europe/Paris');

      const url = `${this.baseUrl}/fixtures`;
      console.log('[ApiFootball] GET', url, 'params =', params.toString());

      return this.http.get<ApiFootballFixtureResponse>(url, { params });
    });

    if (requests.length === 0) {
      console.warn('[ApiFootball] No dates to request');
      return of([]);
    }

    return forkJoin(requests).pipe(
      map((all) => {
        const allResponses = all || [];
        const raw = allResponses.flatMap((r) => r?.response ?? []);
        console.log(
          '[ApiFootball] Raw fixtures total for all days =',
          raw.length
        );

        const mapped: MatchLite[] = raw.map((fx) => {
          const iso = fx.fixture.date;
          const match: MatchLite = {
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
          return match;
        });

        console.log(
          '[ApiFootball] Mapped fixtures length =',
          mapped.length
        );

        let filtered = mapped;

        if (country && country.trim()) {
          const wanted = country.trim().toLowerCase();
          filtered = mapped.filter(
            (m) => (m.country || '').toLowerCase() === wanted
          );
          console.log(
            '[ApiFootball] After country filter =',
            country,
            '=>',
            filtered.length
          );
        } else {
          console.log(
            '[ApiFootball] No country filter applied, using all fixtures'
          );
        }

        const sorted = filtered.sort((a, b) =>
          (a.iso || '').localeCompare(b.iso || '')
        );

        console.log(
          '[ApiFootball] Final fixtures returned =',
          sorted.length
        );

        if (sorted.length > 0) {
          console.log(
            '[ApiFootball] Example fixture:',
            sorted[0]
          );
        }

        return sorted;
      })
    );
  }

  private buildDateRange(from: string, to: string): string[] {
    const start = new Date(from);
    const end = new Date(to);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      console.warn(
        '[ApiFootball] buildDateRange invalid from/to',
        from,
        to
      );
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
