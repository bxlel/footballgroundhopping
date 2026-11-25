import { Routes } from '@angular/router';
import { ROUTES } from './core/urls';

// Les titres et descriptions sont posés par chaque page (SeoService) : ils dépendent des données.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
  },
  {
    path: ROUTES.trip,
    loadComponent: () => import('./features/trip/trip').then((m) => m.TripComponent),
  },
  {
    path: `${ROUTES.match}/:slug`,
    loadComponent: () => import('./features/match/match').then((m) => m.MatchComponent),
  },
  {
    path: `${ROUTES.venue}/:slug`,
    loadComponent: () => import('./features/venue/venue').then((m) => m.VenueComponent),
  },
  {
    path: `${ROUTES.team}/:slug`,
    loadComponent: () => import('./features/team/team').then((m) => m.TeamComponent),
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFoundComponent),
  },
];
