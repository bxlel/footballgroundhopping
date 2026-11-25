import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MESSAGES } from './core/i18n/messages';
import { HeaderComponent } from './shared/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent],
  template: `
    <a class="skip-link" href="#contenu">{{ t.nav.skip }}</a>
    <app-header />
    <main id="contenu" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      outline: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected readonly t = inject(MESSAGES);
}
