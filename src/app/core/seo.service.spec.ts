import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, EMPTY_CONFIG } from './config';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  let seo: SeoService;
  let head: HTMLHeadElement;

  const meta = (selector: string) => head.querySelector(selector)?.getAttribute('content');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { ...EMPTY_CONFIG, siteUrl: 'https://spotthegame.app' } },
      ],
    });
    seo = TestBed.inject(SeoService);
    head = TestBed.inject(DOCUMENT).head;
  });

  afterEach(() => {
    head
      .querySelectorAll('link[rel="canonical"], #donnees-structurees')
      .forEach((el) => el.remove());
  });

  it('pose le titre, la description et l’URL canonique', () => {
    seo.set({ title: 'Anfield', description: 'Fiche du stade', path: '/stades/anfield-liverpool' });
    expect(TestBed.inject(DOCUMENT).title).toBe('Anfield');
    expect(meta('meta[name="description"]')).toBe('Fiche du stade');
    expect(meta('meta[name="robots"]')).toBe('index, follow');
    expect(meta('meta[property="og:image"]')).toBe('https://spotthegame.app/og.png');
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(meta('meta[property="og:url"]')).toBe(
      'https://spotthegame.app/stades/anfield-liverpool',
    );
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://spotthegame.app/stades/anfield-liverpool',
    );
  });

  it('remplace les données structurées d’une page à l’autre, sans doublon', () => {
    seo.set({
      title: 'A',
      description: 'a',
      path: '/a',
      jsonLd: { '@type': 'SportsEvent', name: 'A' },
    });
    seo.set({
      title: 'B',
      description: 'b',
      path: '/b',
      jsonLd: { '@type': 'SportsEvent', name: 'B' },
    });
    const scripts = head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    expect(JSON.parse(scripts[0].textContent ?? '{}').name).toBe('B');
    expect(head.querySelectorAll('link[rel="canonical"]').length).toBe(1);

    seo.set({ title: 'C', description: 'c', path: '/c' });
    expect(head.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it('exclut de l’indexation les pages marquées noindex', () => {
    seo.set({ title: 'Recherche', description: 'x', path: '/voyage', noindex: true });
    expect(meta('meta[name="robots"]')).toBe('noindex, follow');
  });
});
