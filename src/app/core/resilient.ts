import { HttpErrorResponse } from '@angular/common/http';
import {
  MonoTypeOperatorFunction,
  pipe,
  retry,
  throwError,
  timeout,
  TimeoutError,
  timer,
} from 'rxjs';

export interface ResilienceOptions {
  /** Délai au-delà duquel une tentative est abandonnée. */
  timeoutMs: number;
  /** Nombre de nouvelles tentatives après un échec passager. */
  retries: number;
  /** Attente avant la première relance ; elle s'allonge à chaque tentative. */
  delayMs: number;
}

/** Dans le navigateur : on insiste un peu, un réseau mobile décroche souvent une seconde. */
export const BROWSER_RESILIENCE: ResilienceOptions = { timeoutMs: 8000, retries: 2, delayMs: 400 };
/** Pendant le rendu serveur : on répond vite, quitte à laisser le navigateur réessayer. */
export const SERVER_RESILIENCE: ResilienceOptions = { timeoutMs: 4000, retries: 1, delayMs: 150 };

const TRANSIENT_STATUS = new Set([0, 408, 429, 502, 503, 504]);

/** Vrai pour une panne qui peut disparaître d'elle-même : coupure réseau, délai dépassé, serveur saturé. */
export function isTransient(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  return error instanceof HttpErrorResponse && TRANSIENT_STATUS.has(error.status);
}

/**
 * Délai maximal et relances espacées pour une lecture. Réservé aux requêtes sans effet de bord :
 * rejouer une lecture est sans risque, rejouer une écriture ne l'est pas.
 */
export function resilient<T>(options: ResilienceOptions): MonoTypeOperatorFunction<T> {
  return pipe(
    timeout(options.timeoutMs),
    retry({
      count: options.retries,
      delay: (error, attempt) =>
        isTransient(error) ? timer(options.delayMs * attempt) : throwError(() => error),
    }),
  );
}
