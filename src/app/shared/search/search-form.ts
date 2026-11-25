import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataApi } from '../../core/data-api.service';
import { GeolocationFailure, GeolocationService } from '../../core/geolocation.service';
import { MESSAGES } from '../../core/i18n/messages';
import { GeoPoint, Period, Place, TripQuery } from '../../core/models';
import {
  addDays,
  isIsoDate,
  matchingPreset,
  MAX_PERIOD_DAYS,
  normalizePeriod,
  PERIOD_PRESETS,
  PeriodPreset,
  presetPeriod,
  toIsoDate,
} from '../../core/period';
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS } from '../../core/urls';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { FieldComponent } from '../ui/field';
import { PlaceInputComponent } from './place-input';

let nextId = 0;

/** Le formulaire du mode Voyage : où, quand, jusqu'où. Sert sur l'accueil et sur les résultats. */
@Component({
  selector: 'app-search-form',
  imports: [
    ButtonDirective,
    FieldComponent,
    FormsModule,
    InputText,
    PlaceInputComponent,
    SelectButton,
  ],
  templateUrl: './search-form.html',
  styleUrl: './search-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFormComponent {
  protected readonly t = inject(MESSAGES);
  private readonly api = inject(DataApi);
  private readonly geolocation = inject(GeolocationService);

  /** Recherche à afficher au départ (page de résultats). */
  readonly initial = input<TripQuery | null>(null);
  readonly submitted = output<TripQuery>();

  /** Choix du « Quand ? » : les raccourcis, puis « Autres dates ». */
  protected readonly whenOptions: { label: string; value: PeriodPreset | 'custom' }[] = [
    ...PERIOD_PRESETS.map((preset) => ({ label: this.t.search.presets[preset], value: preset })),
    { label: this.t.search.otherDates, value: 'custom' },
  ];
  protected readonly radiusChoices = RADIUS_OPTIONS.map((km) => ({
    label: this.t.search.radius(km),
    value: km,
  }));
  protected readonly today = toIsoDate(new Date());
  protected readonly maxDate = addDays(this.today, MAX_PERIOD_DAYS - 1);
  protected readonly whereId = `ou-${nextId++}`;

  protected readonly text = linkedSignal(() => this.initial()?.label ?? '');
  private readonly origin = linkedSignal<GeoPoint | null>(() => this.initial()?.origin ?? null);
  protected readonly period = linkedSignal<Period>(() => {
    const initial = this.initial();
    return initial ? { from: initial.from, to: initial.to } : presetPeriod('weekend', this.today);
  });
  protected readonly radiusKm = linkedSignal(() => this.initial()?.radiusKm ?? DEFAULT_RADIUS_KM);
  protected readonly preset = computed(() => matchingPreset(this.period(), this.today));
  /** Vrai quand les champs de dates sont affichés (dépend de la recherche initiale, pas de la saisie). */
  protected readonly customDates = linkedSignal({
    source: this.initial,
    computation: (initial) => (initial ? matchingPreset(initial, this.today) === null : false),
  });

  protected readonly error = signal('');
  protected readonly busy = signal<'locating' | 'searching' | null>(null);

  private readonly placeInput = viewChild.required(PlaceInputComponent);

  /** Pré-remplit « Ma position » (utilisé par l'accueil quand la localisation est déjà autorisée). */
  usePosition(point: GeoPoint): void {
    if (this.text().trim()) return;
    this.origin.set(point);
    this.text.set(this.t.search.myPosition);
  }

  protected onTextChange(value: string): void {
    this.text.set(value);
    // Le texte ne correspond plus au lieu choisi : il faudra le retrouver à la validation.
    this.origin.set(null);
    this.error.set('');
  }

  protected onPicked(place: Place): void {
    this.origin.set({ lat: place.lat, lng: place.lng });
    this.text.set(place.name);
    this.error.set('');
  }

  protected readonly whenChoice = computed<PeriodPreset | 'custom'>(() =>
    this.customDates() ? 'custom' : (this.preset() ?? 'custom'),
  );

  protected chooseWhen(choice: PeriodPreset | 'custom'): void {
    if (choice === 'custom') {
      this.customDates.set(true);
      return;
    }
    this.period.set(presetPeriod(choice, this.today));
    this.customDates.set(false);
  }

  protected onDate(bound: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!isIsoDate(value)) return;
    const current = this.period();
    const next =
      bound === 'from' ? { from: value, to: current.to } : { from: current.from, to: value };
    // Une date de début après la fin déplace la fin, plutôt que d'inverser les deux.
    if (bound === 'from' && next.to < next.from) next.to = next.from;
    this.period.set(normalizePeriod(next.from, next.to, this.today));
  }

  protected async aroundMe(): Promise<void> {
    this.busy.set('locating');
    this.error.set('');
    try {
      const point = await this.geolocation.locate();
      this.origin.set(point);
      this.text.set(this.t.search.myPosition);
    } catch (failure) {
      this.error.set(
        (failure as GeolocationFailure) === 'denied'
          ? this.t.search.errors.geoDenied
          : this.t.search.errors.geoUnavailable,
      );
    } finally {
      this.busy.set(null);
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const label = this.text().trim();
    let origin = this.origin();

    if (!origin && !label) {
      this.error.set(this.t.search.errors.missingPlace);
      return;
    }

    let resolvedLabel = label;
    if (!origin) {
      this.busy.set('searching');
      const place = await this.resolve(label);
      this.busy.set(null);
      if (!place) {
        this.error.set(this.t.search.errors.placeNotFound(label));
        return;
      }
      origin = { lat: place.lat, lng: place.lng };
      resolvedLabel = place.name;
      this.origin.set(origin);
      this.text.set(resolvedLabel);
    }

    this.error.set('');
    this.submitted.emit({
      origin,
      label: resolvedLabel,
      ...this.period(),
      radiusKm: this.radiusKm(),
    });
  }

  /** Texte libre -> lieu : la première suggestion affichée, sinon notre base, sinon le géocodeur. */
  private async resolve(label: string): Promise<Place | null> {
    const shown = this.placeInput().suggestions()[0];
    if (shown) return shown;
    try {
      const [known] = await firstValueFrom(this.api.searchPlaces(label));
      if (known) return known;
    } catch {
      // Base indisponible : on tente quand même le géocodeur.
    }
    try {
      return await firstValueFrom(this.api.geocode(label));
    } catch {
      return null;
    }
  }
}
