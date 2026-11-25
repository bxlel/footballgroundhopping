import { expect, Page, test } from '@playwright/test';

// Le faux Supabase place ses matchs sur les trois prochains jours, autour de Lens :
// 4 matchs à moins de 50 km (dont un en Belgique et un à l'horaire non confirmé),
// et un cinquième à Paris.

const LENS = { latitude: 50.4329, longitude: 2.8279 };

async function searchAround(page: Page, typed: string, city: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Trouve ton match');
  const where = page.getByRole('combobox', { name: 'Où ?' });
  await where.fill(typed);
  await page.getByRole('option', { name: new RegExp(city) }).click();
  await expect(where).toHaveValue(city);
  await page.getByRole('button', { name: '7 prochains jours' }).click();
  await page.getByRole('button', { name: 'Voir les matchs' }).click();
}

test('recherche → résultats → page match → fiche du stade', async ({ page }) => {
  await searchAround(page, 'Len', 'Lens');

  // Résultats : l'URL porte la recherche, le résumé est annoncé, la liste est triée par jour.
  await expect(page).toHaveURL(/\/voyage\?.*lieu=Lens.*rayon=50/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Matchs autour de Lens');
  const summary = page.getByRole('status').filter({ hasText: 'match' });
  await expect(summary).toHaveText('4 matchs à moins de 50 km');
  await expect(page.locator('app-match-card')).toHaveCount(4);
  await expect(page.locator('app-match-card').first()).toContainText('Lille');
  await expect(page.locator('app-match-card').first()).toContainText('29 km');
  await expect(page.getByText('Horaire à confirmer')).toBeVisible();

  // Les filtres s'appliquent sans recharger.
  await page.getByRole('button', { name: 'Coupe', exact: true }).click();
  await expect(summary).toHaveText('1 sur 4 matchs');
  await expect(page.locator('app-match-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Divisions inférieures' }).click();
  await expect(page.locator('app-match-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Tout retirer' }).click();
  await expect(summary).toHaveText('4 matchs à moins de 50 km');

  // Page match.
  await page.getByRole('link', { name: 'Lens contre Lille' }).click();
  await expect(page).toHaveURL(/\/matchs\/\d{4}-\d{2}-\d{2}-lens-lille$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lens');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lille');
  await expect(page).toHaveTitle(/^Lens – Lille, \S+ \d+ \S+ \d{4} — Spot the Game$/);
  await expect(page.getByRole('link', { name: 'Itinéraire Google Maps' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=50.4328%2C2.8149',
  );
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  );
  expect(jsonLd['@type']).toBe('SportsEvent');
  expect(jsonLd.location.name).toBe('Stade Bollaert-Delelis');

  // Fiche du stade.
  await page.getByRole('link', { name: 'Voir la fiche du stade' }).click();
  await expect(page).toHaveURL(/\/stades\/stade-bollaert-delelis-lens$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stade Bollaert-Delelis');
  await expect(page.getByText(/38.223 places/)).toBeVisible();
  await expect(page.locator('app-match-card')).toHaveCount(1);
});

test('la recherche se fait entièrement au clavier', async ({ page }) => {
  await page.goto('/');
  const where = page.getByRole('combobox', { name: 'Où ?' });
  await where.focus();
  await page.keyboard.type('Li');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(where).toHaveAttribute('aria-activedescendant', /\S+/);
  await page.keyboard.press('Enter');
  await expect(where).toHaveValue('Lille');
  await page.getByRole('button', { name: '7 prochains jours' }).press('Enter');
  await where.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/voyage\?.*lieu=Lille/);
  await expect(page.locator('app-match-card').first()).toBeVisible();
});

test('« autour de moi » lance la recherche depuis la position du visiteur', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(LENS);
  await page.goto('/');
  // La localisation étant déjà autorisée, le champ est pré-rempli.
  await expect(page.getByRole('combobox', { name: 'Où ?' })).toHaveValue('Ma position');
  await expect(page.getByRole('button', { name: 'Ce week-end' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '7 prochains jours' }).click();
  await page.getByRole('button', { name: 'Voir les matchs' }).click();
  await expect(page).toHaveURL(/\/voyage\?.*lat=50\.4329/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Matchs autour de Ma position');
  await expect(page.locator('app-match-card')).toHaveCount(4);
});

test('aucun match : la page propose d’élargir le rayon', async ({ page }) => {
  await searchAround(page, 'Rey', 'Reykjavik');
  await expect(page.getByRole('heading', { name: 'Aucun match ici à ces dates' })).toBeVisible();
  await page.getByRole('button', { name: 'Chercher à 100 km' }).click();
  await expect(page).toHaveURL(/rayon=100/);
  await expect(page.getByRole('button', { name: 'Chercher à 200 km' })).toBeVisible();
});

test('un champ vide donne un message qui dit quoi faire', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Voir les matchs' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Indique une ville, un stade ou une adresse, ou utilise ta position.',
  );
  await expect(page).toHaveURL(/\/$/);
});

test('la carte et la liste se répondent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Le survol n’existe pas au doigt.');
  await searchAround(page, 'Len', 'Lens');
  const pins = page.locator('.pin');
  await expect(pins).toHaveCount(4);

  // Survoler un match met son stade en évidence sur la carte.
  const card = page.locator('app-match-card', { hasText: 'Tournai' });
  await card.hover();
  await expect(page.locator('.pin--active')).toHaveAttribute(
    'aria-label',
    'Stade Luc Varenne : 1 match',
  );

  // Choisir un repère met son match en évidence dans la liste et y place le focus.
  await page.getByRole('button', { name: 'Stade Degouve-Brabant : 1 match' }).click();
  await expect(page.locator('app-match-card.is-active')).toContainText('Arras');
  await expect(page.getByRole('link', { name: 'Arras contre Calais' })).toBeFocused();
});

test('la carte d’une fiche stade se charge au premier geste', async ({ page }) => {
  await page.goto('/stades/stade-bollaert-delelis-lens');
  await expect(page.getByRole('button', { name: 'Afficher la carte' })).toBeVisible();
  await expect(page.locator('.pin')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Stade Bollaert-Delelis : 1 match' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afficher la carte' })).toHaveCount(0);
});

test('« J’y vais » compte les personnes et se souvient de l’appareil', async ({ page }) => {
  // Un match que les autres tests ne marquent pas : le compteur part de zéro.
  await page.goto('/clubs/paris-saint-germain');
  await page.getByRole('link', { name: 'Paris Saint-Germain contre Nantes' }).click();

  const button = page.getByRole('button', { name: 'J’y vais' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  const before = await page
    .getByText(/y va|y vont|premier/)
    .first()
    .textContent();
  await button.click();

  const pressed = page.getByRole('button', { name: 'Tu y vas' });
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/personnes? y v(a|ont)/)).not.toHaveText(before ?? '');

  // Après rechargement, le serveur rend le compteur et l'appareil retrouve son état.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tu y vas' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/personnes? y v(a|ont)/)).toBeVisible();

  // Le compteur apparaît aussi sur les cartes.
  await page.goto('/clubs/nantes');
  await expect(page.locator('app-match-card')).toContainText(/y v(a|ont)/);

  // Et on peut se raviser.
  await page.goBack();
  await page.getByRole('button', { name: 'Tu y vas' }).click();
  await expect(page.getByRole('button', { name: 'J’y vais' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('partager copie le lien quand le navigateur n’a pas de feuille de partage', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Le presse-papiers se teste sur desktop.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/stades/stade-bollaert-delelis-lens');
  await page.getByRole('button', { name: 'Partager' }).click();
  await expect(page.getByText('Lien copié')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /\/stades\/stade-bollaert-delelis-lens$/,
  );
});

test('la page match propose un fichier de calendrier', async ({ page }) => {
  await page.goto('/clubs/lens');
  await page.getByRole('link', { name: 'Lens contre Lille' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ajouter au calendrier' }).click();
  expect((await download).suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-lens-lille\.ics$/);
});

test('le plan du site et robots.txt sont servis, avec les pages à indexer', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('application/xml');
  const xml = await sitemap.text();
  expect(xml).toContain('/stades/stade-bollaert-delelis-lens</loc>');
  expect(xml).toMatch(/\/matchs\/\d{4}-\d{2}-\d{2}-lens-lille<\/loc><lastmod>\d{4}-\d{2}-\d{2}/);
  expect(xml).toContain('/clubs/lens</loc>');
  expect(xml).not.toContain('/voyage');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /voyage');
  expect(robots).toMatch(/Sitemap: http.+\/sitemap\.xml/);
});

test('les liens partagés ont une image et un titre d’aperçu', async ({ request }) => {
  const html = await (await request.get('/stades/stade-bollaert-delelis-lens')).text();
  expect(html).toMatch(/property="og:image" content="[^"]+\/og\.png"/);
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect((await request.get('/og.png')).headers()['content-type']).toBe('image/png');
});

test('les pages de contenu sont rendues côté serveur, avec les bons statuts', async ({
  request,
}) => {
  const venue = await request.get('/stades/stade-bollaert-delelis-lens');
  expect(venue.status()).toBe(200);
  const html = await venue.text();
  expect(html).toContain('<title>Stade Bollaert-Delelis, Lens : prochains matchs et accès');
  expect(html).toMatch(/rel="canonical" href="[^"]+\/stades\/stade-bollaert-delelis-lens"/);
  expect(html).toContain('Avenue Alfred Maes');

  const club = await request.get('/clubs/lens');
  expect(await club.text()).toContain('Prochains matchs');

  expect((await request.get('/stades/inconnu')).status()).toBe(404);
  expect((await request.get('/matchs/inconnu')).status()).toBe(404);
  expect((await request.get('/page-qui-n-existe-pas')).status()).toBe(404);
});
