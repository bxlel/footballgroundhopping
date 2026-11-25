import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataApi, GoingState } from './data-api.service';

const STORAGE_KEY = 'stg-appareil';

/**
 * « J'y vais », sans compte : l'appareil reçoit un identifiant aléatoire au premier clic
 * (jamais avant), gardé dans le navigateur. Il ne contient rien de personnel.
 */
@Injectable({ providedIn: 'root' })
export class GoingService {
  private readonly api = inject(DataApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _mine = signal<ReadonlySet<string>>(new Set());
  /** Slugs des matchs que cet appareil a marqués. */
  readonly mine = this._mine.asReadonly();

  private readDeviceId(): string | null {
    if (!this.isBrowser) return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private ensureDeviceId(): string | null {
    const existing = this.readDeviceId();
    if (existing) return existing;
    if (!this.isBrowser || !globalThis.crypto?.randomUUID) return null;
    const id = globalThis.crypto.randomUUID();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Stockage refusé (navigation privée stricte) : l'identifiant ne vivra que le temps de la page.
    }
    return id;
  }

  /** Retrouve, parmi ces matchs, ceux déjà marqués. Sans identifiant, il n'y a rien à chercher. */
  async load(slugs: readonly string[]): Promise<void> {
    const deviceId = this.readDeviceId();
    if (!deviceId || !slugs.length) return;
    try {
      const marked = await firstValueFrom(this.api.myGoing(deviceId, slugs));
      this._mine.update((current) => new Set([...current, ...marked]));
    } catch {
      // Sans réponse, les boutons restent à « J'y vais » : rien de bloquant.
    }
  }

  /** Bascule « J'y vais » pour un match. Rejette si le serveur refuse ou ne répond pas. */
  async toggle(slug: string): Promise<GoingState> {
    const deviceId = this.ensureDeviceId();
    if (!deviceId) throw new Error('Identifiant d’appareil indisponible');
    const going = !this._mine().has(slug);
    const state = await firstValueFrom(this.api.setGoing(slug, deviceId, going));
    this._mine.update((current) => {
      const next = new Set(current);
      if (state.going) next.add(slug);
      else next.delete(slug);
      return next;
    });
    return state;
  }
}
