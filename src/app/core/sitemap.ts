import { absoluteUrl, matchPath, teamPath, venuePath } from './urls';

export interface SitemapEntry {
  kind: string;
  slug: string;
  updated_at?: string | null;
}

const PATHS: Record<string, (slug: string) => string> = {
  match: matchPath,
  venue: venuePath,
  team: teamPath,
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plan du site : l'accueil, puis les pages stade, match et club connues. Les entrées douteuses sont ignorées. */
export function buildSitemap(entries: readonly SitemapEntry[], siteUrl: string): string {
  const urls = [`  <url><loc>${escapeXml(absoluteUrl(siteUrl, '/'))}</loc></url>`];
  for (const entry of entries) {
    const path = PATHS[entry.kind];
    if (!path || typeof entry.slug !== 'string' || !SLUG.test(entry.slug)) continue;
    const day =
      typeof entry.updated_at === 'string' && !Number.isNaN(Date.parse(entry.updated_at))
        ? new Date(entry.updated_at).toISOString().slice(0, 10)
        : null;
    const lastmod = day ? `<lastmod>${day}</lastmod>` : '';
    urls.push(
      `  <url><loc>${escapeXml(absoluteUrl(siteUrl, path(entry.slug)))}</loc>${lastmod}</url>`,
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** robots.txt : tout est ouvert sauf les résultats de recherche, et le sitemap est annoncé. */
export function buildRobots(siteUrl: string): string {
  return [
    'User-agent: *',
    'Disallow: /voyage',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl(siteUrl, '/sitemap.xml')}`,
    '',
  ].join('\n');
}
