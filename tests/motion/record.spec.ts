// Videos der Kartenanimationen (Schritt 5g): je Ablauf ein Video, mit Pausen, damit man jede Bewegung sieht.

import { test } from '@playwright/test';
import { dragFromTo, expectCount, openMenuAndClick, ready, resetTable, zoneCenter } from '../e2e/helpers';

const pause = (ms = 900) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(async ({ page }) => {
  await ready(page);
  await pause();
});

test('Ziehen und Umklappen', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await pause();
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await pause();
  const discard = await zoneCenter(page, 'ABLAGE');
  await page.mouse.dblclick(discard.x, discard.y);
  await pause(1500);
});

test('Gleiten: Zone, frei auf den Tisch, zurück', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const danger = await zoneCenter(page, 'GEFAHR');
  await dragFromTo(page, deck, danger);
  await pause();
  await dragFromTo(page, deck, { x: deck.x + 300, y: deck.y + 120 });
  await pause();
  await dragFromTo(page, { x: deck.x + 310, y: deck.y + 125 }, danger);
  await pause(1500);
});

test('Mischen mit Einsammeln', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await expectCount(page, 'ABLAGE', 3);
  await pause();
  await page.getByRole('button', { name: 'Mischen', exact: true }).click();
  await pause(1500);
});

test('Zurücksetzen', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await page.keyboard.press('Escape');
  await openMenuAndClick(page, 'LEICHT', 'Ziehen');
  await page.keyboard.press('Escape');
  await pause();
  await resetTable(page);
  await pause(1500);
});

test('Ansichtswechsel', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await page.keyboard.press('Escape');
  await pause();
  await page.keyboard.press('1');
  await pause(1200);
  await page.keyboard.press('0');
  await pause(1500);
});
