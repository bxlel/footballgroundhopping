import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FixtureCard } from '../../core/models';
import { MatchCardComponent } from './match-card';

/** Liste de matchs à venir, pour les pages stade et club. */
@Component({
  selector: 'app-fixture-list',
  imports: [MatchCardComponent],
  template: `
    @if (fixtures().length) {
      <ul class="fl">
        @for (fixture of fixtures(); track fixture.id) {
          <li><app-match-card [fixture]="fixture" /></li>
        }
      </ul>
    } @else {
      <p class="notice">{{ emptyText() }}</p>
    }
  `,
  styles: `
    .fl {
      display: grid;
      gap: var(--s-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixtureListComponent {
  readonly fixtures = input.required<readonly FixtureCard[]>();
  readonly emptyText = input.required<string>();
}
