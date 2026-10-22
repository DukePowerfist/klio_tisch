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
