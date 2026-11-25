import { DEFAULT_MAP_STYLE_DARK, DEFAULT_MAP_STYLE_LIGHT, readConfig } from './config';

describe('readConfig', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it('lit les variables et retire les barres finales', () => {
    const config = readConfig(
      env({
        SUPABASE_URL: ' https://abc.supabase.co/ ',
        SUPABASE_ANON_KEY: ' cle-anon ',
        SITE_URL: 'https://spotthegame.app/',
        MAP_STYLE_URL: 'https://tuiles.example/clair',
      }),
      'http://localhost:4200',
    );
    expect(config).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'cle-anon',
      siteUrl: 'https://spotthegame.app',
      mapStyleLight: 'https://tuiles.example/clair',
      mapStyleDark: DEFAULT_MAP_STYLE_DARK,
    });
  });

  it('retombe sur l’URL Netlify puis sur l’origine de la requête', () => {
    expect(readConfig(env({ URL: 'https://site.netlify.app' }), 'http://x').siteUrl).toBe(
      'https://site.netlify.app',
    );
    const bare = readConfig(env({}), 'http://localhost:4200');
    expect(bare.siteUrl).toBe('http://localhost:4200');
    expect(bare.supabaseUrl).toBe('');
    expect(bare.mapStyleLight).toBe(DEFAULT_MAP_STYLE_LIGHT);
  });
});
