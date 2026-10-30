// Ablauf an der Kartenschachtel (Schritt 5zb, Teil 3, ARCHITEKTUR.md 10.12): Sinken, Wackeln, hintere Karte, vordere.
// Auf- und zuklappen (5zh, 11.14): Öffnen = Wackeln, Steigen; Schließen = nur Sinken. Ein neues Orakel bei offener
// Schachtel (Sinken, Wackeln, Steigen) kommt nur von einer zweiten Spielleitung und ist hier nicht nachzustellen.

import { expect, test, type Page } from '@playwright/test';
import { drawOracle, oracleCardName, oracleSettled, ready } from '../e2e/helpers';

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

const at = { position: { x: 20, y: 5 } };

test('Öffnen: die Schachtel wackelt, dann hinten, danach vorn versetzt; kein Sinken; Wörter erst mit dem Steigen (5zh)', async ({ page }) => {
  await record(page);
  // während des Wackelns noch ohne Wort (sonst stünde es vorab in der Daumenkerbe)
  await page.evaluate(() => {
    const w = window as unknown as { wordsWhileShaking: number[] };
    w.wordsWhileShaking = [];
    const step = () => {
      const box = document.querySelector('[data-oracle-box]')!;
      if (document.getAnimations().some((a) => a.id === 'oracle-shake' && a.playState === 'running')) w.wordsWhileShaking.push(box.querySelectorAll('.word').length);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await box(page).click();
  await expect.poll(() => seen(page)).toEqual(['oracle-shake', 'oracle-rise#0@0', 'oracle-rise#1@192']);
  await oracleSettled(page);
  const shaking = await page.evaluate(() => (window as unknown as { wordsWhileShaking: number[] }).wordsWhileShaking);
  expect(shaking.length).toBeGreaterThan(0);
  expect(new Set(shaking)).toEqual(new Set([0]));
  await expect(box(page).locator('.word')).toHaveCount(2);
});

test('Schließen: nur Sinken, langsamer als vor einem neuen Orakel, ohne Wackeln; Wörter erst danach weg (5zh)', async ({ page }) => {
  await drawOracle(page);
  await record(page);
  await box(page).click(at);
  await expect.poll(() => seen(page)).toEqual(['oracle-sink#0@0', 'oracle-sink#1@0']);
  const sinking = await box(page).evaluate((el) => ({
    words: el.querySelectorAll('.word').length,
    duration: el.getAnimations({ subtree: true }).map((a) => Number((a.effect as KeyframeEffect).getTiming().duration)),
  }));
  expect(sinking.words).toBe(2);
  for (const d of sinking.duration) expect(d).toBe(300);
  await oracleSettled(page);
  await expect(box(page)).toHaveAttribute('data-oracle-open', 'false');
  await expect(box(page).locator('.word')).toHaveCount(0);
});

test('Auf und zu mitten im Ablauf: der alte springt ans Ende, danach ein stimmiger Zustand ohne hängende Animation', async ({ page }) => {
  for (const wait of [60, 250, 500, 700]) {
    await box(page).click(at);
    await page.waitForTimeout(wait);
  }
  await page.waitForTimeout(2000);
  const after = await box(page).evaluate((el) => ({
    running: el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    open: el.getAttribute('data-oracle-open'),
    words: [...el.querySelectorAll('.word')].map((w) => w.textContent),
    cards: [...el.querySelectorAll('[data-oracle-index]')].map((w) => w.textContent!),
    label: el.getAttribute('aria-label'),
    offset: [...el.querySelectorAll<HTMLElement>('[data-oracle-card]')].map((c) => getComputedStyle(c).translate),
  }));
  expect(after.running).toBe(0);
  if (after.open === 'true') {
    expect(after.label).toBe(`Orakel: ${after.words.map((w, i) => `${w} (${oracleCardName(after.cards[i]!)})`).join(', ')}. Klicken schließt die Schachtel`);
    for (const t of after.offset) expect(['none', '0px', '0px 0px']).toContain(t);
  } else {
    expect(after).toMatchObject({ open: 'false', words: [], label: 'Orakel ziehen' });
    // hintere 60 − 5,5, vordere 30 − 3,5 TP tiefer
    expect(after.offset).toEqual(['0px 54.5px', '0px 26.5px']);
  }
});

test('Stufe „Aus“ (Bewegung reduzieren): keine Bewegung, Öffnen und Schließen springen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, true);
  await record(page);
  await box(page).click();
  await expect(box(page).locator('.word')).toHaveCount(2);
  await box(page).click(at);
  await expect(box(page).locator('.word')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await seen(page)).toEqual([]);
});
