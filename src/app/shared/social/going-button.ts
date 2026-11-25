import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { GoingService } from '../../core/going.service';
import { MESSAGES } from '../../core/i18n/messages';

/**
 * « J'y vais » : un bouton à bascule et le nombre de personnes qui y vont.
 * Fonctionne sans compte ; l'état de cet appareil est retrouvé après l'affichage.
 */
@Component({
  selector: 'app-going-button',
  imports: [ButtonDirective],
  template: `
    <button
      pButton
      type="button"
      outlined
      size="large"
      class="going__button"
      [class.is-going]="going()"
      [attr.aria-pressed]="going()"
      [disabled]="busy()"
      (click)="toggle()"
    >
      {{ going() ? t.social.going : t.social.go }}
    </button>
    <p class="going__count" role="status">{{ error() || t.social.count(count()) }}</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--s-2) var(--s-4);
    }
    // « Tu y vas » : le bouton se remplit du dégradé de la marque.
    .going__button.is-going {
      border-color: transparent;
      background: var(--gradient);
      color: var(--on-brand);
    }
    .going__count {
      color: var(--ink-soft);
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoingButtonComponent {
  protected readonly t = inject(MESSAGES);
  private readonly service = inject(GoingService);

  readonly slug = input.required<string>();
  /** Compteur connu au chargement de la page. */
  readonly initialCount = input(0);

  protected readonly count = linkedSignal(() => this.initialCount());
  protected readonly going = computed(() => this.service.mine().has(this.slug()));
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => void this.service.load([this.slug()]));
  }

  protected async toggle(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.count.set((await this.service.toggle(this.slug())).goingCount);
    } catch {
      this.error.set(this.t.social.goingError);
    } finally {
      this.busy.set(false);
    }
  }
}
