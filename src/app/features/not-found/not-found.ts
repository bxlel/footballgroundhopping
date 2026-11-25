import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { MESSAGES } from '../../core/i18n/messages';
import { SeoService } from '../../core/seo.service';
import { FooterComponent } from '../../shared/footer/footer';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, ButtonDirective, FooterComponent],
  template: `
    <div class="page nf">
      <h1 class="display">{{ t.notFound.title }}</h1>
      <p class="nf__body">{{ t.notFound.body }}</p>
      <a pButton size="large" routerLink="/">{{ t.notFound.cta }}</a>
    </div>
    <app-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .nf {
      flex: 1;
    }
    .nf h1 {
      width: fit-content;
      background: var(--gradient);
      background-clip: text;
      color: transparent;
    }
    .nf__body {
      margin: var(--s-3) 0 var(--s-5);
      font-size: var(--fs-lg);
      color: var(--ink-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  protected readonly t = inject(MESSAGES);

  constructor() {
    inject(SeoService).set({
      title: this.t.notFound.pageTitle,
      description: this.t.notFound.body,
      path: '/',
      noindex: true,
    });
  }
}
