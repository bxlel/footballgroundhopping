import { Directive, input } from '@angular/core';

/** Puce de filtre à bascule : `<button appChip [pressed]="actif">`. */
@Directive({
  selector: 'button[appChip]',
  host: {
    class: 'chip',
    type: 'button',
    '[attr.aria-pressed]': 'pressed()',
  },
})
export class ChipDirective {
  readonly pressed = input(false);
}
