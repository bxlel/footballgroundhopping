import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, EMPTY_CONFIG } from './config';
import { DataApi } from './data-api.service';
import { toIsoDate } from './period';

describe('DataApi', () => {
  let api: DataApi;
  let http: HttpTestingController;

  function setup(config = { supabaseUrl: 'https://db.test', supabaseAnonKey: 'anon' }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { ...EMPTY_CONFIG, ...config } },
      ],
    });
    api = TestBed.inject(DataApi);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  it('cherche les matchs par GET, avec la clé publique en en-tête', () => {
    setup();
    let count = -1;
    api
      .searchFixtures({
        origin: { lat: 50.43, lng: 2.83 },
        label: 'Lens',
        from: '2026-11-27',
        to: '2026-11-29',
        radiusKm: 50,
      })
      .subscribe((fixtures) => (count = fixtures.length));

    const req = http.expectOne((r) => r.url === 'https://db.test/rest/v1/rpc/search_fixtures');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('apikey')).toBe('anon');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    expect(req.request.params.get('origin_lat')).toBe('50.43');
    expect(req.request.params.get('radius_km')).toBe('50');
    expect(req.request.params.get('date_to')).toBe('2026-11-29');
    req.flush([]);
    expect(count).toBe(0);
  });

  it('lit une page par son slug', () => {
    setup();
    let found: unknown = 'pas encore';
    api.venueBySlug('anfield-liverpool').subscribe((venue) => (found = venue));
    const req = http.expectOne((r) => r.url === 'https://db.test/rest/v1/venue_pages');
    expect(req.request.params.get('slug')).toBe('eq.anfield-liverpool');
    req.flush([]);
    expect(found).toBeNull();
  });

  it('demande les prochains matchs d’un club, à domicile comme à l’extérieur', () => {
    setup();
    api.upcomingForTeam('lens').subscribe();
    const req = http.expectOne((r) => r.url === 'https://db.test/rest/v1/fixture_cards');
    expect(req.request.params.get('or')).toBe('(home_slug.eq.lens,away_slug.eq.lens)');
    expect(req.request.params.get('kickoff_at')).toBe(`gte.${toIsoDate(new Date())}`);
    expect(req.request.params.get('order')).toBe('kickoff_at.asc');
    req.flush([]);
  });

  it('géocode une adresse par la fonction serveur', () => {
    setup();
    let name = '';
    api.geocode('Hôtel de ville, Lens').subscribe((place) => (name = place?.name ?? ''));
    const req = http.expectOne((r) => r.url === '/.netlify/functions/geocode');
    expect(req.request.params.get('q')).toBe('Hôtel de ville, Lens');
    req.flush({
      place: { kind: 'address', name: 'Hôtel de Ville', detail: 'Lens', lat: 50.4, lng: 2.8 },
    });
    expect(name).toBe('Hôtel de Ville');
  });

  it('marque « J’y vais » par un POST et lit le compteur renvoyé', () => {
    setup();
    let state: unknown;
    api.setGoing('2026-03-14-lens-lille', 'appareil-1', true).subscribe((value) => (state = value));
    const req = http.expectOne('https://db.test/rest/v1/rpc/set_going');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      p_fixture_slug: '2026-03-14-lens-lille',
      p_device_id: 'appareil-1',
      p_going: true,
    });
    req.flush([{ going: true, going_count: 12 }]);
    expect(state).toEqual({ going: true, goingCount: 12 });
  });

  it('lit les matchs marqués par cet appareil et la date de synchronisation', () => {
    setup();
    let mine: string[] = [];
    api.myGoing('appareil-1', ['a', 'b']).subscribe((value) => (mine = value));
    http.expectOne('https://db.test/rest/v1/rpc/my_going').flush(['a', 42, null]);
    expect(mine).toEqual(['a']);

    let synced: string | null = 'inconnu';
    api.lastSync().subscribe((value) => (synced = value));
    http
      .expectOne((r) => r.url === 'https://db.test/rest/v1/rpc/data_status')
      .flush([{ fixtures_synced_at: null, upcoming_fixtures: 0 }]);
    expect(synced).toBeNull();
  });

  it('échoue sans appel réseau quand Supabase n’est pas configuré', () => {
    setup({ supabaseUrl: '', supabaseAnonKey: '' });
    let failed = false;
    api.searchPlaces('lens').subscribe({ error: () => (failed = true) });
    expect(failed).toBeTrue();
  });
});
