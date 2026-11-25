import { RenderMode, ServerRoute } from '@angular/ssr';
import { ROUTES } from './core/urls';

// Les pages de contenu changent peu : le CDN peut les garder quelques minutes
// et servir l'ancienne version pendant qu'il la rafraîchit.
const contentCache = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
};

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server, headers: contentCache },
  { path: ROUTES.trip, renderMode: RenderMode.Server },
  { path: `${ROUTES.match}/:slug`, renderMode: RenderMode.Server, headers: contentCache },
  { path: `${ROUTES.venue}/:slug`, renderMode: RenderMode.Server, headers: contentCache },
  { path: `${ROUTES.team}/:slug`, renderMode: RenderMode.Server, headers: contentCache },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
