import { isPlatformServer } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { APP_CONFIG } from './config';
import { Row, toFixtureCards, toPlace, toPlaces, toTeamPage, toVenuePage } from './mappers';
import { FixtureCard, Place, TeamPage, TripQuery, VenuePage } from './models';
import { toIsoDate } from './period';
import { BROWSER_RESILIENCE, resilient, SERVER_RESILIENCE } from './resilient';

/** Fonction serveur de géocodage (voir netlify/functions/geocode.mjs). */
export const GEOCODE_URL = '/.netlify/functions/geocode';

export interface GoingState {
  going: boolean;
  goingCount: number;
}

/** Nombre maximal de matchs à venir affichés sur une page stade ou club. */
const UPCOMING_LIMIT = 30;

/**
 * Lecture des données publiques dans Supabase (API REST PostgREST).
 * Toutes les requêtes sont des GET : elles sont rejouées depuis le cache de transfert
 * après le rendu serveur, sans second appel réseau.
 */
@Injectable({ providedIn: 'root' })
export class DataApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly resilience = isPlatformServer(inject(PLATFORM_ID))
    ? SERVER_RESILIENCE
    : BROWSER_RESILIENCE;

  private get<T>(path: string, params: Record<string, string>): Observable<T> {
    const { supabaseUrl, supabaseAnonKey } = this.config;
    if (!supabaseUrl || !supabaseAnonKey) {
      return throwError(() => new Error('Supabase n’est pas configuré'));
    }
    return this.http
      .get<T>(`${supabaseUrl}/rest/v1/${path}`, {
        params: new HttpParams({ fromObject: params }),
        headers: { apikey: supabaseAnonKey },
      })
      .pipe(resilient(this.resilience));
  }

  /** Appel d'une fonction SQL qui écrit : un POST, jamais rejoué automatiquement. */
  private call<T>(name: string, body: Record<string, unknown>): Observable<T> {
    const { supabaseUrl, supabaseAnonKey } = this.config;
    if (!supabaseUrl || !supabaseAnonKey) {
      return throwError(() => new Error('Supabase n’est pas configuré'));
    }
    return this.http.post<T>(`${supabaseUrl}/rest/v1/rpc/${name}`, body, {
      headers: { apikey: supabaseAnonKey },
    });
  }

  /** Marque ou retire « J'y vais » pour cet appareil ; rend l'état et le compteur à jour. */
  setGoing(slug: string, deviceId: string, going: boolean): Observable<GoingState> {
    return this.call<Row[]>('set_going', {
      p_fixture_slug: slug,
      p_device_id: deviceId,
      p_going: going,
    }).pipe(
      map((rows) => {
        const row = Array.isArray(rows) ? rows[0] : undefined;
        const count = row?.['going_count'];
        return {
          going: row?.['going'] === true,
          goingCount: typeof count === 'number' && count > 0 ? Math.trunc(count) : 0,
        };
      }),
    );
  }

  /** Parmi ces matchs, ceux que cet appareil a marqués « J'y vais ». */
  myGoing(deviceId: string, slugs: readonly string[]): Observable<string[]> {
    return this.call<unknown>('my_going', { p_device_id: deviceId, p_fixture_slugs: slugs }).pipe(
      map((rows) =>
        Array.isArray(rows) ? rows.filter((row): row is string => typeof row === 'string') : [],
      ),
    );
  }

  /** Date de la dernière synchronisation réussie des matchs, ou `null` si elle est inconnue. */
  lastSync(): Observable<string | null> {
    return this.get<Row[]>('rpc/data_status', {}).pipe(
      map((rows) => {
        const value = Array.isArray(rows) ? rows[0]?.['fixtures_synced_at'] : null;
        return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
      }),
    );
  }

  /** Matchs à voir autour d'un point, sur une période (fonction SQL `search_fixtures`). */
  searchFixtures(query: TripQuery): Observable<FixtureCard[]> {
    return this.get<unknown>('rpc/search_fixtures', {
      origin_lat: String(query.origin.lat),
      origin_lng: String(query.origin.lng),
      radius_km: String(query.radiusKm),
      date_from: query.from,
      date_to: query.to,
    }).pipe(map(toFixtureCards));
  }

  /** Suggestions du champ « Où ? » : villes et stades de notre base. */
  searchPlaces(text: string): Observable<Place[]> {
    return this.get<unknown>('rpc/search_places', { q: text }).pipe(map(toPlaces));
  }

  /** Adresse ou hôtel : passe par notre fonction serveur, jamais par un géocodeur en direct. */
  geocode(text: string): Observable<Place | null> {
    return this.http
      .get<{ place?: Row | null }>(GEOCODE_URL, { params: { q: text } })
      .pipe(map((body) => (body?.place ? toPlace(body.place) : null)));
  }

  fixtureBySlug(slug: string): Observable<FixtureCard | null> {
    return this.get<unknown>('fixture_cards', { slug: `eq.${slug}`, limit: '1' }).pipe(
      map((rows) => toFixtureCards(rows)[0] ?? null),
    );
  }

  venueBySlug(slug: string): Observable<VenuePage | null> {
    return this.get<Row[]>('venue_pages', { slug: `eq.${slug}`, limit: '1' }).pipe(
      map((rows) => (Array.isArray(rows) && rows[0] ? toVenuePage(rows[0]) : null)),
    );
  }

  teamBySlug(slug: string): Observable<TeamPage | null> {
    return this.get<Row[]>('team_pages', { slug: `eq.${slug}`, limit: '1' }).pipe(
      map((rows) => (Array.isArray(rows) && rows[0] ? toTeamPage(rows[0]) : null)),
    );
  }

  upcomingAtVenue(slug: string): Observable<FixtureCard[]> {
    return this.upcoming({ venue_slug: `eq.${slug}` });
  }

  upcomingForTeam(slug: string): Observable<FixtureCard[]> {
    return this.upcoming({ or: `(home_slug.eq.${slug},away_slug.eq.${slug})` });
  }

  private upcoming(filter: Record<string, string>): Observable<FixtureCard[]> {
    return this.get<unknown>('fixture_cards', {
      ...filter,
      // Borne au jour près : la même URL côté serveur et côté navigateur.
      kickoff_at: `gte.${toIsoDate(new Date())}`,
      status: 'in.(scheduled,live,postponed)',
      order: 'kickoff_at.asc',
      limit: String(UPCOMING_LIMIT),
    }).pipe(map(toFixtureCards));
  }
}
