import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Champ de formulaire : libellé, contrôle projeté, aide et erreur.
 * Le contrôle projeté doit porter `[id]="for"` et, s'il y a une erreur,
 * `aria-describedby="<for>-error"`.
 */
@Component({
  selector: 'app-field',
  template: `
    <label class="field__label" [attr.for]="for()">{{ label() }}</label>
    <ng-content />
    @if (hint(); as text) {
      <p class="field__hint" [id]="for() + '-hint'">{{ text }}</p>
    }
    @if (error(); as text) {
      <p class="field__error" [id]="for() + '-error'" role="alert">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--s-2);
    }
    .field__label {
      font-size: var(--fs-sm);
      font-weight: 700;
    }
    .field__hint {
      font-size: var(--fs-xs);
      color: var(--ink-soft);
    }
    .field__error {
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly for = input.required<string>();
  readonly hint = input('');
  readonly error = input('');
}
