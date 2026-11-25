import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * Écusson d'une équipe. Sans image (ou si elle ne charge pas), affiche les initiales :
 * la mise en page ne bouge jamais.
 */
@Component({
  selector: 'app-crest',
  template: `
    @if (showImage()) {
      <img
        [src]="logoUrl()"
        alt=""
        [attr.width]="size()"
        [attr.height]="size()"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        (error)="failed.set(true)"
      />
    } @else {
      <span class="crest__initials" aria-hidden="true">{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--crest-size, 1.75rem);
      height: var(--crest-size, 1.75rem);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .crest__initials {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: var(--brand-tint);
      color: var(--brand-strong);
      font-weight: 800;
      font-size: calc(var(--crest-size, 1.75rem) * 0.3);
      letter-spacing: 0.02em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrestComponent {
  readonly name = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly size = input(28);

  protected readonly failed = signal(false);
  protected readonly showImage = computed(() => !!this.logoUrl() && !this.failed());
  /** « PSG » pour Paris Saint-Germain, « LEN » pour Lens. */
  protected readonly initials = computed(() => {
    const words = this.name()
      .split(/[\s-]+/)
      .filter((word) => /^\p{L}/u.test(word));
    const letters =
      words.length > 1
        ? words
            .slice(0, 3)
            .map((word) => word[0])
            .join('')
        : (words[0] ?? '').slice(0, 3);
    return letters.toUpperCase();
  });
}
