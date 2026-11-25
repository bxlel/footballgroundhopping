import { effect, inject, RESPONSE_INIT, Signal } from '@angular/core';
import { LoadState } from './load-state';

/**
 * Pendant le rendu serveur, répond 404 quand la donnée de la page n'existe pas :
 * un moteur de recherche ne doit pas indexer une fiche vide.
 * À appeler dans un contexte d'injection.
 */
export function respond404WhenMissing(state: Signal<LoadState<unknown>>): void {
  const response = inject(RESPONSE_INIT, { optional: true });
  if (!response) return;
  effect(() => {
    if (state().status === 'missing') response.status = 404;
  });
}
