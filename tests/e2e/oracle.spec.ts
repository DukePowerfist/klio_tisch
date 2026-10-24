// Kartenschachtel des Orakels (Schritt 5zb, Teil 3, ARCHITEKTUR.md 10.12): Wörter lesbar, Maske, Größe.

import { expect, test, type Page } from '@playwright/test';
import { readContent } from '../content/read';
import { ready } from './helpers';

const raw = readContent() as unknown as { expedition: { oracle: Record<string, Record<string, string>> } };
const words = Object.values(raw.expedition.oracle).flatMap((byRank) => Object.values(byRank));

const box = (page: Page) => page.locator('[data-oracle-box]');

test.beforeEach(async ({ page }) => {
  await ready(page);
  await box(page).click();
  await expect(box(page).locator('[data-oracle-card]')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
});

test('jedes Orakelwort passt ganz ins Wortband, auch das breiteste (gemessen, T7)', async ({ page }) => {
  const tooWide = await box(page).locator('.word').first().evaluate((el, all) => {
    const was = el.textContent;
    const wide = all.filter((w) => {
      el.textContent = w;
      return el.scrollWidth > el.clientWidth + 0.5;
    });
    el.textContent = was;
    return wide;
  }, words);
  expect(tooWide).toEqual([]);
});

test('Wörter mindestens 12 px bei 1024 × 600 und 1920 × 1080 (die Schachtel wächst im kleinen Fenster, S3)', async ({ page }) => {
  const word = content(page);
  for (const [w, h] of [[1024, 600], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(100);
    expect(await word(), `${w} × ${h}`).toBeGreaterThanOrEqual(11.9);
  }
});

/** Schriftgröße der Wörter auf dem Bildschirm: Breite der Karte am Bildschirm / 80 TP · Schrift in TP */
const content = (page: Page) => () =>
  box(page).locator('[data-oracle-card]').first().evaluate((card: HTMLElement) => {
    const span = card.querySelector<HTMLElement>('.word')!;
    return (card.getBoundingClientRect().width / card.offsetWidth) * parseFloat(getComputedStyle(span).fontSize);
  });

test('Maske: unter der Öffnungskante ist keine Karte zu sehen, in der Daumenkerbe schon', async ({ page }) => {
  const hit = await box(page).evaluate((el) => {
    const inner = el.querySelector<HTMLElement>('.inner')!;
    const r = el.getBoundingClientRect();
    const k = r.width / inner.offsetWidth;
    /** Punkt im Bild der Schachtel (TP) → Element am Bildschirm */
    const at = (x: number, y: number) => document.elementFromPoint(r.left + x * k, r.top + y * k)?.closest('[data-oracle-card]')?.getAttribute('data-oracle-card') ?? null;
    // vordere Karte (Index 1) reicht von 6 bis 118 TP im Bild; links neben der Kerbe unter der Kante verdeckt
    return { belowEdge: at(14, 46), inNotch: at(48, 40), aboveEdge: at(48, 20) };
  });
  expect(hit).toEqual({ belowEdge: null, inNotch: '1', aboveEdge: '1' });
});
