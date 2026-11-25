import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import {
  getAllowedHosts,
  getContext,
  getTrustProxyHeaders,
} from '@netlify/angular-runtime/app-engine.js';
import { buildRobots, buildSitemap, SitemapEntry } from './app/core/sitemap';

// Point d'entrée du rendu serveur, au format attendu par Netlify (Edge Functions).
// En local, `npm run serve:ssr` l'enveloppe dans un petit serveur Node (scripts/serve-ssr.mjs).

interface ServerGlobals {
  Netlify?: { env?: { get(name: string): string | undefined } };
  process?: { env?: Record<string, string | undefined> };
}

/** Variables d'environnement : Edge Functions Netlify en production, Node en local. */
function env(name: string): string {
  const globals = globalThis as ServerGlobals;
  return (globals.Netlify?.env?.get(name) || globals.process?.env?.[name] || '').trim();
}

/**
 * Hôtes pour lesquels Angular accepte de rendre une page (protection contre les en-têtes
 * Host forgés). Sur Netlify, la liste vient du déploiement ; SSR_ALLOWED_HOSTS permet d'en
 * ajouter (séparés par des virgules). Hors Netlify, on autorise la machine locale.
 */
function allowedHosts(): string[] {
  const extra = env('SSR_ALLOWED_HOSTS')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  const onNetlify = !!env('DEPLOY_ID') || !!(globalThis as ServerGlobals).Netlify;
  return [...(onNetlify ? getAllowedHosts() : ['localhost', '127.0.0.1']), ...extra];
}

const angularAppEngine = new AngularAppEngine({
  allowedHosts: allowedHosts(),
  trustProxyHeaders: getTrustProxyHeaders(),
});

/** Origine publique du site : jamais déduite de la requête quand elle est configurée. */
function siteUrl(request: Request): string {
  return env('SITE_URL') || env('URL') || new URL(request.url).origin;
}

const HOUR = 3600;
const textHeaders = (type: string) => ({
  'Content-Type': `${type}; charset=utf-8`,
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': `public, s-maxage=${HOUR}, stale-while-revalidate=${24 * HOUR}`,
});

/** Plan du site, construit à partir de la base (fonction SQL `sitemap_entries`). */
async function sitemap(request: Request): Promise<Response> {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = env('SUPABASE_ANON_KEY');
  try {
    if (!supabaseUrl || !anonKey) throw new Error('Supabase non configuré');
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sitemap_entries`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Supabase a répondu ${response.status}`);
    const entries = (await response.json()) as SitemapEntry[];
    return new Response(buildSitemap(Array.isArray(entries) ? entries : [], siteUrl(request)), {
      headers: textHeaders('application/xml'),
    });
  } catch (error) {
    console.error(`Sitemap : ${(error as Error).message}`);
    // 503 : les moteurs de recherche réessaieront, au lieu d'enregistrer un plan vide.
    return new Response('Sitemap indisponible', { status: 503, headers: { 'Retry-After': '600' } });
  }
}

export async function netlifyAppEngineHandler(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/robots.txt') {
    return new Response(buildRobots(siteUrl(request)), { headers: textHeaders('text/plain') });
  }
  if (pathname === '/sitemap.xml') return sitemap(request);

  const context = getContext();
  const result = await angularAppEngine.handle(request, context);
  return result || new Response('Not found', { status: 404 });
}

/** Gestionnaire utilisé par l'Angular CLI (serveur de dev et build). */
export const reqHandler = createRequestHandler(netlifyAppEngineHandler);
