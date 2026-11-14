// Zähler für das Kartenbudget (Schritt 6a): Einschalten mit Wahl der Person (SL), Herunterzählen, harte Sperre des
// Decks bei 0 und nach ♣, Ändern mit Pfeilen und Mausrad, Ausschalten per Klick. Rechte: tests/rules/budget.test.ts.

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, openMenuAndClick, openSettings, ready, saveArchive, stackItem, zoneCenter } from './helpers';

const counter = (page: Page) => page.locator('[data-budget]');
const disc = (page: Page) => counter(page).locator('.disc');
const lock = (page: Page) => page.locator('[data-deck-lock]');

/** SL schaltet ein und wählt die Person */
async function start(page: Page, who = 'Spieler 1') {
  await disc(page).click();
  await counter(page).locator('[data-budget-choose]').getByRole('menuitem', { name: who }).click();
  await expect(counter(page)).toHaveAttribute('data-budget-active', 'true');
}

/** Das Deck ist gemischt und enthält ♣ Ass, das sperrt (gewollt). Damit das Herunterzählen nicht vom Zufall abhängt:
 *  ♣ Ass über eine gespeicherte Datei ganz nach unten legen. */
async function clubAceToBottom(page: Page) {
  const dialog = await openSettings(page, 'Spielstand');
  const saved = await saveArchive(page, dialog);
  const deck = saved.state.zones.deck as string[];
  saved.state.zones.deck = ['CA', ...deck.filter((c) => c !== 'CA')];
  await dialog.locator('input[type=file]').setInputFiles({ name: 'ohne-kreuz-oben.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(dialog.getByText(/vor dem Laden einer Datei/)).toBeVisible();
  await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => ready(page));

test('SL schaltet ein, wählt die Person; jede Karte vom Deck zählt herunter, bei 0 ist das Deck gesperrt', async ({ page }) => {
  await clubAceToBottom(page);
  await expect(counter(page)).toHaveAttribute('data-budget-active', 'false');
  await expect(lock(page)).toHaveCount(0);
  await start(page, 'Spieler 2');
  await expect(disc(page)).toHaveText('3');
  await expect(counter(page).locator('[data-budget-who]')).toHaveText('Spieler 2');

  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expect(disc(page)).toHaveText('2');
  await stackItem(page, 'Ziehen').click();
  await expect(disc(page)).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-stack-menu]')).toHaveCount(0);
  // per Maus auf die Ablage zählt genauso (erst nach der Frist für Doppelklicks greifen, wie in stackMenu.spec.ts)
  await page.waitForTimeout(400);
  await dragFromTo(page, await zoneCenter(page, 'DECK'), await zoneCenter(page, 'ABLAGE'));
  await expect(disc(page)).toHaveText('0');
  await expectCount(page, 'DECK', 24);
  await expect(lock(page)).toHaveCount(1);

  // gesperrt: Ziehen im Menü ausgegraut mit Grund, Karte per Maus springt zurück
  await page.waitForTimeout(400);
  const deck = await zoneCenter(page, 'DECK');
  await page.mouse.click(deck.x, deck.y);
  await expect(stackItem(page, 'Ziehen')).toHaveAttribute('aria-disabled', 'true');
  await expect(stackItem(page, 'Ziehen')).toHaveAttribute('title', 'Das Kartenbudget ist aufgebraucht.');
  await page.keyboard.press('Escape');
  await dragFromTo(page, deck, await zoneCenter(page, 'ABLAGE'));
  await expectCount(page, 'DECK', 24);
  await expectCount(page, 'ABLAGE', 3);
});

test('▲ und Mausrad erhöhen und heben die Sperre auf; Klick schaltet aus, das Budget der Aktion bleibt als Vorschlag', async ({ page }) => {
  await clubAceToBottom(page);
  await start(page);
  for (let i = 0; i < 3; i++) await openMenuAndClick(page, 'DECK', 'Ziehen').then(() => page.keyboard.press('Escape')).then(() => page.waitForTimeout(400));
  await expect(lock(page)).toHaveCount(1);
  await counter(page).getByRole('button', { name: 'Budget erhöhen' }).click();
  await expect(disc(page)).toHaveText('1');
  await expect(lock(page)).toHaveCount(0);
  // Mausrad am Zähler ändert das Budget, nicht den Zoom
  const zoom = await page.locator('.board').getAttribute('style');
  await disc(page).hover();
  await page.mouse.wheel(0, -100);
  await expect(disc(page)).toHaveText('2');
  expect(await page.locator('.board').getAttribute('style')).toBe(zoom);
  await page.mouse.wheel(0, 100);
  await expect(disc(page)).toHaveText('1');

  await disc(page).click();
  await expect(counter(page)).toHaveAttribute('data-budget-active', 'false');
  await expect(disc(page)).toHaveText('4');
});

test('♣ vom Deck sperrt trotz Restbudget', async ({ page }) => {
  // ein ♣ aus dem Kreuzvorrat oben aufs Deck legen
  await dragFromTo(page, await zoneCenter(page, 'KREUZ'), await zoneCenter(page, 'DECK'));
  await expectCount(page, 'DECK', 28);
  await start(page);
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expect(disc(page)).toHaveText('2');
  await expect(lock(page)).toHaveCount(1);
  await expect(stackItem(page, 'Ziehen')).toHaveAttribute('title', '♣ gezogen – weiter nur mit den Forschungsnotizen.');
});
