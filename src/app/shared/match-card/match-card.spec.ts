import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FixtureCard } from '../../core/models';
import { makeFixture, makeVenue } from '../../core/testing/fixtures';
import { MatchCardComponent } from './match-card';

describe('MatchCardComponent', () => {
  let fixture: ComponentFixture<MatchCardComponent>;

  function render(match: FixtureCard): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(MatchCardComponent);
    fixture.componentRef.setInput('fixture', match);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement, selector: string) =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('affiche l’heure locale du stade, les équipes, le stade et la distance', () => {
    const logoUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const el = render(
      makeFixture({
        home: { name: 'Lens', slug: 'lens', logoUrl },
        away: { name: 'Lille', slug: 'lille', logoUrl },
      }),
    );
    expect(text(el, '.mc__hour')).toBe('20:45');
    expect(text(el, '.mc__day')).toBe('sam. 14 mars');
    expect(text(el, '.mc__teams')).toBe('Lens contre Lille');
    expect(text(el, '.mc__meta')).toBe('Ligue 1 · France');
    expect(text(el, '.mc__venue')).toBe('Stade Bollaert-Delelis, Lens');
    expect(text(el, '.mc__distance')).toBe('12 km');
    expect(text(el, '.mc__tags')).toBe('1re division');
  });

  it('mène à la page du match et à l’itinéraire', () => {
    const el = render(makeFixture());
    expect(el.querySelector('.mc__link')?.getAttribute('href')).toBe(
      '/matchs/2026-03-14-lens-lille',
    );
    expect(el.querySelector('.mc__directions')?.getAttribute('href')).toContain(
      'destination=50.4328%2C2.8149',
    );
  });

  it('remplace un écusson manquant par les initiales', () => {
    const el = render(
      makeFixture({ home: { name: 'Paris Saint-Germain', slug: 'psg', logoUrl: null } }),
    );
    expect(text(el, '.crest__initials')).toBe('PSG');
    expect(el.querySelectorAll('.crest__initials')[1].textContent?.trim()).toBe('LIL');
  });

  it('signale un horaire non confirmé sans afficher d’heure', () => {
    const el = render(makeFixture({ timeConfirmed: false }));
    expect(el.querySelector('time')).toBeNull();
    expect(text(el, '.mc__tags')).toContain('Horaire à confirmer');
  });

  it('gère un stade inconnu : pas de distance ni d’itinéraire', () => {
    const el = render(makeFixture({ venue: null, distanceKm: null }));
    expect(text(el, '.mc__venue')).toBe('Stade à confirmer');
    expect(el.querySelector('.mc__distance')).toBeNull();
    expect(el.querySelector('.mc__directions')).toBeNull();
  });

  it('signale une position approximative et un match reporté', () => {
    const el = render(
      makeFixture({ status: 'postponed', venue: makeVenue({ approximate: true }) }),
    );
    expect(text(el, '.mc__tags')).toContain('Reporté');
    expect(text(el, '.mc__tags')).toContain('Position approximative');
  });

  it('affiche le nombre de personnes qui y vont, seulement s’il y en a', () => {
    expect(text(render(makeFixture({ goingCount: 12 })), '.mc__going')).toBe('12 y vont');
  });

  it('n’affiche pas de compteur à zéro', () => {
    expect(render(makeFixture()).querySelector('.mc__going')).toBeNull();
  });

  it('émet le match survolé puis null en le quittant', () => {
    const el = render(makeFixture({ id: 42 }));
    const emitted: (number | null)[] = [];
    fixture.componentInstance.highlight.subscribe((id) => emitted.push(id));
    el.dispatchEvent(new Event('mouseenter'));
    el.dispatchEvent(new Event('mouseleave'));
    expect(emitted).toEqual([42, null]);
  });
});
