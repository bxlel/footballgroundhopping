import { TestBed } from '@angular/core/testing';
import { Observable, Subject, throwError } from 'rxjs';
import { DataApi } from './data-api.service';
import { FixtureCard, TripQuery } from './models';
import { makeFixture, makeVenue } from './testing/fixtures';
import { TripStore } from './trip-store.service';

describe('TripStore', () => {
  const QUERY: TripQuery = {
    origin: { lat: 50.43, lng: 2.83 },
    label: 'Lens',
    from: '2026-03-13',
    to: '2026-03-15',
    radiusKm: 50,
  };

  let store: TripStore;
  let responses: Subject<FixtureCard[]>[];
  let nextResult: (() => Observable<FixtureCard[]>) | null;

  beforeEach(() => {
    responses = [];
    nextResult = null;
    const api: Partial<DataApi> = {
      searchFixtures: () => {
        if (nextResult) return nextResult();
        const subject = new Subject<FixtureCard[]>();
        responses.push(subject);
        return subject;
      },
    };
    TestBed.configureTestingModule({ providers: [TripStore, { provide: DataApi, useValue: api }] });
    store = TestBed.inject(TripStore);
  });

  const lens = makeFixture({ id: 1, distanceKm: 2 });
  const cup = makeFixture({
    id: 2,
    distanceKm: 30,
    kickoffAt: '2026-03-15T14:00:00Z',
    competition: { name: 'Coupe de Belgique', country: 'Belgique', level: 'cup' },
    venue: makeVenue({ slug: 'autre-stade', name: 'Autre stade' }),
  });

  it('démarre au repos', () => {
    expect(store.status()).toBe('idle');
    expect(store.visible()).toEqual([]);
  });

  it('passe en chargement puis expose les résultats triés et les repères', () => {
    store.search(QUERY);
    expect(store.status()).toBe('loading');
    expect(store.query()).toEqual(QUERY);

    responses[0].next([cup, lens]);
    expect(store.status()).toBe('ready');
    expect(store.total()).toBe(2);
    expect(store.visible().map((f) => f.id)).toEqual([1, 2]);
    expect(store.days().map((d) => d.day)).toEqual(['2026-03-14', '2026-03-15']);
    expect(store.markers().length).toBe(2);
    expect(store.levels()).toEqual(['top', 'cup']);
    expect(store.countries()).toEqual(['Belgique', 'France']);
  });

  it('filtre sans relancer de requête', () => {
    store.search(QUERY);
    responses[0].next([cup, lens]);
    store.setFilters({ slots: [], levels: ['cup'], countries: [] });
    expect(store.visible().map((f) => f.id)).toEqual([2]);
    expect(store.markers().map((m) => m.id)).toEqual(['autre-stade']);
    expect(store.total()).toBe(2);
    expect(responses.length).toBe(1);

    store.clearFilters();
    expect(store.visible().length).toBe(2);
  });

  it('ignore la réponse d’une recherche remplacée par une autre', () => {
    store.search(QUERY);
    store.search({ ...QUERY, radiusKm: 100 });
    responses[0].next([cup]);
    expect(store.status()).toBe('loading');
    responses[1].next([lens]);
    expect(store.visible().map((f) => f.id)).toEqual([1]);
  });

  it('retire les filtres devenus sans objet après une nouvelle recherche', () => {
    store.search(QUERY);
    responses[0].next([cup, lens]);
    store.setFilters({ slots: ['weekend'], levels: ['cup', 'top'], countries: ['Belgique'] });

    store.search({ ...QUERY, radiusKm: 10 });
    responses[1].next([lens]);
    expect(store.filters()).toEqual({ slots: ['weekend'], levels: ['top'], countries: [] });
  });

  it('signale une erreur et permet de réessayer', () => {
    nextResult = () => throwError(() => new Error('réseau'));
    store.search(QUERY);
    expect(store.status()).toBe('error');

    nextResult = null;
    store.retry();
    expect(store.status()).toBe('loading');
    responses[0].next([lens]);
    expect(store.status()).toBe('ready');
  });

  it('revient au repos sans recherche et oublie le stade actif', () => {
    store.search(QUERY);
    responses[0].next([lens]);
    store.setActiveVenue('stade-bollaert-delelis-lens');
    store.search(null);
    expect(store.status()).toBe('idle');
    expect(store.visible()).toEqual([]);
    expect(store.activeVenue()).toBeNull();
  });
});
