import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { ShareButtonComponent } from '../../shared/social/share-button';
import { Tag } from 'primeng/tag';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { DataApi } from '../../core/data-api.service';
import { formatCount } from '../../core/format';
import { MESSAGES } from '../../core/i18n/messages';
import { loadState } from '../../core/load-state';
import { MapMarker } from '../../core/markers';
import { FixtureCard } from '../../core/models';
import { respond404WhenMissing } from '../../core/not-found-status';
import { presetPeriod, toIsoDate } from '../../core/period';
import { SeoService } from '../../core/seo.service';
import {
  DEFAULT_RADIUS_KM,
  directionsUrl,
  ROUTES,
  tripQueryParams,
  venuePath,
} from '../../core/urls';
import { FooterComponent } from '../../shared/footer/footer';
import { MapViewComponent } from '../../shared/map/map-view';
import { FixtureListComponent } from '../../shared/match-card/fixture-list';
import { NotFoundComponent } from '../not-found/not-found';

/** Fiche d'un stade : où il est, ce qui s'y joue bientôt, et bientôt les infos pratiques. */
@Component({
  selector: 'app-venue',
  imports: [
    RouterLink,
    ButtonDirective,
    FixtureListComponent,
    FooterComponent,
    MapViewComponent,
    NotFoundComponent,
    ShareButtonComponent,
    Tag,
  ],
  templateUrl: './venue.html',
  styleUrl: './venue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VenueComponent {
  protected readonly t = inject(MESSAGES);
  private readonly api = inject(DataApi);

  readonly slug = input.required<string>();

  protected readonly state = loadState(this.slug, (slug) =>
    this.api.venueBySlug(slug).pipe(
      switchMap((venue) =>
        venue
          ? forkJoin({
              venue: of(venue),
              // Sans la liste des matchs, la fiche reste utile : on l'affiche quand même.
              fixtures: this.api
                .upcomingAtVenue(slug)
                .pipe(catchError(() => of<FixtureCard[]>([]))),
            })
          : of(null),
      ),
    ),
  );

  protected readonly view = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') return null;
    const { venue, fixtures } = state.data;
    const markers: MapMarker[] = venue.position
      ? [
          {
            id: venue.slug,
            position: venue.position,
            name: venue.name,
            count: fixtures.length,
            approximate: venue.approximate,
          },
        ]
      : [];
    return {
      venue,
      fixtures,
      markers,
      place: [venue.city, venue.country].filter(Boolean).join(', '),
      capacity: venue.capacity
        ? this.t.venue.page.seats(formatCount(venue.capacity, this.t.locale))
        : '',
      surface: venue.surface
        ? (this.t.venue.page.surfaces[venue.surface.toLowerCase()] ?? venue.surface)
        : '',
      directions: directionsUrl('google', venue),
      around: venue.position
        ? tripQueryParams({
            origin: venue.position,
            label: venue.name,
            ...presetPeriod('week', toIsoDate(new Date())),
            radiusKm: DEFAULT_RADIUS_KM,
          })
        : null,
    };
  });

  protected readonly tripRoute = ['/', ROUTES.trip];

  constructor() {
    const seo = inject(SeoService);
    respond404WhenMissing(this.state);

    effect(() => {
      const view = this.view();
      if (!view) return;
      seo.set({
        title: this.t.venue.page.title(view.venue.name, view.venue.city),
        description: this.t.venue.page.description(
          view.venue.name,
          view.venue.city,
          view.fixtures.length,
        ),
        path: venuePath(view.venue.slug),
      });
    });
  }
}
