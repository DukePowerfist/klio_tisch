// Regelbuch zum Blättern (Schritt 5zk, ARCHITEKTUR.md 10.16), Teil 2: zur Nachbarseite klappt ein Blatt um die Buchmitte.

import { expect, test, type Page } from '@playwright/test';
import { box, fromMenu, ready } from '../e2e/helpers';

const book = (page: Page) => page.locator('[data-book]');
const leaf = (page: Page) => page.locator('[data-book-leaf]');
const toc = (page: Page) => page.locator('[data-book-toc]');

/** aufgeschlagen, gezeigt, und nichts liegt mehr darüber */
async function expectSpread(page: Page, id: string) {
  await expect(book(page)).toHaveAttribute('data-spread', id);
  await expect(page.locator(`[data-book-shown="${id}"]`)).toBeVisible();
  await expect(page.locator('[data-book-under]')).toHaveCount(0);
  await expect(leaf(page)).toHaveCount(0);
}

/** Ab jetzt jedes Blatt mitschreiben: Richtung, Dauer und Drehung */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { folds: { dir: string | null; duration: number; to: string }[] };
    w.folds = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      if (this.matches('[data-book-leaf]')) {
        const frames = keyframes as Keyframe[];
        w.folds.push({ dir: this.getAttribute('data-book-leaf'), duration: Number((options as KeyframeAnimationOptions).duration), to: String(frames[frames.length - 1]!['transform']) });
      }
      return orig.call(this, keyframes, options);
    };
  });
}
const folds = (page: Page) => page.evaluate(() => (window as unknown as { folds: { dir: string | null; duration: number; to: string }[] }).folds.splice(0));

/** Laufende Bewegungen am Buch anhalten und auf einen Zeitpunkt stellen */
const freeze = (page: Page, at: number) =>
  book(page).evaluate((el, at) => el.getAnimations({ subtree: true }).forEach((a) => {
    a.pause();
    a.currentTime = at;
  }), at);
const resume = (page: Page) => book(page).evaluate((el) => el.getAnimations({ subtree: true }).forEach((a) => a.play()));

test.beforeEach(async ({ page }) => {
  await ready(page);
  await fromMenu(page, 'Regeln');
  await expectSpread(page, 'intro');
  await record(page);
});

test('vor: ein Blatt klappt in 0,4 s von rechts nach links, danach liegt die neue Doppelseite ohne Blatt', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(leaf(page)).toHaveCount(1);
  await expect(leaf(page)).toHaveAttribute('data-book-leaf', 'next');
  await expectSpread(page, 'p01');
  expect(await folds(page)).toEqual([{ dir: 'next', duration: 400, to: 'rotateY(-180deg)' }]);
});

test('zurück: das Blatt klappt von links nach rechts', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expectSpread(page, 'p01');
  await folds(page);
  const b = await box(book(page));
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height / 2);
  await expect(leaf(page)).toHaveAttribute('data-book-leaf', 'prev');
  await expectSpread(page, 'intro');
  expect(await folds(page)).toEqual([{ dir: 'prev', duration: 400, to: 'rotateY(180deg)' }]);
});

test('mitten im Klappen: das Blatt steht über der Buchmitte, alte linke und neue rechte Seite sind zu sehen', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(leaf(page)).toHaveCount(1);
  await freeze(page, 200);
  const b = await box(book(page));
  const l = await box(leaf(page));
  // hochkant über der Buchmitte: schmal, und höher als in Ruhe (Blick von vorn)
  expect(l.width).toBeLessThan(b.width * 0.3);
  expect(l.height).toBeGreaterThan(b.height * 0.93);
  expect(Math.abs(l.x + l.width / 2 - (b.x + b.width / 2))).toBeLessThan(b.width * 0.2);
  // darunter noch das Bild der alten Doppelseite, rechts schon die neue Seite
  await expect(page.locator('[data-book-shown="intro"]')).toBeVisible();
  await expect(page.locator('.reveal img')).toHaveAttribute('src', /p01\.webp$/);
  await resume(page);
  await expectSpread(page, 'p01');
});

test('Einband und Buchmitte bleiben stehen: das Fenster ändert Größe und Lage nicht', async ({ page }) => {
  const before = await box(book(page));
  await page.keyboard.press('ArrowRight');
  await expect(leaf(page)).toHaveCount(1);
  await freeze(page, 200);
  expect(await box(book(page))).toEqual(before);
  const img = await box(page.locator('[data-book-shown]'));
  await resume(page);
  await expectSpread(page, 'p01');
  expect(await box(book(page))).toEqual(before);
  expect(await box(page.locator('[data-book-shown]'))).toEqual(img);
});

test('zweimal schnell: das erste Blatt wird sofort fertig, am Ende zwei Doppelseiten weiter', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(leaf(page)).toHaveCount(1);
  await freeze(page, 100);
  await page.keyboard.press('ArrowRight');
  await expect(book(page)).toHaveAttribute('data-spread', 'p03');
  // nie zwei Blätter zugleich; das zweite klappt von Seite 1/2 aus
  await expect(leaf(page)).toHaveCount(1);
  await expect(page.locator('.leaf .front img')).toHaveAttribute('src', /p01\.webp$/);
  await expectSpread(page, 'p03');
  expect((await folds(page)).map((f) => f.dir)).toEqual(['next', 'next']);
});

test('Sprung über mehrere Doppelseiten (Verzeichnis, Ende, Pos1): kein Blatt', async ({ page }) => {
  await toc(page).getByRole('button', { name: 'Rasten', exact: true }).click();
  await expectSpread(page, 'p11');
  await page.keyboard.press('Home');
  await expectSpread(page, 'intro');
  await page.keyboard.press('End');
  await expectSpread(page, 'p13');
  expect(await folds(page)).toEqual([]);
});

test('Verzeichnis zur Nachbarseite: klappt wie Blättern', async ({ page }) => {
  await toc(page).getByRole('button', { name: 'Vorbereitung', exact: true }).click();
  await expectSpread(page, 'p01');
  expect((await folds(page)).map((f) => f.dir)).toEqual(['next']);
});

test('gehaltene Taste: ohne Klappen', async ({ page }) => {
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  await expectSpread(page, 'p05');
  expect((await folds(page)).length).toBeLessThanOrEqual(1);
});

test('Schließen mitten im Klappen: beim nächsten Öffnen liegt die neue Doppelseite', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(leaf(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Regeln' })).toHaveCount(0);
  await fromMenu(page, 'Regeln');
  await expectSpread(page, 'p01');
});
