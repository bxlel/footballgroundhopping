import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { countActive, SLOT_ORDER, toggle } from '../../core/filters';
import { MESSAGES } from '../../core/i18n/messages';
import { Level, Slot, TripFilters } from '../../core/models';
import { ButtonDirective } from 'primeng/button';
import { ChipDirective } from '../../shared/ui/chip';

/** Filtres des résultats : créneau, niveau, pays. Ils s'appliquent tout de suite. */
@Component({
  selector: 'app-trip-filters',
  imports: [ChipDirective, ButtonDirective],
  template: `
    <div class="tf" role="group" [attr.aria-label]="t.filters.title">
      <fieldset class="tf__group">
        <legend class="visually-hidden">{{ t.filters.slot }}</legend>
        @for (slot of slots; track slot) {
          <button appChip [pressed]="filters().slots.includes(slot)" (click)="toggleSlot(slot)">
            {{ t.filters.slots[slot] }}
          </button>
        }
      </fieldset>
      @if (levels().length > 1) {
        <fieldset class="tf__group">
          <legend class="visually-hidden">{{ t.filters.level }}</legend>
          @for (level of levels(); track level) {
            <button
              appChip
              [pressed]="filters().levels.includes(level)"
              (click)="toggleLevel(level)"
            >
              {{ t.filters.levels[level] }}
            </button>
          }
        </fieldset>
      }
      @if (countries().length > 1) {
        <fieldset class="tf__group">
          <legend class="visually-hidden">{{ t.filters.country }}</legend>
          @for (country of countries(); track country) {
            <button
              appChip
              [pressed]="filters().countries.includes(country)"
              (click)="toggleCountry(country)"
            >
              {{ country }}
            </button>
          }
        </fieldset>
      }
      @if (active() > 0) {
        <button pButton text type="button" size="small" class="tf__clear" (click)="clear()">
          {{ t.filters.clear }}
        </button>
      }
    </div>
  `,
  styles: `
    .tf {
      display: flex;
      align-items: center;
      gap: var(--s-2) var(--s-4);
      padding: var(--s-1) var(--page-pad) var(--s-3);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tf__group {
      display: flex;
      flex: none;
      gap: var(--s-2);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .tf__group + .tf__group {
      padding-left: var(--s-4);
      border-left: 1px solid var(--line);
    }
    .tf__clear {
      flex: none;
      white-space: nowrap;
    }
    @media (min-width: 900px) {
      .tf {
        flex-wrap: wrap;
        overflow: visible;
      }
      .tf__group {
        flex-wrap: wrap;
      }
      .tf__group + .tf__group {
        padding-left: 0;
        border-left: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripFiltersComponent {
  protected readonly t = inject(MESSAGES);

  readonly filters = input.required<TripFilters>();
  /** Niveaux et pays présents dans les résultats : on ne propose que ce qui existe. */
  readonly levels = input<readonly Level[]>([]);
  readonly countries = input<readonly string[]>([]);
  readonly filtersChange = output<TripFilters>();

  protected readonly slots = SLOT_ORDER;
  protected readonly active = computed(() => countActive(this.filters()));

  protected toggleSlot(slot: Slot): void {
    this.filtersChange.emit({ ...this.filters(), slots: toggle(this.filters().slots, slot) });
  }

  protected toggleLevel(level: Level): void {
    this.filtersChange.emit({ ...this.filters(), levels: toggle(this.filters().levels, level) });
  }

  protected toggleCountry(country: string): void {
    this.filtersChange.emit({
      ...this.filters(),
      countries: toggle(this.filters().countries, country),
    });
  }

  protected clear(): void {
    this.filtersChange.emit({ slots: [], levels: [], countries: [] });
  }
}
