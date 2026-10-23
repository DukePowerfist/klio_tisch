// Tisch im lokalen Betrieb (Schritt 3a): Stapel, Ziehen und Ablegen, Ansichten, Speichern.

import { expect, test } from '@playwright/test';
import { dragFromTo, expectCount, holdOver, nameCharacter, openMenuAndClick, ready, setPlayers, shuffleBack, stackItem, zoneCenter } from './helpers';

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
  await shuffleBack(page, 1);
  await expectCount(page, 'LEICHT', 5);
});

test('Deck mischen nimmt die Ablage auf', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await stackItem(page, 'Ziehen').click();
  await expectCount(page, 'ABLAGE', 2);
  await shuffleBack(page, 2);
  await expectCount(page, 'ABLAGE', 0);
  await expectCount(page, 'DECK', 27);
});

test('Kreuz: „Umdrehen“ dreht die oberste Karte um, statt zu ziehen (F4)', async ({ page }) => {
  const faceUp = page.locator('[data-card] .inner:not(.down)');
  const before = await faceUp.count();
  await openMenuAndClick(page, 'KREUZ', 'Umdrehen');
  await expect(faceUp).toHaveCount(before + 1);
  await expectCount(page, 'KREUZ', 12);
  await expectCount(page, 'ABLAGE', 0);
  await expect(page.getByRole('status')).toHaveCount(0);
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

/** Der Browser bricht den Zeiger ab (Systemgeste, Handballen); `at` wie bei einem echten Abbruch oft 0/0 */
const cancelPointer = (page: import('@playwright/test').Page, at: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y })), at);

test('Abgebrochener Zug legt nichts ab, ein abgebrochener Druck öffnet kein Menü (5x)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const danger = await zoneCenter(page, 'GEFAHR');
  await holdOver(page, deck, danger);
  await cancelPointer(page, danger); // über einem gültigen Ziel: früher wurde die Karte dorthin gelegt
  await page.mouse.up();
  await expectCount(page, 'DECK', 27);
  await expectCount(page, 'GEFAHR', 0);
  // nur gedrückt, nicht bewegt: früher ein Klick (Stapelmenü)
  await page.mouse.move(deck.x, deck.y);
  await page.mouse.down();
  await cancelPointer(page, deck);
  await page.mouse.up();
  await expect(page.locator('[data-stack-menu]')).toHaveCount(0);
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
  // Esc wie 0; die Tooltips nennen die Tasten (5e)
  await page.keyboard.press('Escape');
  await expect.poll(async () => Math.round((await sheet1.boundingBox())!.width)).toBe(Math.round(before));
  await expect(page.locator('[data-dock=seat2]')).toHaveAttribute('title', /\(Taste 2\)$/);
  await expect(page.getByTitle('Zur Übersicht (Taste 0 oder Esc)')).toBeVisible();
});

test('Zuordnung der Bögen: Namensschild in der Draufsicht und am großen Bogen, Farbstreifen in der Rollenansicht, Dock in den Platzfarben (5b)', async ({ page }) => {
  const plate1 = page.locator('[data-plate=seat1]');
  await expect(plate1).toHaveText('Spieler 1');
  await expect(page.locator('[data-dock=seat1]')).toHaveText('1');
  // Charaktername steht im Namensfeld, nicht auf dem Schild; lokal sitzt niemand am Platz, aber kein „frei“
  await nameCharacter(page, 'seat1', 'Ida');
  await expect(plate1).toHaveText('Spieler 1');
  await expect(plate1).toHaveAttribute('title', 'Ida – Menü zu diesem Platz');
  await expect(page.locator('[data-dock=seat1]')).toHaveAttribute('title', 'Ich bin Spieler 1: Ida (Taste 1)');
  // Schild und Dock-Knöpfe tragen die Farbe des Platzes; jeder Knopf eine andere
  const color = (sel: string, prop: string) => page.locator(sel).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  expect(await color('[data-plate=seat1]', 'background-color')).not.toBe(await color('[data-plate=seat2]', 'background-color'));
  const docks = await Promise.all(['seat1', 'seat2', 'seat3', 'seat4'].map((s) => color(`[data-dock=${s}]`, 'border-top-color')));
  expect(new Set(docks).size).toBe(4);

  // Rollenansicht: Schild nur auf dem großen Bogen (seit 5j, 10.1), die anderen mit Farbstreifen
  await page.keyboard.press('1');
  await expect(page.locator('.plate')).toHaveCount(1);
  await expect(page.locator('[data-sheet=seat1] .plate')).toHaveCount(1);
  await expect(page.locator('[data-sheet=seat1] .strip')).toHaveCount(0);
  await expect(page.locator('.strip')).toHaveCount(3);
  expect(await color('[data-strip=seat2]', 'background-color')).toBe('rgb(90, 176, 232)');

  // ausgeblendete Plätze: kein Schild, kein Dock-Knopf
  await page.keyboard.press('0');
  await setPlayers(page, 3);
  await expect(page.locator('[data-plate=seat4]')).toHaveCount(0);
  await expect(page.locator('[data-dock=seat4]')).toHaveCount(0);
});

test('Namensschild ist bei 4 Spielern und Zoom 1 im Stream lesbar (mindestens 12 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 950 });
  const b = page.locator('[data-plate=seat1] b');
  await expect(b).toBeVisible();
  // Zeilenhöhe 1,5 → Schriftgröße auf dem Bildschirm
  await expect.poll(async () => (await b.boundingBox())!.height / 1.5).toBeGreaterThanOrEqual(12);
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
