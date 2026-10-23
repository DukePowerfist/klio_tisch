// Überdeckungen und Lesbarkeit (Schritt 5v, Teil 1, ARCHITEKTUR.md 10.8): Meldung, SL-Leiste, „DECK“, Kartenvorschau.

import { expect, test, type Page } from '@playwright/test';
import { box, expectCount, fromMenu, openMenuAndClick, ready, type Box } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const apart = (a: Box, b: Box) => a.x >= b.x + b.width || a.x + a.width <= b.x || a.y >= b.y + b.height || a.y + a.height <= b.y;
const label = (page: Page, text: string) => page.locator('.zone .label').filter({ hasText: new RegExp(`^${text}`) }).first();
/** Ansicht gleitet nicht (reducedMotion), aber der Zoom passt sich nach dem Wechsel an */
const settled = (page: Page) => page.waitForTimeout(200);

test('SL-Leiste verdeckt „Fortschritt“ nicht, „DECK“ ganz lesbar: beide Fenstergrößen, beide Ansichten, Protokoll offen und zu', async ({ page }) => {
  for (const [width, height] of [[1600, 900], [1024, 640]] as const) {
    await page.setViewportSize({ width, height });
    for (const log of [false, true]) {
      if (log) await fromMenu(page, 'Protokoll');
      for (const key of ['0', '1']) {
        await page.keyboard.press(key);
        await settled(page);
        const what = `${width} × ${height}, Protokoll ${log}, Taste ${key}`;
        const bar = await box(page.locator('[data-gm-bar]'));
        expect(apart(bar, await box(label(page, 'FORTSCHRITT'))), what).toBe(true);
        // die unterste Kante des vollen Decks endet über der Beschriftung
        const deck = await box(label(page, 'DECK'));
        const edges = await page.locator('[data-zone=deck] .edge').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
        expect(edges, what).toBeLessThanOrEqual(deck.y + 0.5);
      }
      if (log) await page.locator('aside.log').getByRole('button', { name: 'Schließen' }).click();
    }
  }
});

test('Meldung nach dem Ziehen verdeckt die SL-Leiste nicht und steht sonst unten', async ({ page }) => {
  // jede Karte bringt eine neue Meldung, die beim Erscheinen misst
  for (const [i, [width, height]] of ([[1600, 900], [1024, 640], [2400, 900]] as const).entries()) {
    await page.setViewportSize({ width, height });
    await settled(page);
    await openMenuAndClick(page, 'DECK', 'Ziehen');
    await page.keyboard.press('Escape');
    await expectCount(page, 'ABLAGE', i + 1);
    const toast = page.getByRole('status');
    await expect(toast).toHaveText(/^Aufgedeckt: /);
    const t = await box(toast);
    const bar = await box(page.locator('[data-gm-bar]'));
    const what = `${width} × ${height}`;
    expect(apart(t, bar), what).toBe(true);
    const across = t.x < bar.x + bar.width && bar.x < t.x + t.width;
    // ohne Überdeckung unten (28 px), sonst 8 px über der Leiste
    if (across) expect(t.y + t.height, what).toBeCloseTo(bar.y - 8, 0);
    else expect(height - (t.y + t.height), what).toBeCloseTo(28, 0);
  }
});

test('Kartenvorschau in der Ecke gegenüber der Karte, über Dock und Menüknopf, mit Schatten', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await page.keyboard.press('Escape');
  const card = page.locator('[data-card]:has(.inner:not(.down))').first();
  const c = await box(card);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  const preview = page.locator('.preview');
  await expect(preview).toBeVisible();
  const p = await box(preview);
  const stage = await box(page.locator('.stage'));
  // Karte rechts der Mitte: Vorschau unten links, sonst unten rechts
  if (c.x + c.width / 2 > stage.x + stage.width / 2) expect(p.x).toBeCloseTo(stage.x + 16, 0);
  else expect(p.x + p.width).toBeCloseTo(stage.x + stage.width - 16, 0);
  expect(p.y + p.height).toBeLessThanOrEqual(stage.y + stage.height - 16 + 0.5);
  for (const sel of ['.dock', '.menu']) expect(apart(p, await box(page.locator(sel))), sel).toBe(true);
  expect(await preview.evaluate((e) => getComputedStyle(e).boxShadow)).toContain('rgba(0, 0, 0, 0.55)');
  // dieselbe Karte: die Lage springt nicht
  await page.mouse.move(c.x + c.width / 2 + 3, c.y + c.height / 2 + 3);
  expect(await box(preview)).toEqual(p);
});
