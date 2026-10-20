// Tisch im lokalen Betrieb (Schritt 3a): Stapel, Ziehen und Ablegen, Ansichten, Speichern.

import { expect, test } from '@playwright/test';
import { dragFromTo, expectCount, openMenuAndClick, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

test('Deck ziehen: Karte offen auf die Ablage, Meldung mit Kartenname', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expect(page.getByRole('status')).toHaveText(/^Aufgedeckt: (Herz|Pik|Kreuz) (\d+|B|D|K|A)$/);
  await expectCount(page, 'ABLAGE', 1);
  await expectCount(page, 'DECK', 26);
});

test('Karo ziehen: offen in die Auslage; Karo mischen holt sie zurück', async ({ page }) => {
  await openMenuAndClick(page, 'LEICHT', 'Ziehen');
  await expect(page.getByRole('status')).toHaveText(/^Ausliegend: Karo [2-6]$/);
  await expectCount(page, 'LEICHT', 4);
  await page.getByRole('button', { name: 'Mischen', exact: true }).click();
  await expectCount(page, 'LEICHT', 5);
});

test('Deck mischen nimmt die Ablage auf', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await expectCount(page, 'ABLAGE', 2);
  await page.getByRole('button', { name: 'Mischen', exact: true }).click();
  await expectCount(page, 'ABLAGE', 0);
  await expectCount(page, 'DECK', 27);
});

test('Kreuz: „Umdrehen“ wirkt wie Ziehen', async ({ page }) => {
  await openMenuAndClick(page, 'KREUZ', 'Umdrehen');
  await expect(page.getByRole('status')).toHaveText(/^Aufgedeckt: Kreuz/);
  await expectCount(page, 'KREUZ', 11);
});

test('Karte in die Gefahr ziehen, dann frei auf den Tisch, Stand bleibt nach Neuladen', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const danger = await zoneCenter(page, 'GEFAHR');
  await dragFromTo(page, deck, danger);
  await expectCount(page, 'GEFAHR', 1);
  await dragFromTo(page, deck, { x: deck.x + 300, y: deck.y + 120 });
  await expectCount(page, 'DECK', 25);
  await ready(page, true);
  await expectCount(page, 'GEFAHR', 1);
  await expectCount(page, 'DECK', 25);
  await expect(page.locator('[data-card]')).toHaveCount(52);
});

test('Notizen fassen höchstens drei Karten', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const notes = await zoneCenter(page, 'NOTIZEN');
  for (let i = 1; i <= 3; i++) {
    await dragFromTo(page, deck, notes);
    await expectCount(page, 'DECK', 27 - i);
  }
  await dragFromTo(page, deck, notes);
  await expect(page.getByRole('status')).toHaveText('Bei den Notizen haben nur drei Karten Platz.');
  await expectCount(page, 'DECK', 24);
});

test('Doppelklick dreht die oberste Karte um', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  await page.mouse.dblclick(deck.x, deck.y);
  await expect(page.locator('[data-card] .inner:not(.down)')).toHaveCount(1);
});

test('Ansichten: Taste 1 → Rollenansicht, 0 → Draufsicht; Dock', async ({ page }) => {
  const sheet1 = page.locator('[data-sheet=seat1]');
  const before = (await sheet1.boundingBox())!.width;
  await page.keyboard.press('1');
  await expect.poll(async () => (await sheet1.boundingBox())!.width).toBeGreaterThan(before * 1.5);
  await page.keyboard.press('0');
  await expect.poll(async () => Math.round((await sheet1.boundingBox())!.width)).toBe(Math.round(before));
  await page.getByTitle('Ich bin Spieler 2').click();
  await expect.poll(async () => (await page.locator('[data-sheet=seat2]').boundingBox())!.x).toBeLessThan(50);
});

test('Mausrad zoomt, Übersicht setzt zurück', async ({ page }) => {
  const board = page.locator('.board');
  const w0 = (await board.boundingBox())!.width;
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, -600);
  await expect.poll(async () => (await board.boundingBox())!.width).toBeGreaterThan(w0 * 1.5);
  await page.keyboard.press('Escape');
  await expect.poll(async () => Math.round((await board.boundingBox())!.width)).toBe(Math.round(w0));
});
