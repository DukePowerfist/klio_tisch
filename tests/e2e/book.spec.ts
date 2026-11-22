// Regelbuch zum Blättern (Schritt 5zk, ARCHITEKTUR.md 10.16), Teil 1: öffnen, blättern, Verzeichnis, gemerkte Seite.
// Rein lokal: Stand und Protokoll bleiben, wie sie sind.

import { expect, test, type Page } from '@playwright/test';
import { box, fromMenu, menuButton, ready } from './helpers';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Regeln' });
const book = (page: Page) => page.locator('[data-book]');
const toc = (page: Page) => page.locator('[data-book-toc]');
const next = (page: Page) => page.getByRole('button', { name: 'Weiterblättern' });
const prev = (page: Page) => page.getByRole('button', { name: 'Zurückblättern' });
/** aufgeschlagen (gilt sofort) und gezeigt (Bild geladen, Überblenden fertig) */
async function expectSpread(page: Page, id: string) {
  await expect(book(page)).toHaveAttribute('data-spread', id);
  await expect(page.locator(`[data-book-shown="${id}"]`)).toBeVisible();
  await expect(page.locator('[data-book-under]')).toHaveCount(0);
  await expect(page.locator('[data-book-leaf]')).toHaveCount(0);
}
const open = (page: Page) => fromMenu(page, 'Regeln');

test.beforeEach(async ({ page }) => ready(page));

test('öffnet über das Menü mit der Einleitung; Bild geladen, Esc schließt und gibt den Fokus an den Menüknopf', async ({ page }) => {
  await open(page);
  await expect(dialog(page)).toBeVisible();
  await expectSpread(page, 'intro');
  const img = page.locator('[data-book-shown]');
  await expect(img).toHaveAttribute('alt', 'Einleitung');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(2060);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
});

test('Klick rechts blättert vor, links zurück; an den Enden gesperrt', async ({ page }) => {
  await open(page);
  await expect(prev(page)).toBeDisabled();
  const b = await box(book(page));
  await page.mouse.click(b.x + b.width * 0.75, b.y + b.height * 0.5);
  await expectSpread(page, 'p01');
  await expect(page.locator('[data-book-shown]')).toHaveAttribute('alt', 'Seiten 1 und 2: Vorbereitung, Charaktererstellung');
  await page.mouse.click(b.x + b.width * 0.75, b.y + b.height * 0.5);
  await expectSpread(page, 'p03');
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.5);
  await expectSpread(page, 'p01');
  await page.keyboard.press('End');
  await expectSpread(page, 'p13');
  await expect(next(page)).toBeDisabled();
  await page.mouse.click(b.x + b.width * 0.75, b.y + b.height * 0.5);
  await expectSpread(page, 'p13');
});

test('Tasten: Pfeile, Bild auf und ab, Pos1, Ende; kein Umlauf', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowLeft');
  await expectSpread(page, 'intro');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageDown');
  await expectSpread(page, 'p03');
  await page.keyboard.press('PageUp');
  await expectSpread(page, 'p01');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expectSpread(page, 'p13');
  await page.keyboard.press('Home');
  await expectSpread(page, 'intro');
});

test('Stufe „Aus“: kein Blatt klappt, die Doppelseite blendet über', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { leaves: number };
    w.leaves = 0;
    new MutationObserver(() => (w.leaves += document.querySelectorAll('[data-book-leaf]').length)).observe(document.body, { childList: true, subtree: true });
  });
  await page.keyboard.press('ArrowRight');
  await expectSpread(page, 'p01');
  await page.keyboard.press('ArrowLeft');
  await expectSpread(page, 'intro');
  expect(await page.evaluate(() => (window as unknown as { leaves: number }).leaves)).toBe(0);
});

test('mehrmals schnell: so viele Doppelseiten weiter, wie gedrückt wurde', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expectSpread(page, 'p07');
});

test('Verzeichnis: neben dem Buch, alle Überschriften, Sprung, Zähler und Hervorhebung', async ({ page }) => {
  await open(page);
  await expect(toc(page)).toHaveAttribute('data-book-toc', 'side');
  const t = await box(toc(page));
  const b = await box(book(page));
  expect(t.x + t.width).toBeLessThan(b.x);
  expect(t.x).toBeGreaterThanOrEqual(0);
  await expect(toc(page).locator('.menu-item')).toHaveCount(15);
  await expect(page.locator('[data-book-position]')).toHaveText('1 von 8');
  await toc(page).getByRole('button', { name: 'Schaden, Narben und Tod', exact: true }).click();
  await expectSpread(page, 'p09');
  await expect(page.locator('[data-book-position]')).toHaveText('6 von 8');
  await expect(toc(page).locator('[aria-current]')).toHaveText(['Expeditionen und Gefahren9', 'Schaden, Narben und Tod10']);
});

test('gemerkt: dieselbe Doppelseite nach Schließen und nach Neuladen; das Buch selbst bleibt zu', async ({ page }) => {
  await open(page);
  await toc(page).getByRole('button', { name: 'Rasten', exact: true }).click();
  await expectSpread(page, 'p11');
  await page.keyboard.press('Escape');
  await open(page);
  await expectSpread(page, 'p11');
  await ready(page, true);
  await expect(dialog(page)).toHaveCount(0);
  await open(page);
  await expectSpread(page, 'p11');
});

test('Klick neben das Buch schließt', async ({ page }) => {
  await open(page);
  await page.mouse.click(1590, 450);
  await expect(dialog(page)).toHaveCount(0);
});

test('das ganze Bild liegt im Fenster (Bändchen oben und unten), in 1600 × 900 und 1024 × 600', async ({ page }) => {
  for (const size of [{ width: 1600, height: 900 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(size);
    await ready(page, true);
    await open(page);
    const img = await box(page.locator('[data-book-shown]'));
    expect(img.y, `${size.width} oben`).toBeGreaterThanOrEqual(0);
    expect(img.y + img.height, `${size.width} unten`).toBeLessThanOrEqual(size.height + 0.5);
    const t = await box(toc(page));
    expect(t.x, `${size.width} Verzeichnis links`).toBeGreaterThanOrEqual(0);
    expect(t.y + t.height, `${size.width} Verzeichnis unten`).toBeLessThanOrEqual(size.height + 0.5);
  }
});

test('hochkant (768 × 1024): Verzeichnis unter dem Buch, beides im Fenster, Sprung geht', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await ready(page, true);
  await open(page);
  await expect(toc(page)).toHaveAttribute('data-book-toc', 'below');
  const b = await box(book(page));
  const t = await box(toc(page));
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(768);
  expect(t.y).toBeGreaterThan(b.y + b.height);
  expect(t.y + t.height).toBeLessThanOrEqual(1024);
  await toc(page).getByRole('button', { name: 'Impulse', exact: true }).click();
  await expectSpread(page, 'p07');
});

test.describe('Touch', () => {
  test.use({ hasTouch: true });
  test('Wischen nach links blättert vor, nach rechts zurück; kurzes oder senkrechtes Wischen nicht', async ({ page }) => {
    await open(page);
    const b = await box(book(page));
    const y = b.y + b.height / 2;
    const swipe = (x0: number, y0: number, x1: number, y1: number) =>
      book(page).evaluate((el, p) => {
        const ev = (type: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
        ev('pointerdown', p.x0, p.y0);
        ev('pointerup', p.x1, p.y1);
      }, { x0, y0, x1, y1 });
    await swipe(b.x + 600, y, b.x + 400, y + 10);
    await expectSpread(page, 'p01');
    await swipe(b.x + 600, y, b.x + 580, y);
    await swipe(b.x + 600, y, b.x + 560, y + 200);
    await expectSpread(page, 'p01');
    await swipe(b.x + 300, y, b.x + 500, y);
    await expectSpread(page, 'intro');
  });
});

test('rein lokal: Blättern ändert weder Stand noch Protokoll', async ({ page }) => {
  const saved = () => page.evaluate(() => new Promise<string>((resolve, reject) => {
    const req = indexedDB.open('klio-tisch');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = req.result.transaction('saved').objectStore('saved').getAll();
      all.onsuccess = () => resolve(JSON.stringify(all.result));
      all.onerror = () => reject(all.error);
    };
  }));
  await fromMenu(page, 'Protokoll');
  const log = page.locator('.log');
  const before = { saved: await saved(), log: await log.innerText() };
  await open(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await expectSpread(page, 'p13');
  await page.keyboard.press('Escape');
  expect(await saved()).toBe(before.saved);
  expect(await log.innerText()).toBe(before.log);
});
