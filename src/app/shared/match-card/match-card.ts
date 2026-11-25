import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tag } from 'primeng/tag';
import { formatDistance, formatKickoffDay, formatKickoffTime } from '../../core/format';
import { MESSAGES } from '../../core/i18n/messages';
import { FixtureCard } from '../../core/models';
import { directionsUrl, matchLink } from '../../core/urls';
import { CrestComponent } from '../ui/crest';

/**
 * Carte d'un match : l'heure dans sa pastille, puis les équipes, la compétition, le stade
 * et la distance. Toute la carte mène à la page du match ; « Itinéraire » reste
 * un lien distinct.
 */
@Component({
  selector: 'app-match-card',
  imports: [RouterLink, CrestComponent, Tag],
  templateUrl: './match-card.html',
  styleUrl: './match-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-active]': 'active()',
    '(mouseenter)': 'highlight.emit(fixture().id)',
    '(mouseleave)': 'highlight.emit(null)',
    '(focusin)': 'highlight.emit(fixture().id)',
    '(focusout)': 'highlight.emit(null)',
  },
})
export class MatchCardComponent {
  protected readonly t = inject(MESSAGES);

  readonly fixture = input.required<FixtureCard>();
  /** Vrai quand le match est mis en évidence depuis la carte. */
  readonly active = input(false);
  /** Affiche le jour sous l'heure (inutile quand la liste est déjà groupée par jour). */
  readonly showDay = input(true);
  /** Identifiant du match survolé ou focalisé, `null` quand on le quitte. */
  readonly highlight = output<number | null>();

  protected readonly zone = computed(() => this.fixture().venue?.timezone ?? null);
  protected readonly time = computed(() =>
    formatKickoffTime(this.fixture().kickoffAt, this.zone()),
  );
  protected readonly day = computed(() =>
    formatKickoffDay(this.fixture().kickoffAt, this.zone(), this.t.locale),
  );
  protected readonly distance = computed(() =>
    formatDistance(this.fixture().distanceKm, this.t.locale),
  );
  protected readonly link = computed(() => matchLink(this.fixture().slug));
  protected readonly directions = computed(() => {
    const venue = this.fixture().venue;
    return venue ? directionsUrl('google', venue) : null;
  });
  protected readonly venueLine = computed(() => {
    const venue = this.fixture().venue;
    return venue ? [venue.name, venue.city].filter(Boolean).join(', ') : this.t.match.venueUnknown;
  });
  protected readonly status = computed(() => this.t.match.status[this.fixture().status]);
  protected readonly level = computed(() => {
    const level = this.fixture().competition.level;
    return level === 'other' ? '' : this.t.filters.levels[level];
  });
}
