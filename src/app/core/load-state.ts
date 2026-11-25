import { Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, startWith, switchMap } from 'rxjs';

/** État d'un chargement de page : en cours, prêt, introuvable ou en erreur. */
export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing' }
  | { status: 'error' };

/**
 * Charge une donnée à chaque changement de paramètre et expose l'état sous forme de signal.
 * Le chargeur rend `null` quand la donnée n'existe pas.
 * À appeler dans un contexte d'injection (initialiseur de champ ou constructeur).
 */
export function loadState<P, T>(
  params: Signal<P>,
  loader: (params: P) => Observable<T | null>,
): Signal<LoadState<T>> {
  const loading: LoadState<T> = { status: 'loading' };
  return toSignal(
    toObservable(params).pipe(
      switchMap((value) =>
        loader(value).pipe(
          map((data): LoadState<T> =>
            data === null ? { status: 'missing' } : { status: 'ready', data },
          ),
          startWith(loading),
          catchError(() => of<LoadState<T>>({ status: 'error' })),
        ),
      ),
    ),
    { initialValue: loading },
  );
}
