import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { GeoPoint } from './models';

export type GeolocationFailure = 'denied' | 'unavailable';

/** Position du visiteur, demandée uniquement à son initiative. */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Vrai si le visiteur a déjà autorisé la localisation : on peut la lire sans rien lui demander. */
  async alreadyGranted(): Promise<boolean> {
    if (!this.isBrowser || !navigator.permissions?.query) return false;
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state === 'granted';
    } catch {
      return false;
    }
  }

  /** Demande la position. Rejette avec 'denied' ou 'unavailable'. */
  locate(): Promise<GeoPoint> {
    return new Promise((resolve, reject) => {
      if (!this.isBrowser || !navigator.geolocation) {
        reject('unavailable' satisfies GeolocationFailure);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) =>
          reject(
            (error.code === error.PERMISSION_DENIED
              ? 'denied'
              : 'unavailable') satisfies GeolocationFailure,
          ),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
      );
    });
  }
}
