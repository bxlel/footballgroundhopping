import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { formatDay } from '../../core/format';
import { DataApi } from '../../core/data-api.service';
import { countActive } from '../../core/filters';
import { staleHours } from '../../core/freshness';
import { GoingService } from '../../core/going.service';
import { MESSAGES } from '../../core/i18n/messages';
import { TripQuery } from '../../core/models';
import { daysBetween, presetPeriod, toIsoDate } from '../../core/period';
import { SeoService } from '../../core/seo.service';
import { TripStore } from '../../core/trip-store.service';
import { parseTripQuery, RADIUS_OPTIONS, ROUTES, tripQueryParams } from '../../core/urls';
import { MapViewComponent } from '../../shared/map/map-view';
import { MatchCardComponent } from '../../shared/match-card/match-card';
import { SearchFormComponent } from '../../shared/search/search-form';
import { TripFiltersComponent } from './trip-filters';

type Sheet = 'peek' | 'half' | 'full';

/** Hauteur du panneau replié, en pixels (voir trip.scss). */
const PEEK_PX = 152;
const HALF_RATIO = 0.56;
const DESKTOP_QUERY = '(min-width: 900px)';
/** En dessous de ce déplacement, un appui sur la poignée est un clic, pas un glissement. */
const DRAG_THRESHOLD_PX = 6;

/**
 * Résultats du mode Voyage : la carte en héros, la liste à côté (desktop) ou dans un
 * panneau tirable par-dessus (mobile). Survoler un match met son stade en évidence
 * sur la carte, et inversement.
 */
@Component({
  selector: 'app-trip',
  imports: [
    MapViewComponent,
    MatchCardComponent,
    SearchFormComponent,
    TripFiltersComponent,
    ButtonDirective,
    Skeleton,
  ],
  providers: [TripStore],
  templateUrl: './trip.html',
  styleUrl: './trip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripComponent {
  protected readonly t = inject(MESSAGES);
  protected readonly store = inject(TripStore);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly params = toSignal(inject(ActivatedRoute).queryParams, { initialValue: {} });
  private readonly today = toIsoDate(new Date());

  protected readonly query = computed(() => parseTripQuery(this.params(), this.today));
  protected readonly title = computed(() => this.t.trip.title(this.query()?.label ?? ''));
  protected readonly summary = computed(() => {
    const query = this.store.query();
    if (!query) return '';
    switch (this.store.status()) {
      case 'loading':
        return this.t.trip.loading;
      case 'error':
        return this.t.trip.error.title;
      case 'ready': {
        const total = this.store.total();
        const shown = this.store.visible().length;
        return shown === total
          ? this.t.trip.summary(total, query.radiusKm)
          : this.t.trip.filtered(shown, total);
      }
      default:
        return '';
    }
  });
  protected readonly filtersActive = computed(() => countActive(this.store.filters()) > 0);
  protected readonly widerRadius = computed(() => {
    const current = this.store.query()?.radiusKm ?? 0;
    return RADIUS_OPTIONS.find((option) => option > current) ?? null;
  });
  protected readonly canExtendDates = computed(() => {
    const query = this.store.query();
    return !!query && daysBetween(query.from, query.to) < 6;
  });

  /** Ancienneté des données en heures quand elles datent, sinon `null`. */
  protected readonly stale = signal<number | null>(null);

  // ----- Panneau de liste (mobile) -----
  protected readonly sheet = signal<Sheet>('half');
  protected readonly dragHeight = signal<number | null>(null);
  protected readonly editing = signal(false);
  private readonly desktop = signal(false);
  private readonly viewportHeight = signal(0);
  protected readonly mapInset = computed(() => {
    if (this.desktop() || !this.viewportHeight()) return 0;
    return this.sheet() === 'peek' ? PEEK_PX : Math.round(this.viewportHeight() * HALF_RATIO);
  });
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private drag: { startY: number; startHeight: number; moved: boolean } | null = null;

  constructor() {
    const seo = inject(SeoService);

    effect(() => this.store.search(this.query()));
    effect(() => {
      seo.set({
        title: this.t.trip.pageTitle(this.query()?.label ?? ''),
        description: this.t.trip.description,
        path: `/${ROUTES.trip}`,
        noindex: true,
      });
    });

    // Dans le navigateur seulement : l'état « J'y vais » de cet appareil et la fraîcheur des données.
    const going = inject(GoingService);
    const api = inject(DataApi);
    effect(() => {
      const slugs = this.store.visible().map((fixture) => fixture.slug);
      if (this.isBrowser && slugs.length) void going.load(slugs.slice(0, 200));
    });
    afterNextRender(() => {
      api.lastSync().subscribe({
        next: (syncedAt) => this.stale.set(staleHours(syncedAt)),
        error: () => this.stale.set(null),
      });
    });

    afterNextRender(() => {
      const media = window.matchMedia(DESKTOP_QUERY);
      const measure = () => {
        this.desktop.set(media.matches);
        this.viewportHeight.set(this.panel()?.nativeElement.parentElement?.clientHeight ?? 0);
      };
      measure();
      media.addEventListener('change', measure);
      window.addEventListener('resize', measure, { passive: true });
    });
  }

  protected dayHeading(day: string): string {
    return formatDay(day, this.t.locale);
  }

  protected onSearch(query: TripQuery): void {
    this.editing.set(false);
    void this.router.navigate([], { queryParams: tripQueryParams(query) });
  }

  protected widen(radiusKm: number): void {
    const query = this.store.query();
    if (query) this.onSearch({ ...query, radiusKm });
  }

  protected extendDates(): void {
    const query = this.store.query();
    if (query) this.onSearch({ ...query, ...presetPeriod('week', this.today) });
  }

  /** Un repère a été choisi sur la carte : on amène son premier match sous les yeux. */
  protected onMarkerSelect(venueSlug: string): void {
    const fixture = this.store.visible().find((item) => item.venue?.slug === venueSlug);
    if (!fixture || !this.isBrowser) return;
    this.store.setActiveVenue(venueSlug);
    if (this.sheet() === 'peek') this.sheet.set('half');
    const card = this.list()?.nativeElement.querySelector<HTMLElement>(`#match-${fixture.id}`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  }

  protected onCardHighlight(fixtureId: number | null): void {
    const fixture =
      fixtureId === null ? null : this.store.visible().find((item) => item.id === fixtureId);
    this.store.setActiveVenue(fixture?.venue?.slug ?? null);
  }

  // ----- Poignée du panneau : clic pour basculer, glissement pour régler -----

  protected onHandleDown(event: PointerEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel || this.desktop()) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { startY: event.clientY, startHeight: panel.offsetHeight, moved: false };
  }

  protected onHandleMove(event: PointerEvent): void {
    if (!this.drag) return;
    const delta = this.drag.startY - event.clientY;
    if (Math.abs(delta) > DRAG_THRESHOLD_PX) this.drag.moved = true;
    if (this.drag.moved) {
      const max = this.viewportHeight() || window.innerHeight;
      this.dragHeight.set(Math.min(max, Math.max(PEEK_PX, this.drag.startHeight + delta)));
    }
  }

  protected onHandleUp(): void {
    const drag = this.drag;
    this.drag = null;
    const height = this.dragHeight();
    this.dragHeight.set(null);
    if (!drag?.moved || height === null) return;

    const max = this.viewportHeight() || window.innerHeight;
    const stops: [Sheet, number][] = [
      ['peek', PEEK_PX],
      ['half', max * HALF_RATIO],
      ['full', max],
    ];
    const [nearest] = stops.reduce((best, stop) =>
      Math.abs(stop[1] - height) < Math.abs(best[1] - height) ? stop : best,
    );
    this.sheet.set(nearest);
  }

  /** Clic (ou Entrée / Espace) sur la poignée : la carte ou la liste. */
  protected toggleSheet(): void {
    this.sheet.update((state) => (state === 'peek' ? 'half' : 'peek'));
  }
}
