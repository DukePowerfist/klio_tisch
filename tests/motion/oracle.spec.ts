// Ablauf an der Kartenschachtel (Schritt 5zb, Teil 3, ARCHITEKTUR.md 10.12): Sinken, Wackeln, hintere Karte, vordere.

import { expect, test, type Page } from '@playwright/test';
import { ready } from '../e2e/helpers';

const box = (page: Page) => page.locator('[data-oracle-box]');

/** Ab jetzt jede Animation der Schachtel mitschreiben: Kennung in der Reihenfolge des Auftauchens, bei Karten mit Index
 *  und Verzögerung */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { seen: string[]; known: WeakSet<Animation> };
    w.seen = [];
    w.known = new WeakSet();
    const step = () => {
      for (const a of document.getAnimations()) {
        if (w.known.has(a) || !a.id.startsWith('oracle-')) continue;
        w.known.add(a);
        const card = ((a.effect as KeyframeEffect).target as HTMLElement).dataset.oracleCard;
        const delay = (a.effect as KeyframeEffect).getTiming().delay ?? 0;
        w.seen.push(card === undefined ? a.id : `${a.id}#${card}@${Math.round(Number(delay))}`);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: string[] }).seen);

test.beforeEach(async ({ page }) => ready(page));

test('Orakel: alte Karten sinken, die Schachtel wackelt, dann hinten, danach vorn versetzt', async ({ page }) => {
  await box(page).click();
  await expect(box(page).locator('[data-oracle-card]')).toHaveCount(2);
  await page.waitForTimeout(1500);
  await record(page);
  await box(page).click({ position: { x: 20, y: 5 } });
  await expect.poll(() => seen(page)).toEqual(['oracle-sink#0@0', 'oracle-sink#1@0', 'oracle-shake', 'oracle-rise#0@0', 'oracle-rise#1@192']);
});

test('erstes Orakel: nichts zu versenken, sonst derselbe Ablauf', async ({ page }) => {
  await record(page);
  await box(page).click();
  await expect.poll(() => seen(page)).toEqual(['oracle-shake', 'oracle-rise#0@0', 'oracle-rise#1@192']);
});

test('Stufe „Aus“ (Bewegung reduzieren): keine Bewegung, nur die Wörter wechseln', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, true);
  await record(page);
  await box(page).click();
  await expect(box(page).locator('[data-oracle-card]')).toHaveCount(2);
  await page.waitForTimeout(800);
  expect(await seen(page)).toEqual([]);
});
