// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home';
import { ExplorerComponent } from './features/explorer/explorer';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    title: 'Spot the Game - À propos',
  },
  {
    path: 'explorer',
    component: ExplorerComponent,
    title: 'Spot the Game - Explorer',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
