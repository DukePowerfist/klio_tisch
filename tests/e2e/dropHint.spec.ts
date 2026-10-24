// Vorschau der Ablegestelle (11.6, Schritt 5h): gestrichelter Umriss beim Ziehen, genau dort, wo die Karte landet.

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, holdOver, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const box = async (page: Page, selector: string) => {
  const b = (await page.locator(selector).boundingBox())!;
  return [b.x, b.y, b.width, b.height].map(Math.round);
};

test('Umriss über der Ablage an der Stelle, an der die Karte danach liegt; über dem eigenen Stapel keiner', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const discard = await zoneCenter(page, 'ABLAGE');
  await holdOver(page, deck, discard);
  const hint = page.locator('.drop-hint');
  await expect(hint).toHaveCount(1);
  const shown = await box(page, '.drop-hint');
  const dragged = await page.locator('.card.dragging').getAttribute('data-card');
  await page.mouse.up();
  await expectCount(page, 'ABLAGE', 1);
  await expect(hint).toHaveCount(0);
  expect(await box(page, `.scene > [data-card="${dragged}"]`)).toEqual(shown);

  // zurück auf den eigenen Stapel: die Karte fiele an ihren Platz, kein Umriss
  await holdOver(page, deck, { x: deck.x + 10, y: deck.y + 10 });
  await expect(page.locator('.card.dragging')).toHaveCount(1);
  await expect(hint).toHaveCount(0);
  await page.mouse.up();
});

test('kein Umriss über vollen Notizen (der Host würde ablehnen)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const notes = await zoneCenter(page, 'NOTIZEN');
  for (let i = 1; i <= 3; i++) {
    await dragFromTo(page, deck, notes);
    await expectCount(page, 'DECK', 27 - i);
  }
  await holdOver(page, deck, notes);
  await expect(page.locator('.card.dragging')).toHaveCount(1);
  await expect(page.locator('.drop-hint')).toHaveCount(0);
  await page.mouse.up();
});

// ---------- Karte in der Hand in einheitlicher Größe (11.10, Schritt 5za) ----------

/** Breite der obersten Deckkarte in alter Größe (Maßstab 1) */
const deckCardWidth = async (page: Page) => (await page.locator('.scene > .card').last().boundingBox())!.width;
const dragged = (page: Page) => page.locator('.card.dragging');

test('Deckkarte in der Hand: 0,6 so breit wie im Deck, über dem Filz wie über der Ablage; Umriss liegt über ihr', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const discard = await zoneCenter(page, 'ABLAGE');
  const full = deckCardWidth(page);
  await holdOver(page, deck, { x: discard.x + 120, y: discard.y });
  const w = (await dragged(page).boundingBox())!.width;
  expect(w / (await full)).toBeCloseTo(0.6, 2);
  await page.mouse.move(discard.x, discard.y, { steps: 4 });
  expect((await dragged(page).boundingBox())!.width).toBeCloseTo(w, 1);
  // der Umriss über der gezogenen Karte, unter dem Licht
  const z = await page.evaluate(() => [document.querySelector('.drop-hint'), document.querySelector('.card.dragging')].map((e) => Number(getComputedStyle(e!).zIndex)));
  expect(z[0]).toBeGreaterThan(z[1]!);
  expect(z[0]).toBeLessThan(450000);
  await page.mouse.up();
  await expectCount(page, 'ABLAGE', 1);
});

/** Karte vom Deck greifen, über `to` halten, Ecke der kleinen Karte merken, loslassen; liefert gezeigte und
 *  abgelegte Ecke (Bildschirm) */
async function dropAt(page: Page, to: { x: number; y: number }) {
  const deck = await zoneCenter(page, 'DECK');
  await holdOver(page, deck, to);
  const card = (await dragged(page).getAttribute('data-card'))!;
  const shown = (await dragged(page).boundingBox())!;
  await expect(page.locator('.drop-hint')).toHaveCount(1);
  const hint = (await page.locator('.drop-hint').boundingBox())!;
  await page.mouse.up();
  await expectCount(page, 'DECK', 26);
  const el = page.locator(`.scene > [data-card="${card}"]`);
  await expect(el).not.toHaveClass(/pending/);
  return { shown, hint, landed: (await el.boundingBox())! };
}

test('Ablegen auf dem Filz: landet an der Ecke, an der man die kleine Karte gesehen hat, nur gedreht', async ({ page }) => {
  const discard = await zoneCenter(page, 'ABLAGE');
  const { shown, hint, landed } = await dropAt(page, { x: discard.x + 120, y: discard.y });
  expect(landed.x).toBeCloseTo(shown.x, 0);
  expect(landed.y).toBeCloseTo(shown.y, 0);
  expect(landed.width).toBeGreaterThan(landed.height);
  expect([landed.x, landed.y].map(Math.round)).toEqual([hint.x, hint.y].map(Math.round));
});

test('frei am linken Rand eines Bogens abgelegt: bleibt auf dem Bogen, auch wenn die Ecke daneben liegt (F5)', async ({ page }) => {
  const sheet = (await page.locator('[data-sheet="seat2"]').boundingBox())!;
  // eine Höhe am linken Rand ohne Feld darunter
  const y = await page.evaluate(({ x, top, h }) => {
    for (const f of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      const el = document.elementFromPoint(x, top + f * h);
      if (el && !el.closest('.zone, [data-card], input, textarea, button')) return top + f * h;
    }
    return null;
  }, { x: sheet.x + 8, top: sheet.y, h: sheet.height });
  expect(y).not.toBeNull();
  const { shown, landed } = await dropAt(page, { x: sheet.x + 8, y: y! });
  expect(shown.x).toBeLessThan(sheet.x);
  // nicht an den Rand der Tischmitte geholt, sondern genau dort
  expect(landed.x).toBeCloseTo(shown.x, 0);
  expect(landed.y).toBeCloseTo(shown.y, 0);
});

test('verbotenes Ziel und abgebrochener Zug: kein Umriss, die Karte kehrt in alter Größe zurück', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const notes = await zoneCenter(page, 'NOTIZEN');
  for (let i = 1; i <= 3; i++) {
    await dragFromTo(page, deck, notes);
    await expectCount(page, 'DECK', 27 - i);
  }
  const full = await deckCardWidth(page);
  await holdOver(page, deck, notes);
  const card = (await dragged(page).getAttribute('data-card'))!;
  expect((await dragged(page).boundingBox())!.width / full).toBeCloseTo(0.6, 2);
  await expect(page.locator('.drop-hint')).toHaveCount(0);
  await page.mouse.up();
  const el = page.locator(`.scene > [data-card="${card}"]`);
  await expect(el).not.toHaveClass(/dragging|pending/);
  await expect.poll(async () => (await el.boundingBox())!.width).toBeCloseTo(full, 1);

  // vom Browser abgebrochen (pointercancel)
  await holdOver(page, deck, { x: deck.x + 120, y: deck.y });
  await expect(dragged(page)).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true })));
  await expect(el).not.toHaveClass(/dragging|pending/);
  await expect.poll(async () => (await el.boundingBox())!.width).toBeCloseTo(full, 1);
  await page.mouse.up();
  await expectCount(page, 'DECK', 24);
});
