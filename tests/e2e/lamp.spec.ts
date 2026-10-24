// Laterne (Schritt 5n, ARCHITEKTUR.md 11.9): Lage, Anzünden und Löschen für alle, Bedienung des Tisches bleibt.

import { expect, test, type Page } from '@playwright/test';
import { fromMenu, holdOver, openSettings, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const lamp = (page: Page) => page.locator('[data-lamp]');
/** Mitte der Laterne relativ zum Deck, in Deckbreiten (unabhängig von Ansicht, Zoom und Fenster) */
async function nearDeck(page: Page) {
  const d = (await zoneCenter(page, 'DECK')).box;
  const l = (await lamp(page).boundingBox())!;
  return { x: (l.x + l.width / 2 - d.x) / d.width, y: (l.y + l.height / 2 - d.y) / d.width };
}

test('Laterne links neben dem Zielwert, in beiden Ansichten an derselben Stelle der Tischmitte', async ({ page }) => {
  const over = await nearDeck(page);
  await page.keyboard.press('3');
  await page.waitForTimeout(200);
  const role = await nearDeck(page);
  expect(role.x).toBeCloseTo(over.x, 2);
  expect(role.y).toBeCloseTo(over.y, 2);
  expect(over.x).toBeCloseTo((120 - 208) / 80, 1);
  expect(over.y).toBeCloseTo((354 - 484) / 80, 1);
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

test('Licht liegt über dem Tisch, nimmt aber keine Zeigereingaben an; Blatt und Schachtel liegen darunter (5zb)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.light') !== null, deck);
  expect(hit, 'das Licht fängt keine Klicks').toBe(false);
  const z = (sel: string) => page.locator(sel).first().evaluate((e) => Number(getComputedStyle(e).zIndex));
  expect(await z('.light > .on')).toBe(450001);
  // Gegenstände auf dem Tisch werden mit abgedunkelt (10.12): über den Zonen, unter frei liegenden Karten und dem Licht
  expect(await z('[data-expedition-sheet]')).toBeLessThan(450000);
  expect(await z('[data-oracle-box]')).toBeLessThan(450000);
});

test('Karte auf die Laterne gezogen: Vorschau und Ablage daneben, nicht auf ihr (F3)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const l = (await lamp(page).boundingBox())!;
  const centre = { x: l.x + l.width / 2, y: l.y + l.height / 2 };
  await holdOver(page, deck, centre);
  const hint = page.locator('.drop-hint');
  await expect(hint).toHaveCount(1);
  const shown = (await hint.boundingBox())!;
  const dragged = await page.locator('.card.dragging').getAttribute('data-card');
  await page.mouse.up();
  await expect(hint).toHaveCount(0);
  // getBoundingClientRect statt boundingBox: Playwright misst die gedrehte Karte ungedreht
  const rect = () => page.locator(`.scene > [data-card="${dragged}"]`).evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  const round = (r: { x: number; y: number; width: number; height: number }) => [r.x, r.y, r.width, r.height].map(Math.round);
  // nach dem Loslassen kommt die neue Lage erst mit der Antwort des Hosts: so lange warten, nicht sofort messen
  await expect.poll(async () => round(await rect())).toEqual(round(shown));
  const card = await rect();
  // Abstand der Karte zum Kreis der Laterne (Bildschirmpunkte)
  const dx = Math.max(card.x - centre.x, 0, centre.x - (card.x + card.width));
  const dy = Math.max(card.y - centre.y, 0, centre.y - (card.y + card.height));
  expect(Math.hypot(dx, dy)).toBeGreaterThan(l.width / 2);
});

test('Schalter „Laterne flackert“ nur bei „Voll“, voreingestellt aus, bleibt nach dem Neuladen', async ({ page }) => {
  const dialog = await openSettings(page, 'Darstellung');
  const flicker = dialog.getByRole('switch', { name: 'Laterne flackert' });
  await expect(flicker).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Effekte' }).selectOption('full');
  await expect(flicker).not.toBeChecked();
  await expect(dialog).toContainText('Kann auf Rechnern ohne Grafikbeschleunigung ruckeln.');
  await flicker.check();
  await ready(page, true);
  await openSettings(page, 'Darstellung');
  await expect(flicker).toBeChecked();
  // auf „Ruhig“ verschwindet die Zeile, die Wahl bleibt
  await dialog.getByRole('combobox', { name: 'Effekte' }).selectOption('calm');
  await expect(flicker).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Effekte' }).selectOption('full');
  await expect(flicker).toBeChecked();
});
