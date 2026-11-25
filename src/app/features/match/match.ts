import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { fixtureIcs } from '../../core/calendar';
import { DataApi } from '../../core/data-api.service';
import { formatFullDate, formatKickoffDay, formatKickoffTime } from '../../core/format';
import { MESSAGES } from '../../core/i18n/messages';
import { loadState } from '../../core/load-state';
import { localParts } from '../../core/local-time';
import { respond404WhenMissing } from '../../core/not-found-status';
import { SeoService } from '../../core/seo.service';
import { sportsEventJsonLd } from '../../core/structured-data';
import { APP_CONFIG } from '../../core/config';
import {
  DEFAULT_RADIUS_KM,
  directionsUrl,
  matchPath,
  ROUTES,
  teamLink,
  tripQueryParams,
  venueLink,
} from '../../core/urls';
import { FooterComponent } from '../../shared/footer/footer';
import { GoingButtonComponent } from '../../shared/social/going-button';
import { ShareButtonComponent } from '../../shared/social/share-button';
import { CrestComponent } from '../../shared/ui/crest';
import { NotFoundComponent } from '../not-found/not-found';

/** Page d'un match : un bandeau avec l'affiche et l'heure, puis les infos et l'itinéraire. */
@Component({
  selector: 'app-match',
  imports: [
    RouterLink,
    ButtonDirective,
    CrestComponent,
    FooterComponent,
    GoingButtonComponent,
    NotFoundComponent,
    ShareButtonComponent,
    Tag,
  ],
  templateUrl: './match.html',
  styleUrl: './match.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchComponent {
  protected readonly t = inject(MESSAGES);
  private readonly api = inject(DataApi);
  private readonly siteUrl = inject(APP_CONFIG).siteUrl;
  private readonly document = inject(DOCUMENT);

  /** Segment d'URL, fourni par le routeur. */
  readonly slug = input.required<string>();

  protected readonly state = loadState(this.slug, (slug) => this.api.fixtureBySlug(slug));
  protected readonly fixture = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.data : null;
  });

  protected readonly view = computed(() => {
    const fixture = this.fixture();
    if (!fixture) return null;
    const venue = fixture.venue;
    const zone = venue?.timezone ?? null;
    const localDate = localParts(fixture.kickoffAt, zone).date;
    const level = fixture.competition.level;
    return {
      fixture,
      venue,
      time: formatKickoffTime(fixture.kickoffAt, zone),
      shortDay: formatKickoffDay(fixture.kickoffAt, zone, this.t.locale),
      fullDate: formatFullDate(localDate, this.t.locale),
      zoneLabel: zone ? this.t.match.localTime : this.t.match.utcTime,
      level: level === 'other' ? '' : this.t.filters.levels[level],
      status: this.t.match.status[fixture.status],
      shareText: this.t.social.shareMatch(
        fixture.home.name,
        fixture.away.name,
        formatKickoffDay(fixture.kickoffAt, zone, this.t.locale),
      ),
      upcoming: fixture.status === 'scheduled' || fixture.status === 'live',
      homeLink: teamLink(fixture.home.slug),
      awayLink: teamLink(fixture.away.slug),
      venueLink: venue ? venueLink(venue.slug) : null,
      google: venue ? directionsUrl('google', venue) : null,
      apple: venue ? directionsUrl('apple', venue) : null,
      around: venue?.position
        ? tripQueryParams({
            origin: venue.position,
            label: venue.name,
            from: localDate,
            to: localDate,
            radiusKm: DEFAULT_RADIUS_KM,
          })
        : null,
    };
  });

  protected readonly tripRoute = ['/', ROUTES.trip];

  /** Télécharge l'événement d'agenda du match (fichier .ics). */
  protected downloadCalendar(): void {
    const fixture = this.fixture();
    const view = this.document.defaultView;
    if (!fixture || !view) return;
    const origin = this.siteUrl || this.document.location.origin;
    const blob = new Blob([fixtureIcs(fixture, origin)], { type: 'text/calendar;charset=utf-8' });
    const url = view.URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `${fixture.slug}.ics`;
    link.click();
    view.URL.revokeObjectURL(url);
  }

  constructor() {
    const seo = inject(SeoService);
    respond404WhenMissing(this.state);

    effect(() => {
      const view = this.view();
      if (!view) return;
      const { fixture, venue } = view;
      seo.set({
        title: this.t.match.page.title(fixture.home.name, fixture.away.name, view.fullDate),
        description: this.t.match.page.description({
          home: fixture.home.name,
          away: fixture.away.name,
          competition: fixture.competition.name,
          day: view.fullDate,
          venue: venue ? [venue.name, venue.city].filter(Boolean).join(', ') : '',
        }),
        path: matchPath(fixture.slug),
        jsonLd: sportsEventJsonLd(fixture, this.siteUrl),
      });
    });
  }
}
