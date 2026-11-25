import { InjectionToken } from '@angular/core';
import { FR, Messages } from './messages.fr';

/**
 * Textes de l'interface. Le français est fourni par défaut ; une autre langue se branche
 * en fournissant ce jeton avec un autre dictionnaire du même type.
 */
export const MESSAGES = new InjectionToken<Messages>('MESSAGES', {
  providedIn: 'root',
  factory: () => FR,
});

export type { Messages };
