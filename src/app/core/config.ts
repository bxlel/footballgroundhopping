import { InjectionToken, makeStateKey } from '@angular/core';

/**
 * Configuration publique de l'application. Elle est lue dans les variables d'environnement
 * par le serveur (voir app.config.server.ts) puis transmise au navigateur avec la page :
 * rien n'est écrit dans le code ni figé au build.
 */
export interface AppConfig {
  /** URL du projet Supabase, sans barre finale. Vide si non configuré. */
  supabaseUrl: string;
  /** Clé « anon » de Supabase : publique par nature, protégée par les règles RLS. */
  supabaseAnonKey: string;
  /** Origine publique du site, pour les URL canoniques. */
  siteUrl: string;
  mapStyleLight: string;
  mapStyleDark: string;
}

export const DEFAULT_MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
export const DEFAULT_MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export const EMPTY_CONFIG: AppConfig = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  siteUrl: '',
  mapStyleLight: DEFAULT_MAP_STYLE_LIGHT,
  mapStyleDark: DEFAULT_MAP_STYLE_DARK,
};

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
export const APP_CONFIG_STATE = makeStateKey<AppConfig>('app-config');

type Env = (name: string) => string | undefined;

/** Construit la configuration à partir des variables d'environnement du serveur. */
export function readConfig(env: Env, requestOrigin: string): AppConfig {
  const trim = (value: string | undefined) => (value ?? '').trim().replace(/\/+$/, '');
  return {
    supabaseUrl: trim(env('SUPABASE_URL')),
    supabaseAnonKey: (env('SUPABASE_ANON_KEY') ?? '').trim(),
    siteUrl: trim(env('SITE_URL')) || trim(env('URL')) || trim(requestOrigin),
    mapStyleLight: trim(env('MAP_STYLE_URL')) || DEFAULT_MAP_STYLE_LIGHT,
    mapStyleDark: trim(env('MAP_STYLE_URL_DARK')) || DEFAULT_MAP_STYLE_DARK,
  };
}
