import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { APP_CONFIG } from '../../core/config';
import { circleBounds, circleRing } from '../../core/geo';
import { MESSAGES } from '../../core/i18n/messages';
import { MapMarker } from '../../core/markers';
import { GeoPoint } from '../../core/models';

const STYLESHEET_ID = 'feuille-carte';
const RADIUS_SOURCE = 'rayon';
const SINGLE_MARKER_ZOOM = 14;

/**
 * Carte MapLibre. La bibliothèque et sa feuille de style ne sont chargées que dans le
 * navigateur, après le premier rendu : elles ne pèsent ni sur le rendu serveur ni sur
 * l'affichage initial. Si la carte ne peut pas s'afficher (WebGL absent, réseau coupé),
 * un message le dit et le reste de la page continue de fonctionner.
 */
@Component({
  selector: 'app-map-view',
  template: `
    <div #canvas class="map__canvas" role="region" [attr.aria-label]="label()"></div>
    @if (failed()) {
      <p class="map__fallback">{{ t.map.unavailable }}</p>
    } @else if (waiting()) {
      <button type="button" class="map__fallback map__show" (click)="activate()">
        {{ t.map.show }}
      </button>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      background: var(--surface-2);
    }
    .map__canvas {
      position: absolute;
      inset: 0;
    }
    .map__fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: var(--s-5);
      text-align: center;
      color: var(--ink-soft);
    }
    .map__show {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--brand);
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 0.2em;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapViewComponent {
  protected readonly t = inject(MESSAGES);
  private readonly config = inject(APP_CONFIG);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);

  readonly label = input.required<string>();
  readonly markers = input<readonly MapMarker[]>([]);
  /** Point de départ de la recherche : affiché avec le cercle du rayon. */
  readonly origin = input<GeoPoint | null>(null);
  readonly radiusKm = input<number | null>(null);
  /** Stade mis en évidence depuis la liste. */
  readonly activeId = input<string | null>(null);
  /** Hauteur (px) masquée en bas par le panneau de liste, pour cadrer au-dessus. */
  readonly bottomInset = input(0);

  /**
   * Carte secondaire (fiche stade) : elle ne se charge qu'au premier geste du visiteur,
   * pour ne pas ralentir l'affichage d'une page qu'il vient lire.
   */
  readonly lazy = input(false, { transform: booleanAttribute });

  readonly markerHover = output<string | null>();
  readonly markerSelect = output<string>();

  protected readonly failed = signal(false);
  protected readonly waiting = signal(false);
  private activated: (() => void) | null = null;
  private readonly ready = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  private map: MapLibreMap | null = null;
  private lib: typeof import('maplibre-gl') | null = null;
  private readonly pins = new Map<string, { marker: Marker; element: HTMLButtonElement }>();
  private originPin: Marker | null = null;
  private framed = false;
  private destroyed = false;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => void this.whenNeeded().then(() => this.init()));

    effect(() => {
      const markers = this.markers();
      if (this.ready()) this.syncPins(markers);
    });
    effect(() => {
      const active = this.activeId();
      if (!this.ready()) return;
      for (const [id, pin] of this.pins) pin.element.classList.toggle('pin--active', id === active);
    });
    effect(() => {
      const origin = this.origin();
      const radius = this.radiusKm();
      const markers = this.markers();
      const inset = this.bottomInset();
      if (this.ready()) this.frame(origin, radius, markers, inset);
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.map?.remove();
      this.map = null;
    });
  }

  /**
   * Attend que la carte approche de l'écran, puis un moment de calme du navigateur :
   * MapLibre est lourd, inutile de le charger pour une carte que personne ne voit encore.
   */
  private whenNeeded(): Promise<void> {
    const element = this.canvas().nativeElement;
    const visible = new Promise<void>((resolve) => {
      if (!('IntersectionObserver' in window)) return resolve();
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            resolve();
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
    const gesture = () =>
      new Promise<void>((resolve) => {
        if (!this.lazy()) return resolve();
        const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'scroll'];
        const done = () => {
          for (const name of events) window.removeEventListener(name, done);
          this.activated = null;
          this.waiting.set(false);
          resolve();
        };
        this.activated = done;
        this.waiting.set(true);
        for (const name of events)
          window.addEventListener(name, done, { once: true, passive: true });
        this.destroyRef.onDestroy(() => {
          for (const name of events) window.removeEventListener(name, done);
        });
      });
    const idle = () =>
      new Promise<void>((resolve) => {
        if ('requestIdleCallback' in window)
          window.requestIdleCallback(() => resolve(), { timeout: 1500 });
        else setTimeout(resolve, 200);
      });
    return visible.then(gesture).then(idle);
  }

  protected activate(): void {
    this.activated?.();
  }

  private async init(): Promise<void> {
    if (this.destroyed) return;
    try {
      const [lib] = await Promise.all([import('maplibre-gl'), this.loadStylesheet()]);
      this.lib = lib;
      // Le worker est servi comme fichier statique (voir angular.json).
      lib.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', this.document.baseURI).href);

      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.zone.runOutsideAngular(() => {
        const map = new lib.Map({
          container: this.canvas().nativeElement,
          style: dark ? this.config.mapStyleDark : this.config.mapStyleLight,
          center: [2.35, 48.85],
          zoom: 4,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');

        let loaded = false;
        map.on('error', () => {
          // Tant que le style n'est pas chargé, une erreur veut dire « pas de carte ».
          if (!loaded) this.zone.run(() => this.failed.set(true));
        });
        map.on('load', () => {
          loaded = true;
          this.zone.run(() => {
            this.failed.set(false);
            this.ready.set(true);
          });
        });
        this.map = map;
      });
    } catch {
      this.failed.set(true);
    }
  }

  private loadStylesheet(): Promise<void> {
    if (this.document.getElementById(STYLESHEET_ID)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = this.document.createElement('link');
      link.id = STYLESHEET_ID;
      link.rel = 'stylesheet';
      link.href = 'map.css';
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('Feuille de style de la carte introuvable'));
      this.document.head.appendChild(link);
    });
  }

  private syncPins(markers: readonly MapMarker[]): void {
    const { map, lib } = this;
    if (!map || !lib) return;

    const wanted = new Set(markers.map((marker) => marker.id));
    for (const [id, pin] of this.pins) {
      if (!wanted.has(id)) {
        pin.marker.remove();
        this.pins.delete(id);
      }
    }

    for (const marker of markers) {
      const existing = this.pins.get(marker.id);
      const label = this.t.map.marker(marker.name, marker.count);
      if (existing) {
        existing.element.textContent = String(marker.count);
        existing.element.setAttribute('aria-label', label);
        continue;
      }

      const element = this.document.createElement('button');
      element.type = 'button';
      element.className = marker.approximate ? 'pin pin--approx' : 'pin';
      element.textContent = String(marker.count);
      element.setAttribute('aria-label', label);
      element.title = marker.name;
      const emitHover = (id: string | null) => this.zone.run(() => this.markerHover.emit(id));
      element.addEventListener('mouseenter', () => emitHover(marker.id));
      element.addEventListener('mouseleave', () => emitHover(null));
      element.addEventListener('focus', () => emitHover(marker.id));
      element.addEventListener('blur', () => emitHover(null));
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        this.zone.run(() => this.markerSelect.emit(marker.id));
      });

      const pin = new lib.Marker({ element })
        .setLngLat([marker.position.lng, marker.position.lat])
        .addTo(map);
      this.pins.set(marker.id, { marker: pin, element });
    }
  }

  private frame(
    origin: GeoPoint | null,
    radiusKm: number | null,
    markers: readonly MapMarker[],
    bottomInset: number,
  ): void {
    const { map, lib } = this;
    if (!map || !lib) return;
    const animate = this.framed;
    this.framed = true;

    this.drawRadius(origin, radiusKm);

    if (origin && radiusKm) {
      const [west, south, east, north] = circleBounds(origin, radiusKm);
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: { top: 24, right: 24, left: 24, bottom: 24 + bottomInset }, animate },
      );
    } else if (markers.length === 1) {
      const { lat, lng } = markers[0].position;
      map.jumpTo({ center: [lng, lat], zoom: SINGLE_MARKER_ZOOM });
    }
  }

  private drawRadius(origin: GeoPoint | null, radiusKm: number | null): void {
    const { map, lib } = this;
    if (!map || !lib) return;

    this.originPin?.remove();
    this.originPin = null;

    const features =
      origin && radiusKm
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Polygon' as const, coordinates: [circleRing(origin, radiusKm)] },
            },
          ]
        : [];
    const data = { type: 'FeatureCollection' as const, features };

    const source = map.getSource<GeoJSONSource>(RADIUS_SOURCE);
    if (source) {
      source.setData(data);
    } else {
      const accent = getComputedStyle(this.document.documentElement)
        .getPropertyValue('--brand')
        .trim();
      map.addSource(RADIUS_SOURCE, { type: 'geojson', data });
      map.addLayer({
        id: 'rayon-fond',
        type: 'fill',
        source: RADIUS_SOURCE,
        paint: { 'fill-color': accent, 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'rayon-contour',
        type: 'line',
        source: RADIUS_SOURCE,
        paint: { 'line-color': accent, 'line-width': 2, 'line-dasharray': [3, 2] },
      });
    }

    if (origin) {
      const element = this.document.createElement('div');
      element.className = 'pin-origin';
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', this.t.map.origin);
      this.originPin = new lib.Marker({ element }).setLngLat([origin.lng, origin.lat]).addTo(map);
    }
  }
}
