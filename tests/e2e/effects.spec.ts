// Effektstufe (Schritt 5g, 11.5): Seite „Darstellung“, nur im eigenen Browser; ohne Wahl bei „Bewegung reduzieren“ „Aus“.
// Die Tests laufen mit reduzierter Bewegung (playwright.config.ts).

import { expect, test, type Page } from '@playwright/test';
import { expectCount, openMenuAndClick, openSettings, ready } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const level = (page: Page) => page.locator('html').getAttribute('data-effects');
/** Eigenschaften der Animationen, die gerade auf Karten laufen */
const cardAnimations = (page: Page) =>
  page.evaluate(() => document.getAnimations().flatMap((a) => Object.keys((a.effect as KeyframeEffect).getKeyframes()[0] ?? {})).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)));

test('Darstellung: Effekte für alle einstellbar, nur für einen selbst, bleibt nach dem Neuladen', async ({ page }) => {
  expect(await level(page)).toBe('off');
  const dialog = await openSettings(page, 'Darstellung');
  await expect(dialog.getByText('nur für dich', { exact: true })).toBeVisible();
  const select = dialog.getByRole('combobox', { name: 'Effekte' });
  await expect(select).toHaveValue('off');
  await expect(select).toHaveAccessibleDescription(/^Aus: keine Bewegung.*Ruhig: .*Voll: /);
  await select.selectOption('calm');
  expect(await level(page)).toBe('calm');
  await ready(page, true);
  expect(await level(page)).toBe('calm');
  await expect((await openSettings(page, 'Darstellung')).getByRole('combobox', { name: 'Effekte' })).toHaveValue('calm');
});

test('Ruhig bewegt die Karten auch bei „Bewegung reduzieren“, Aus nur mit Einblenden', async ({ page }) => {
  const dialog = await openSettings(page, 'Darstellung');
  await dialog.getByRole('combobox', { name: 'Effekte' }).selectOption('calm');
  await page.keyboard.press('Escape');
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expect.poll(() => cardAnimations(page)).toContain('transform');
  await expectCount(page, 'ABLAGE', 1);

  const again = await openSettings(page, 'Darstellung');
  await again.getByRole('combobox', { name: 'Effekte' }).selectOption('off');
  await page.keyboard.press('Escape');
  // das Stapelmenü ist noch offen
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await expect.poll(() => cardAnimations(page)).toContain('opacity');
  expect(await cardAnimations(page)).not.toContain('transform');
  await expectCount(page, 'ABLAGE', 2);
});
