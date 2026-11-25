import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { GeolocationService } from '../../core/geolocation.service';
import { MESSAGES } from '../../core/i18n/messages';
import { GeoPoint, TripQuery } from '../../core/models';
import { SeoService } from '../../core/seo.service';
import { ROUTES, tripQueryParams } from '../../core/urls';
import { FooterComponent } from '../../shared/footer/footer';
import { SearchFormComponent } from '../../shared/search/search-form';

/** Accueil : la promesse en une phrase, et la recherche tout de suite. */
@Component({
  selector: 'app-home',
  imports: [FooterComponent, SearchFormComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly t = inject(MESSAGES);
  private readonly router = inject(Router);
  private readonly form = viewChild(SearchFormComponent);
  private readonly position = signal<GeoPoint | null>(null);

  constructor() {
    inject(SeoService).set({
      title: this.t.home.title,
      description: this.t.home.description,
      path: '/',
    });

    // Si la localisation est déjà autorisée, on propose d'emblée « ce week-end, autour de moi ».
    const geolocation = inject(GeolocationService);
    afterNextRender(async () => {
      if (!(await geolocation.alreadyGranted())) return;
      try {
        this.position.set(await geolocation.locate());
      } catch {
        // Pas de position : le formulaire reste vide, rien à signaler.
      }
    });
    // Le formulaire s'active après le reste de la page : on attend qu'il soit là.
    effect(() => {
      const position = this.position();
      const form = this.form();
      if (position && form) form.usePosition(position);
    });
  }

  protected onSearch(query: TripQuery): void {
    void this.router.navigate(['/', ROUTES.trip], { queryParams: tripQueryParams(query) });
  }
}
