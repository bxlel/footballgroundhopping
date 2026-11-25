import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MESSAGES } from '../../core/i18n/messages';

@Component({
  selector: 'app-footer',
  template: `
    <footer class="foot">
      <p class="foot__pitch">{{ t.footer.pitch }}</p>
      <p>{{ t.footer.credits }}</p>
    </footer>
  `,
  styles: `
    .foot {
      display: grid;
      gap: var(--s-1);
      padding: var(--s-5) var(--page-pad);
      border-top: 1px solid var(--line);
      font-size: var(--fs-xs);
      color: var(--ink-soft);
    }
    .foot__pitch {
      font-size: var(--fs-sm);
      font-weight: 700;
      color: var(--ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly t = inject(MESSAGES);
}
