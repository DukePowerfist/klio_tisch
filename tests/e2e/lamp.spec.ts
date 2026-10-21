// Laterne (Schritt 5n, ARCHITEKTUR.md 11.9): Lage, Anzünden und Löschen für alle, Bedienung des Tisches bleibt.

import { expect, test, type Page } from '@playwright/test';
import { fromMenu, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const lamp = (page: Page) => page.locator('[data-lamp]');
/** Mitte der Laterne relativ zum Deck, in Deckbreiten (unabhängig von Ansicht, Zoom und Fenster) */
async function nearDeck(page: Page) {
  const d = (await zoneCenter(page, 'DECK')).box;
  const l = (await lamp(page).boundingBox())!;
  return { x: (l.x + l.width / 2 - d.x) / d.width, y: (l.y + l.height / 2 - d.y) / d.width };
}

test('Laterne oben mittig im Filz, in beiden Ansichten an derselben Stelle der Tischmitte', async ({ page }) => {
  const over = await nearDeck(page);
  await page.keyboard.press('3');
  await page.waitForTimeout(200);
  const role = await nearDeck(page);
  expect(role.x).toBeCloseTo(over.x, 2);
  expect(role.y).toBeCloseTo(over.y, 2);
  // Mitte der Laterne (350, 60) und Deck (182, 430) in der Tischmitte, Deck 80 breit
  expect(over.x).toBeCloseTo((350 - 182) / 80, 1);
  expect(over.y).toBeCloseTo((60 - 430) / 80, 1);
});

test('SL löscht und zündet an: Protokoll, Stand bleibt nach dem Neuladen, Tisch verschiebt und zoomt nicht', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  const log = page.getByRole('list', { name: 'Protokoll' });
  const button = page.getByRole('button', { name: 'Laterne löschen' });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const board = async () => (await page.locator('.board').boundingBox())!;
  const before = await board();
  await button.click();
  await expect(lamp(page)).toHaveAttribute('data-lit', 'false');
  await expect(log.locator('li', { hasText: 'Die Spielleitung hat die Laterne gelöscht.' })).toHaveCount(1);
  expect(await board()).toEqual(before);
  await ready(page, true);
  await expect(lamp(page)).toHaveAttribute('data-lit', 'false');
  await page.getByRole('button', { name: 'Laterne anzünden' }).click();
  await expect(lamp(page)).toHaveAttribute('data-lit', 'true');
});

test('Doppelklick auf die Laterne schaltet genau einmal und zoomt nicht', async ({ page }) => {
  const board = async () => (await page.locator('.board').boundingBox())!;
  const before = await board();
  await lamp(page).dblclick();
  await expect(lamp(page)).toHaveAttribute('data-lit', 'false');
  await page.waitForTimeout(300);
  await expect(lamp(page)).toHaveAttribute('data-lit', 'false');
  expect(await board()).toEqual(before);
  await page.getByRole('button', { name: 'Laterne anzünden' }).click();
});

test('Licht liegt über dem Tisch, nimmt aber keine Zeigereingaben an; Stapelmenü und SL-Leiste liegen darüber', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.light') !== null, deck);
  expect(hit, 'das Licht fängt keine Klicks').toBe(false);
  const z = (sel: string) => page.locator(sel).first().evaluate((e) => Number(getComputedStyle(e).zIndex));
  expect(await z('.light > .on')).toBe(450001);
  expect(await z('.ctl')).toBeGreaterThan(450002);
});
