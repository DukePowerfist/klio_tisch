// Kartenschachtel des Orakels (Schritt 5zb, Teil 3, ARCHITEKTUR.md 10.12): Wörter lesbar, Maske, Größe. Eckzeichen (5ze, 11.13).
// Auf- und zuklappen (5zh, 11.14).

import { expect, test, type Page } from '@playwright/test';
import { readContent } from '../content/read';
import { dragFromTo, drawOracle, expectCount, ready, zoneCenter } from './helpers';

const raw = readContent() as unknown as { expedition: { oracle: Record<string, Record<string, string>> } };
const words = Object.values(raw.expedition.oracle).flatMap((byRank) => Object.values(byRank));

const box = (page: Page) => page.locator('[data-oracle-box]');

test.beforeEach(async ({ page }) => {
  await ready(page);
  await drawOracle(page);
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

test('Wort und Eckzeichen: der Text jedes Wortes liegt rechts vom linken Nagel und links vom Zeichen, auch neben „10“ (5ze)', async ({ page }) => {
  const NAIL = 7.6; // rechte Kante des linken gemalten Nagels in TP der Karte (11.13)
  const bad = await box(page).evaluate((el, { all, nail }) => {
    el.style.rotate = '0deg'; // gemessen wird in TP der Karte, ohne die Neigung der Schachtel
    const card = el.querySelector<HTMLElement>('[data-oracle-card]')!;
    const word = card.querySelector<HTMLElement>('.word')!;
    const index = card.querySelector<HTMLElement>('[data-oracle-index]')!;
    const c = card.getBoundingClientRect();
    const k = c.width / card.offsetWidth;
    /** waagrechte Ausdehnung des Textes in TP der Karte */
    const extent = (node: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return { left: (r.left - c.left) / k, right: (r.right - c.left) / k };
    };
    const was = { word: word.textContent, index: index.innerHTML };
    index.innerHTML = '10<br>♣';
    const sign = extent(index);
    const out = all.flatMap((w) => {
      word.textContent = w;
      const text = extent(word);
      return text.left <= nail || text.right >= sign.left ? [{ w, ...text, sign: sign.left }] : [];
    });
    word.textContent = was.word;
    index.innerHTML = was.index;
    el.style.rotate = '';
    return out;
  }, { all: words, nail: NAIL });
  expect(bad).toEqual([]);
});

test('Eckzeichen: Wert und Symbol wie in der Beschriftung, Herz rot, Pik und Kreuz dunkel, blass, für Bildschirmleser versteckt (5ze)', async ({ page }) => {
  // mehrmals ziehen, damit meist beide Farben vorkommen
  for (let i = 0; i < 4; i++) {
    if (i) await drawOracle(page, { x: 20, y: 5 });
    await expect(box(page).locator('[data-oracle-index]')).toHaveCount(2);
    const signs = await box(page).locator('[data-oracle-index]').evaluateAll((els) => els.map((el) => {
      const css = getComputedStyle(el);
      return { text: el.textContent!, color: css.color, opacity: css.opacity, hidden: el.getAttribute('aria-hidden'), inWord: !!el.closest('.word') };
    }));
    for (const s of signs) {
      const red = s.text.endsWith('♥');
      expect(s.text).toMatch(/^(10|[2-9]|B|D|K|A)[♥♠♣]$/);
      expect(s.color).toBe(red ? 'rgb(192, 57, 43)' : 'rgb(34, 34, 34)');
      expect(Number(s.opacity)).toBeLessThan(1);
      expect(s).toMatchObject({ hidden: 'true', inWord: false });
    }
  }
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

test('Karte neben die Schachtel fallen lassen: landet nicht auf ihr, auch nicht auf den Karten darüber (F5, T1)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const reach = (await box(page).locator('.reach').boundingBox())!;
  await dragFromTo(page, deck, { x: reach.x + reach.width / 2, y: reach.y + 5 });
  await expectCount(page, 'DECK', 26);
  const free = page.locator('[data-card][style*="rotate(90deg)"]');
  await expect(free).toHaveCount(1);
  await expect.poll(async () => {
    const c = (await free.boundingBox())!;
    return c.x + c.width <= reach.x || c.x >= reach.x + reach.width || c.y + c.height <= reach.y;
  }).toBe(true);
});

/** Oberkante jeder Karte über der Öffnung in TP der Schachtel, ohne Neigung; dazu, welche Karte an Punkten des Bildes liegt.
 *  Gemessen an der Lage, nicht an der Größe: die Box im Browser ist nicht von der Maske beschnitten. */
const measure = (page: Page) => box(page).evaluate((el) => {
  el.style.rotate = '0deg';
  const inner = el.querySelector<HTMLElement>('.inner')!;
  const r = inner.getBoundingClientRect();
  const k = r.width / inner.offsetWidth;
  const at = (x: number, y: number) => document.elementFromPoint(r.left + x * k, r.top + y * k)?.closest('[data-oracle-card]')?.getAttribute('data-oracle-card') ?? null;
  const out = [...el.querySelectorAll<HTMLElement>('[data-oracle-card]')].map((c) => 36 - (c.getBoundingClientRect().top - r.top) / k);
  const res = { out, aboveEdge: at(48, 26), inNotch: at(48, 40), words: el.querySelectorAll('.word, [data-oracle-index]').length };
  el.style.rotate = '';
  return res;
});

test('zu (5zh): nur die Oberkanten über der Öffnung, hintere 5,5, vordere 3,5 TP; ohne Wort und Zeichen, auch in der Kerbe', async ({ page }) => {
  await box(page).click({ position: { x: 20, y: 5 } });
  await expect(box(page)).toHaveAttribute('data-oracle-open', 'false');
  const m = await measure(page);
  expect(m.out[0]).toBeCloseTo(5.5, 0);
  expect(m.out[1]).toBeCloseTo(3.5, 0);
  // 26 TP liegt klar über beiden Kanten (Öffnung bei 36): leer; in der Kerbe sieht man die vordere Karte, aber ohne Wort
  expect(m).toMatchObject({ aboveEdge: null, inNotch: '1', words: 0 });
  await drawOracle(page, { x: 20, y: 5 });
  const open = await measure(page);
  expect(open.out[0]).toBeCloseTo(60, 0);
  expect(open.out[1]).toBeCloseTo(30, 0);
  expect(open.words).toBe(4);
});

test('Neuladen behält offen und zu, ohne Ablauf (5zh)', async ({ page }) => {
  const words = await box(page).locator('.word').allTextContents();
  await ready(page, true);
  await expect(box(page)).toHaveAttribute('data-oracle-open', 'true');
  await expect(box(page).locator('.word')).toHaveText(words);
  await box(page).click({ position: { x: 20, y: 5 } });
  await expect(box(page)).toHaveAttribute('data-oracle-open', 'false');
  await ready(page, true);
  await expect(box(page)).toHaveAttribute('data-oracle-open', 'false');
  await expect(box(page).locator('[data-oracle-card]')).toHaveCount(2);
  await expect(box(page).locator('.word')).toHaveCount(0);
});
