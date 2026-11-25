import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MESSAGES } from '../../core/i18n/messages';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  template: `
    <header class="bar">
      <a class="brand" routerLink="/" [attr.aria-label]="t.brand.home">
        <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="marque" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#5b21b6" />
              <stop offset="1" stop-color="#a855f7" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#marque)" />
          <circle cx="16" cy="16" r="7.5" fill="none" stroke="#fff" stroke-width="2" />
          <path d="M16 4.5v23" stroke="#fff" stroke-width="2" />
          <circle cx="16" cy="16" r="2.4" fill="#fff" />
        </svg>
        <span class="brand__name">{{ t.brand.name }}</span>
      </a>
    </header>
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      height: var(--header-h);
      padding-inline: var(--page-pad);
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--s-3);
      min-height: var(--tap);
      text-decoration: none;
    }
    .brand__mark {
      width: 2rem;
      height: 2rem;
    }
    .brand__name {
      font-size: var(--fs-lg);
      font-weight: 800;
      letter-spacing: -0.02em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  protected readonly t = inject(MESSAGES);
}
