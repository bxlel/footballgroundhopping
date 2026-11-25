import { buildRobots, buildSitemap } from './sitemap';

describe('sitemap', () => {
  const SITE = 'https://spotthegame.app';

  it('liste l’accueil puis les pages connues, avec leur date de mise à jour', () => {
    const xml = buildSitemap(
      [
        { kind: 'venue', slug: 'anfield-liverpool', updated_at: '2026-11-20T10:00:00+01:00' },
        { kind: 'match', slug: '2026-03-14-lens-lille', updated_at: null },
        { kind: 'team', slug: 'lens' },
      ],
      SITE,
    );
    expect(xml.split('\n')).toEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url><loc>https://spotthegame.app/</loc></url>',
      '  <url><loc>https://spotthegame.app/stades/anfield-liverpool</loc><lastmod>2026-11-20</lastmod></url>',
      '  <url><loc>https://spotthegame.app/matchs/2026-03-14-lens-lille</loc></url>',
      '  <url><loc>https://spotthegame.app/clubs/lens</loc></url>',
      '</urlset>',
      '',
    ]);
  });

  it('ignore les entrées inconnues ou au slug douteux', () => {
    const xml = buildSitemap(
      [
        { kind: 'pirate', slug: 'x' },
        { kind: 'team', slug: '../admin' },
        { kind: 'team', slug: '<script>' },
        { kind: 'team', slug: 42 as unknown as string },
      ],
      SITE,
    );
    expect(xml.match(/<url>/g)?.length).toBe(1);
  });

  it('annonce le sitemap dans robots.txt et écarte les résultats de recherche', () => {
    expect(buildRobots('https://spotthegame.app/')).toBe(
      'User-agent: *\nDisallow: /voyage\nAllow: /\n\nSitemap: https://spotthegame.app/sitemap.xml\n',
    );
  });
});
