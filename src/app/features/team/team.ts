import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { DataApi } from '../../core/data-api.service';
import { MESSAGES } from '../../core/i18n/messages';
import { loadState } from '../../core/load-state';
import { FixtureCard } from '../../core/models';
import { respond404WhenMissing } from '../../core/not-found-status';
import { SeoService } from '../../core/seo.service';
import { teamPath, venueLink } from '../../core/urls';
import { FooterComponent } from '../../shared/footer/footer';
import { FixtureListComponent } from '../../shared/match-card/fixture-list';
import { CrestComponent } from '../../shared/ui/crest';
import { NotFoundComponent } from '../not-found/not-found';

/** Fiche d'un club : son stade et ses prochains matchs, à domicile comme à l'extérieur. */
@Component({
  selector: 'app-team',
  imports: [RouterLink, CrestComponent, FixtureListComponent, FooterComponent, NotFoundComponent],
  template: `
    @switch (state().status) {
      @case ('missing') {
        <app-not-found />
      }
      @case ('error') {
        <div class="page">
          <div class="notice notice--error">
            <h1 class="notice__title">{{ t.loadError.title }}</h1>
            <p>{{ t.loadError.body }}</p>
          </div>
        </div>
      }
      @case ('ready') {
        @if (view(); as v) {
          <article class="page team">
            <header class="hero-band">
              @if (v.team.country) {
                <p class="eyebrow">{{ v.team.country }}</p>
              }
              <h1 class="title team__name">
                <app-crest [name]="v.team.name" [logoUrl]="v.team.logoUrl" [size]="56" />
                {{ v.team.name }}
              </h1>
            </header>

            @if (v.team.venue; as venue) {
              <dl class="team__facts panel">
                <dt class="eyebrow">{{ t.team.page.venue }}</dt>
                <dd>
                  <a class="link" [routerLink]="v.venueLink">{{ venue.name }}</a>{{
                    venue.city ? ', ' + venue.city : ''
                  }}
                </dd>
              </dl>
            }

            <section class="team__section">
              <h2 class="subtitle">{{ t.team.page.upcoming }}</h2>
              <app-fixture-list [fixtures]="v.fixtures" [emptyText]="t.team.page.noUpcoming" />
            </section>
          </article>
          <app-footer />
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .team {
      flex: 1;
    }
    .team__name {
      display: flex;
      align-items: center;
      gap: var(--s-3);
      margin-top: var(--s-2);
      --crest-size: 3.5rem;
      overflow-wrap: anywhere;
    }
    .team__facts {
      margin: var(--s-4) 0 0;
    }
    .team__facts dd {
      margin-top: var(--s-1);
      font-size: var(--fs-lg);
      font-weight: 600;
    }
    .team__section {
      display: grid;
      gap: var(--s-3);
      margin-top: var(--s-7);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamComponent {
  protected readonly t = inject(MESSAGES);
  private readonly api = inject(DataApi);

  readonly slug = input.required<string>();

  protected readonly state = loadState(this.slug, (slug) =>
    this.api.teamBySlug(slug).pipe(
      switchMap((team) =>
        team
          ? forkJoin({
              team: of(team),
              fixtures: this.api
                .upcomingForTeam(slug)
                .pipe(catchError(() => of<FixtureCard[]>([]))),
            })
          : of(null),
      ),
    ),
  );

  protected readonly view = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') return null;
    const { team, fixtures } = state.data;
    return { team, fixtures, venueLink: team.venue ? venueLink(team.venue.slug) : null };
  });

  constructor() {
    const seo = inject(SeoService);
    respond404WhenMissing(this.state);

    effect(() => {
      const view = this.view();
      if (!view) return;
      seo.set({
        title: this.t.team.page.title(view.team.name),
        description: this.t.team.page.description(view.team.name, view.team.venue?.name ?? null),
        path: teamPath(view.team.slug),
      });
    });
  }
}
