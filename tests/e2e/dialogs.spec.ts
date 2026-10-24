// Gemeinsame Fensterbausteine (Schritt 5v, Teil 2, ARCHITEKTUR.md 10.8): ein Kopf mit × und Linie bis an den Rand,
// feste Oberkante beim Trumpf-Dialog. Platz wählen und Raum brauchen einen Mitspieler und bleiben hier ungeprüft.

import { expect, test, type Locator, type Page } from '@playwright/test';
import { fromMenu, openSettings, ready, setField } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const sheet1 = (page: Page) => page.locator('[data-sheet=seat1]');

/** Kopf mit Titel und genau einem ×; seine Linie reicht von Rand zu Rand des Fensters (bzw. der rechten Spalte) */
async function expectHead(dialog: Locator, title: string | RegExp) {
  const head = dialog.locator('.dialog-head');
  await expect(head).toHaveCount(1);
  await expect(head.locator('h2')).toHaveText(title);
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toHaveCount(1);
  const fit = await head.evaluate((h) => {
    const r = h.getBoundingClientRect();
    const col = (h.closest('.main') ?? h.closest('[role=dialog]'))!;
    const c = col.getBoundingClientRect();
    const border = col.matches('[role=dialog]') ? parseFloat(getComputedStyle(col).borderLeftWidth) : 0;
    return { left: r.left - (c.left + border), right: c.right - border - r.right, top: r.top - (c.top + border), line: getComputedStyle(h).borderBottomStyle };
  });
  expect(Math.abs(fit.left)).toBeLessThan(1);
  // rechts höchstens eine Scrollbar
  expect(fit.right).toBeGreaterThan(-1);
  expect(fit.right).toBeLessThan(16);
  expect(Math.abs(fit.top)).toBeLessThan(1);
  expect(fit.line).toBe('solid');
}

test('Jedes Fenster hat denselben Kopf mit × und Linie bis an den Rand; × und Esc schließen', async ({ page }) => {
  await fromMenu(page, 'Zurücksetzen');
  const reset = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  await expectHead(reset, 'Tisch zurücksetzen?');
  await reset.getByRole('button', { name: 'Schließen' }).click();
  await expect(reset).toHaveCount(0);

  const settings = await openSettings(page, 'Darstellung');
  await expectHead(settings, 'Darstellung');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Orakel', exact: true }).click();
  const oracle = page.getByRole('dialog', { name: 'Orakel' });
  await expectHead(oracle, 'Orakel');
  await page.keyboard.press('Escape');

  await page.locator('[data-plate=seat2]').click();
  await page.locator('[data-plate-menu]').getByText('Farbe …').click();
  const color = page.getByRole('dialog', { name: 'Farbe: Platz 2' });
  await expectHead(color, 'Farbe: Platz 2');
  // Klick daneben schließt wie bisher
  await page.mouse.click(5, 5);
  await expect(color).toHaveCount(0);

  await page.keyboard.press('1');
  await sheet1(page).locator('[data-slot="0"]').click();
  const trump = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  await expectHead(trump, /^Trumpf wählen/);
  await trump.getByRole('button', { name: 'Schließen' }).click();
  await expect(trump).toHaveCount(0);
});

test('Protokollspalte: × statt Textknopf, schließt', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  const log = page.locator('aside.log');
  await expect(log.locator('.dialog-close')).toHaveAccessibleName('Schließen');
  await log.getByRole('button', { name: 'Schließen' }).click();
  await expect(log).toHaveCount(0);
});

test('Trumpf wählen: beim Durchgehen der Schritte bleibt die Oberkante stehen; zu hoch rückt es nur so weit wie nötig und kehrt zurück', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'seat1', 'attributes.V', '3');
  await sheet1(page).locator('[data-slot="0"]').click();
  const dialog = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  const rect = async () => (await dialog.boundingBox())!;
  const first = (await rect()).y;
  await page.getByRole('button', { name: /^Starttrumpf/ }).click();
  await expect(dialog.locator('h2')).toHaveText('Für welches Attribut?');
  expect((await rect()).y).toBeCloseTo(first, 0);
  await page.getByRole('button', { name: /^Verstehen/ }).click();
  await expect(dialog.locator('h2')).toHaveText(/Trumpf wählen$/);
  // die Liste der Trümpfe ist höher als das Fenster: unten bündig mit dem Rand (12 px), oben so weit wie nötig
  // (die Lage folgt der Höhe einen Frame später, über den ResizeObserver in Modal.svelte)
  await expect.poll(async () => { const r = await rect(); return Math.round(r.y + r.height); }).toBe(900 - 12);
  const tall = await rect();
  expect(tall.y).toBeLessThan(first);
  await dialog.getByRole('button', { name: '← Zurück' }).click();
  await dialog.getByRole('button', { name: '← Zurück' }).click();
  await expect(dialog.getByRole('button', { name: 'Zufälliger Trumpf' })).toBeVisible();
  // wieder klein: zurück an die Oberkante vom Öffnen
  await expect.poll(async () => (await rect()).y).toBeCloseTo(first, 0);
});
