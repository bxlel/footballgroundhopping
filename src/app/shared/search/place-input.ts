import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AutoComplete,
  AutoCompleteCompleteEvent,
  AutoCompleteSelectEvent,
} from 'primeng/autocomplete';
import { catchError, of } from 'rxjs';
import { DataApi } from '../../core/data-api.service';
import { MESSAGES } from '../../core/i18n/messages';
import { Place } from '../../core/models';

/**
 * Champ « Où ? » avec suggestions (villes et stades de notre base), bâti sur l'AutoComplete
 * de PrimeNG, qui gère le clavier et les attributs ARIA. Sans suggestion choisie, le texte
 * libre reste utilisable : le formulaire le fera géocoder à la validation.
 */
@Component({
  selector: 'app-place-input',
  imports: [AutoComplete, FormsModule],
  template: `
    <p-autocomplete
      fluid
      [optionLabel]="optionLabel"
      [inputId]="inputId()"
      [ngModel]="text()"
      [suggestions]="suggestions()"
      [minLength]="2"
      [delay]="250"
      [placeholder]="t.search.wherePlaceholder"
      [invalid]="invalid()"
      [showEmptyMessage]="true"
      [emptyMessage]="t.search.suggestions.none"
      (ngModelChange)="onModelChange($event)"
      (completeMethod)="search($event)"
      (onSelect)="pick($event)"
    >
      <ng-template #item let-place>
        <span class="pi__option">
          <span class="pi__name">{{ place.name }}</span>&ngsp;
          <span class="pi__detail">{{ detail(place) }}</span>
        </span>
      </ng-template>
    </p-autocomplete>
  `,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 12rem;
    }
    .pi__option {
      display: grid;
      gap: 0.125rem;
    }
    .pi__name {
      font-weight: 700;
    }
    .pi__detail {
      font-size: var(--fs-xs);
      color: var(--ink-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceInputComponent {
  protected readonly t = inject(MESSAGES);
  private readonly api = inject(DataApi);

  readonly inputId = input.required<string>();
  readonly invalid = input(false);
  /** Texte du champ (liaison bidirectionnelle). */
  readonly text = model('');
  /** Émis quand le visiteur choisit une suggestion. */
  readonly picked = output<Place>();

  /** Dernières suggestions reçues ; le formulaire prend la première si rien n'a été choisi. */
  readonly suggestions = signal<Place[]>([]);

  private readonly autocomplete = viewChild.required(AutoComplete);

  /** « Ville · Hauts-de-France, France » */
  protected detail(place: Place): string {
    const kind = this.t.search.suggestions.kinds[place.kind];
    return place.detail ? `${kind} · ${place.detail}` : kind;
  }

  /** Nom lu par les lecteurs d'écran pour une suggestion : le même texte que celui affiché. */
  protected readonly optionLabel = (place: Place): string => `${place.name} ${this.detail(place)}`;

  protected search(event: AutoCompleteCompleteEvent): void {
    this.api
      .searchPlaces(event.query.trim())
      .pipe(catchError(() => of<Place[]>([])))
      .subscribe((places) => this.suggestions.set(places));
  }

  /** Le modèle de l'AutoComplete est le texte saisi, ou le lieu choisi dans la liste. */
  protected onModelChange(value: string | Place | null): void {
    if (typeof value === 'string') {
      if (value.trim().length < 2) this.suggestions.set([]);
      this.text.set(value);
    } else if (value === null) {
      this.suggestions.set([]);
      this.text.set('');
    }
  }

  protected pick(event: AutoCompleteSelectEvent): void {
    const place = event.value as Place;
    this.suggestions.set([]);
    this.text.set(place.name);
    // Le champ garde le nom seul, pas le libellé complet de la suggestion.
    this.autocomplete().writeValue(place.name);
    this.picked.emit(place);
  }
}
