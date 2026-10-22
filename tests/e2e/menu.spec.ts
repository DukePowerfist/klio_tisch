// Menü oben rechts im Menüstil (Schritt 5p, ARCHITEKTUR.md 10.4). Kopf bei SL und Spieler: multiplayer.spec.ts.

import { expect, test, type Page } from '@playwright/test';
import { fromMenu, menuButton, ready } from './helpers';

const panel = (page: Page) => page.locator('[data-top-menu]');
const rect = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;

test.beforeEach(async ({ page }) => ready(page));

/** Zipfel auf der Mitte des Knopfs, Panel darunter und ganz im Fenster */
async function expectAtButton(page: Page) {
  const b = (await menuButton(page).boundingBox())!;
  const tip = await rect(page, '[data-top-menu] .menu-tip');
  const m = await rect(page, '[data-top-menu]');
  expect(Math.abs(tip.x + tip.width / 2 - (b.x + b.width / 2))).toBeLessThan(1.5);
  expect(m.y).toBeGreaterThan(b.y + b.height);
  expect(m.x + m.width).toBeCloseTo(b.x + b.width, 0);
  expect(m.x).toBeGreaterThanOrEqual(0);
}

test('lokal: Kopf „Lokal“ ohne Zahl, Menüstil, Zipfel auf den Knopf', async ({ page }) => {
  await menuButton(page).click();
  await expect(panel(page).locator('.menu-head')).toHaveText('Lokal');
  await expect(panel(page)).toHaveCSS('width', '240px');
  await expect(panel(page)).toHaveCSS('background-color', 'rgb(23, 51, 42)');
  await expectAtButton(page);
});

test('Protokoll offen: „offen“ am Eintrag statt eines Rahmens, Zipfel weiter auf dem mitgerückten Knopf', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  await menuButton(page).click();
  const log = page.getByRole('button', { name: 'Protokoll', exact: true });
  await expect(log).toHaveAttribute('aria-pressed', 'true');
  await expect(log.locator('.menu-note')).toHaveText('offen');
  await expect(log).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expectAtButton(page);
  await log.click();
  await menuButton(page).click();
  await expect(log.locator('.menu-note')).toHaveCount(0);
  await expect(log).toHaveAttribute('aria-pressed', 'false');
});

test('Esc schließt das Menü und bleibt in der Rollenansicht; bei geschlossenem Menü verlässt Esc sie (R9)', async ({ page }) => {
  await page.keyboard.press('2');
  await expect(page.locator('[data-dock=seat2]')).toHaveClass(/on/);
  await menuButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-dock=seat2]')).toHaveClass(/on/);
  // Gegentest
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-dock=seat2]')).not.toHaveClass(/on/);
});

test('nur ein Menü offen: Knopf schließt das Namensschild-Menü, Schild schließt dieses', async ({ page }) => {
  await page.locator('[data-plate=seat1]').click();
  await menuButton(page).click();
  await expect(page.locator('[data-plate-menu]')).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await page.locator('[data-plate=seat1]').click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-plate-menu]')).toBeVisible();
});
