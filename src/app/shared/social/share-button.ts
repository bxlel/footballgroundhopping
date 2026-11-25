import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { MESSAGES } from '../../core/i18n/messages';

/**
 * Partage la page courante : feuille de partage du téléphone quand elle existe,
 * sinon copie du lien, avec une confirmation lue par les lecteurs d'écran.
 */
@Component({
  selector: 'app-share-button',
  imports: [ButtonDirective],
  template: `
    <button pButton outlined type="button" [size]="size()" (click)="share()">
      {{ t.social.share }}
    </button>
    <span class="share__status" role="status">{{ status() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--s-2) var(--s-3);
    }
    .share__status {
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--ink-soft);
    }
    .share__status:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButtonComponent {
  protected readonly t = inject(MESSAGES);
  private readonly document = inject(DOCUMENT);

  /** Titre proposé dans la feuille de partage. */
  readonly title = input.required<string>();
  readonly text = input('');
  readonly size = input<'small' | 'large' | undefined>(undefined);

  protected readonly status = signal('');

  protected async share(): Promise<void> {
    const url = this.document.location.href;
    const nav = this.document.defaultView?.navigator;
    this.status.set('');

    if (nav?.share) {
      try {
        await nav.share({ title: this.title(), text: this.text() || undefined, url });
        return;
      } catch (error) {
        // Le visiteur a refermé la feuille de partage : ce n'est pas une erreur.
        if ((error as DOMException)?.name === 'AbortError') return;
      }
    }

    try {
      await nav?.clipboard.writeText(url);
      this.status.set(this.t.social.linkCopied);
    } catch {
      this.status.set(this.t.social.shareFailed);
    }
  }
}
