import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideZoneChangeDetection,
  TransferState,
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { APP_CONFIG, APP_CONFIG_STATE, EMPTY_CONFIG } from './core/config';
import { SpotTheGameTheme } from './theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay(), withIncrementalHydration()),
    provideAnimationsAsync(),
    // PrimeNG : thème de la marque, clair ou sombre selon le réglage du système. Ses styles sont
    // dans une couche CSS, donc ceux du site (src/styles) l'emportent sans !important.
    providePrimeNG({
      theme: {
        preset: SpotTheGameTheme,
        options: { darkModeSelector: 'system', cssLayer: { name: 'primeng', order: 'primeng' } },
      },
    }),
    // Dans le navigateur, la configuration est celle que le serveur a jointe à la page.
    {
      provide: APP_CONFIG,
      useFactory: () => inject(TransferState).get(APP_CONFIG_STATE, EMPTY_CONFIG),
    },
  ],
};
