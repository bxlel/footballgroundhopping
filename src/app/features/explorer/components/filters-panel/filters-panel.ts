import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatchesStoreService } from '../../../../core/matches-store.service';
import { ApiFootballService } from '../../../../core/api-football.service';

type CountryOption = {
  label: string;
  value: string;
};

@Component({
  selector: 'app-filters-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filters-panel.html',
  styleUrls: ['./filters-panel.scss'],
})
export class FiltersPanelComponent {
  private readonly store = inject(MatchesStoreService);
  private readonly api = inject(ApiFootballService);

  countries = signal<CountryOption[]>([]);

  country = signal(this.store.filters().country || '');
  dateFrom = signal(this.store.filters().dateFrom || '');
  dateTo = signal(this.store.filters().dateTo || '');
  city = signal(this.store.filters().city || '');

  constructor() {
    console.log('[FiltersPanel] constructor');
    this.loadCountries();
  }

  private loadCountries() {
    console.log('[FiltersPanel] loadCountries() called');

    this.api.getCountries().subscribe({
      next: (list: string[]) => {
        console.log(
          '[FiltersPanel] getCountries result length:',
          list?.length ?? 0
        );

        const mapped: CountryOption[] = (list || [])
          .filter((name) => !!name)
          .map((name) => ({
            label: name,
            value: name,
          }));

        this.countries.set(mapped);
        console.log('[FiltersPanel] Countries loaded:', mapped.length);
      },
      error: (err) => {
        console.error('[FiltersPanel] Failed to load countries', err);
        this.countries.set([]);
      },
    });
  }

  onCountry(value: string) {
    console.log('[FiltersPanel] onCountry:', value);
    this.country.set(value);
    this.store.updateCountry(value || '');
  }

  onFrom(value: string) {
    console.log('[FiltersPanel] onFrom:', value);
    this.dateFrom.set(value);
    this.store.updateDateFrom(value || null);
  }

  onTo(value: string) {
    console.log('[FiltersPanel] onTo:', value);
    this.dateTo.set(value);
    this.store.updateDateTo(value || null);
  }

  onCity(value: string) {
    console.log('[FiltersPanel] onCity:', value);
    this.city.set(value);
    this.store.updateCity(value || '');
  }

  onSubmit(event: Event) {
    event.preventDefault();
    console.log('[FiltersPanel] onSubmit with:', {
      dateFrom: this.dateFrom(),
      dateTo: this.dateTo(),
      country: this.country(),
      city: this.city(),
    });

    this.store.searchNow();
  }

  onReset() {
    console.log('[FiltersPanel] onReset');
    this.country.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.city.set('');

    this.store.reset();
  }
}
