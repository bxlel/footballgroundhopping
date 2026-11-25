import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

// Contrôle automatique des règles WCAG 2.1 A et AA (axe-core) sur chaque type de page,
// en thème clair et en thème sombre. Il ne remplace pas un essai au clavier et au lecteur d'écran.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // Le canevas et les contrôles de la carte appartiennent à MapLibre.
    .exclude('.maplibregl-canvas')
    .exclude('.maplibregl-ctrl')
    .analyze();
  const summary = results.violations.map(
    (violation) => `${violation.id} : ${violation.nodes.map((node) => node.target).join(' | ')}`,
  );
  expect(summary).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`thème ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('accueil, avec les suggestions ouvertes', async ({ page }) => {
      await page.goto('/');
      await expectNoViolations(page);
      await page.getByRole('combobox', { name: 'Où ?' }).fill('Len');
      await expect(page.getByRole('option')).toHaveCount(1);
      await page.getByRole('button', { name: 'Autres dates' }).click();
      await expectNoViolations(page);
    });

    test('résultats, liste et messages', async ({ page }) => {
      await page.goto('/voyage?lieu=Lens&lat=50.4329&lng=2.8279&rayon=50');
      await page.getByRole('button', { name: 'Modifier la recherche' }).click();
      await page.getByRole('button', { name: '7 prochains jours' }).click();
      await page.getByRole('button', { name: 'Voir les matchs' }).click();
      await expect(page.locator('app-match-card')).toHaveCount(4);
      await expectNoViolations(page);

      await page.goto('/voyage?lieu=Reykjavik&lat=64.1355&lng=-21.8954&rayon=50');
      await expect(
        page.getByRole('heading', { name: 'Aucun match ici à ces dates' }),
      ).toBeVisible();
      await expectNoViolations(page);
    });

    test('fiche stade, fiche club, page match et page introuvable', async ({ page }) => {
      await page.goto('/stades/stade-bollaert-delelis-lens');
      await expect(page.locator('app-match-card')).toHaveCount(1);
      await expectNoViolations(page);

      await page.getByRole('link', { name: 'Lens contre Lille' }).click();
      await expect(page.getByRole('link', { name: 'Itinéraire Google Maps' })).toBeVisible();
      await expectNoViolations(page);

      await page.goto('/clubs/lens');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Lens');
      await expectNoViolations(page);

      await page.goto('/nulle-part');
      await expectNoViolations(page);
    });
  });
}
