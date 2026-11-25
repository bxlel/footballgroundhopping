import { defineConfig } from '@playwright/test';

// Tests de bout en bout : le build de production tourne en rendu serveur (scripts/serve-ssr.mjs)
// face à un faux Supabase (e2e/fake-supabase.mjs). Rien ne dépend d'Internet ni d'un vrai projet.

const APP_URL = 'http://127.0.0.1:4010';
const FAKE_SUPABASE_URL = 'http://127.0.0.1:54399';
const MAP_STYLE = `${FAKE_SUPABASE_URL}/style.json`;

// Chrome déjà installé (poste de dev, GitHub Actions). Sinon : PW_CHANNEL=chromium
// après `npx playwright install chromium`.
const channel = process.env['PW_CHANNEL'] ?? 'chrome';
const isCi = !!process.env['CI'];

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: APP_URL,
    channel,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: 'node e2e/fake-supabase.mjs',
      url: MAP_STYLE,
      reuseExistingServer: !isCi,
    },
    {
      command: 'node scripts/serve-ssr.mjs',
      url: APP_URL,
      reuseExistingServer: !isCi,
      env: {
        PORT: '4010',
        SUPABASE_URL: FAKE_SUPABASE_URL,
        SUPABASE_ANON_KEY: 'cle-de-test',
        MAP_STYLE_URL: MAP_STYLE,
        MAP_STYLE_URL_DARK: MAP_STYLE,
      },
    },
  ],
});
