// Menü am Namensschild im lokalen Betrieb (Schritt 5j, ARCHITEKTUR.md 10.1). Mit Mitspielern: multiplayer.spec.ts.

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, makePng, ready, zoneCenter } from './helpers';

const plate = (page: Page, seat: string) => page.locator(`[data-plate=${seat}]`);
const menu = (page: Page) => page.getByRole('menu');
const entries = (page: Page) => menu(page).getByRole('menuitem');

test.beforeEach(async ({ page }) => ready(page));

test('Übersicht: Klick öffnet das Menü, Esc und Klick daneben schließen es', async ({ page }) => {
  await plate(page, 'seat2').click();
  await expect(menu(page)).toHaveAccessibleName('Platz 2');
  // lokal: nichts zu Personen; am freien Platz nur die Farbe
  await expect(entries(page)).toHaveText(['Farbe …', 'Zur Rollenansicht', 'Charakter auswürfeln', 'Foto ändern …', 'Charakter zurücksetzen']);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await plate(page, 'seat2').click();
  await page.mouse.click(5, 300);
  await expect(menu(page)).toHaveCount(0);
  // erneuter Klick aufs Schild schließt, ein anderes Schild wechselt
  await plate(page, 'seat2').click();
  await plate(page, 'seat2').click();
  await expect(menu(page)).toHaveCount(0);
  await plate(page, 'seat1').click();
  await plate(page, 'seat3').click();
  await expect(menu(page)).toHaveAccessibleName('Platz 3');
});

test('Zur Rollenansicht; dort steht das Schild auf dem großen Bogen, Esc schließt nur das Menü', async ({ page }) => {
  await plate(page, 'seat3').click();
  await entries(page).getByText('Zur Rollenansicht').click();
  await expect(page.locator('[data-dock=seat3]')).toHaveClass(/on/);
  await expect(page.locator('[data-plate]')).toHaveCount(1);
  await plate(page, 'seat3').click();
  await expect(entries(page)).not.toContainText(['Zur Rollenansicht']);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('[data-dock=seat3]')).toHaveClass(/on/);
});

test('Auswürfeln und Zurücksetzen mit Rückfrage', async ({ page }) => {
  const name = page.locator('[data-sheet=seat2] [data-field=name]');
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter auswürfeln').click();
  await expect(menu(page)).toHaveCount(0);
  await expect(name).not.toHaveValue('');
  // schon ausgefüllt: erst „Überschreiben?“
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter auswürfeln').click();
  await expect(entries(page).getByText('Überschreiben?')).toBeVisible();
  await page.keyboard.press('Escape');
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter zurücksetzen').click();
  await expect(name).not.toHaveValue('');
  await entries(page).getByText('Wirklich zurücksetzen?').click();
  await expect(menu(page)).toHaveCount(0);
  await expect(name).toHaveValue('');
  await expect(page.locator('[data-sheet=seat2] [data-field="strengths.text.0"]')).toHaveValue('');
});

test('Farbe eines Platzes über das Schild', async ({ page }) => {
  await plate(page, 'seat2').click();
  await entries(page).getByText('Farbe …').click();
  const dialog = page.getByRole('dialog', { name: 'Farbe: Platz 2' });
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Türkis' }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-dock=seat2]')).toHaveAttribute('style', /who-c-teal/);
});

test('Foto über das Schild, auch das Fotofeld am Bogen öffnet die Auswahl', async ({ page }) => {
  await plate(page, 'seat1').click();
  const chooser = page.waitForEvent('filechooser');
  await entries(page).getByText('Foto ändern …').click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page) });
  await expect(page.locator('[data-sheet=seat1] .photo')).toHaveCSS('background-image', /^url\(/);
  await page.keyboard.press('1');
  await expect(page.locator('[data-sheet=seat1] .photo')).toBeEnabled();
});

test('Schild stört den Tisch nicht: Menü auf und zu, danach Karte ziehen', async ({ page }) => {
  await plate(page, 'seat1').click();
  await page.keyboard.press('Escape');
  const deck = await zoneCenter(page, 'DECK');
  await dragFromTo(page, deck, await zoneCenter(page, 'GEFAHR'));
  await expectCount(page, 'GEFAHR', 1);
});
