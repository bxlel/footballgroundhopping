import {
  ApplicationConfig,
  inject,
  mergeApplicationConfig,
  provideAppInitializer,
  REQUEST,
  TransferState,
} from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { APP_CONFIG, APP_CONFIG_STATE, readConfig } from './core/config';

interface ServerGlobals {
  Netlify?: { env?: { get(name: string): string | undefined } };
  process?: { env?: Record<string, string | undefined> };
}

/** Variables d'environnement : Edge Functions Netlify en production, Node en local. */
function serverEnv(name: string): string | undefined {
  const globals = globalThis as ServerGlobals;
  return globals.Netlify?.env?.get(name) || globals.process?.env?.[name];
}

function requestOrigin(): string {
  const request = inject(REQUEST, { optional: true });
  try {
    return request ? new URL(request.url).origin : '';
  } catch {
    return '';
  }
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: APP_CONFIG, useFactory: () => readConfig(serverEnv, requestOrigin()) },
    provideAppInitializer(() => {
      inject(TransferState).set(APP_CONFIG_STATE, inject(APP_CONFIG));
    }),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
