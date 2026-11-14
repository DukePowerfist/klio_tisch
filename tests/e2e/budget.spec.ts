// Zähler für das Kartenbudget (Schritt 6a): Einschalten mit Wahl der Person (SL), Herunterzählen, harte Sperre des
// Decks bei 0 und nach ♣, Ändern mit Pfeilen und Mausrad, Ausschalten per Klick. Rechte: tests/rules/budget.test.ts.

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, openMenuAndClick, openSettings, ready, saveArchive, stackItem, zoneCenter } from './helpers';

const counter = (page: Page) => page.locator('[data-budget]');
const disc = (page: Page) => counter(page).locator('.disc');
const lock = (page: Page) => page.locator('[data-deck-lock]');

/** SL schaltet ein, wählt die Person und zählt das Budget hoch (jede Aktion beginnt bei 0) */
async function start(page: Page, who = 'Spieler 1', budget = 3) {
  await disc(page).click();
  await counter(page).locator('[data-budget-choose]').getByRole('menuitem', { name: who }).click();
  await expect(counter(page)).toHaveAttribute('data-budget-active', 'true');
  for (let i = 0; i < budget; i++) await counter(page).getByRole('button', { name: 'Budget erhöhen' }).click();
  await expect(disc(page)).toHaveText(String(budget));
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

test('▲ und Mausrad erhöhen und heben die Sperre auf; Klick schaltet aus', async ({ page }) => {
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
  await expect(disc(page)).toHaveText('–');
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

// ---------- Teil 2: Vorteil, Nachteil, Notizen ----------

const mod = (page: Page, key: 'advantage' | 'disadvantage') => counter(page).locator(`[data-budget-mod=${key}]`);
const notesMark = (page: Page) => page.locator('[data-notes-mark]');

test('N sperrt die Notizen der handelnden Person (Schloss), V und N zusammen heben sich auf', async ({ page }) => {
  const notes = await zoneCenter(page, 'NOTIZEN');
  await dragFromTo(page, await zoneCenter(page, 'DECK'), notes);
  await expectCount(page, 'DECK', 26);
  await start(page);
  await expect(mod(page, 'advantage')).toHaveAttribute('aria-pressed', 'false');
  await mod(page, 'disadvantage').click();
  await expect(mod(page, 'disadvantage')).toHaveAttribute('aria-pressed', 'true');
  await expect(notesMark(page)).toHaveAttribute('data-notes-mark', 'locked');
  await expect(disc(page)).toHaveAttribute('title', /Mit Nachteil/);
  // gesperrt: die Notiz springt beim Ablegen auf die Ablage zurück
  await page.waitForTimeout(400);
  await dragFromTo(page, notes, await zoneCenter(page, 'ABLAGE'));
  await expectCount(page, 'ABLAGE', 0);

  await mod(page, 'advantage').click();
  await expect(notesMark(page)).toHaveCount(0);
  await expect(disc(page)).toHaveAttribute('title', /heben sich auf/);
  await mod(page, 'disadvantage').click();
  await mod(page, 'advantage').click();
  await expect(mod(page, 'advantage')).toHaveAttribute('aria-pressed', 'false');
});

test('nach ♣ leuchten die Notizen; mit Vorteil sperrt ♣ nicht', async ({ page }) => {
  await dragFromTo(page, await zoneCenter(page, 'DECK'), await zoneCenter(page, 'NOTIZEN'));
  await expectCount(page, 'DECK', 26);
  for (let i = 0; i < 2; i++) await dragFromTo(page, await zoneCenter(page, 'KREUZ'), await zoneCenter(page, 'DECK'));
  await expectCount(page, 'DECK', 28);
  await start(page);
  await mod(page, 'advantage').click();
  await expect(mod(page, 'advantage')).toHaveAttribute('aria-pressed', 'true');
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expect(disc(page)).toHaveText('2');
  await expect(lock(page)).toHaveCount(0);
  await expect(notesMark(page)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await mod(page, 'advantage').click();
  await expect(lock(page)).toHaveCount(1);
  await expect(notesMark(page)).toHaveAttribute('data-notes-mark', 'glow');
});

test('jede Aktion beginnt bei 0: noch nicht eingestellt, Deck gesperrt, nicht rot, Notizen leuchten nicht', async ({ page }) => {
  await dragFromTo(page, await zoneCenter(page, 'DECK'), await zoneCenter(page, 'NOTIZEN'));
  await expectCount(page, 'DECK', 26);
  await expect(disc(page)).toHaveText('–');
  await start(page, 'Spieler 1', 0);
  await expect(disc(page)).toHaveClass(/unset/);
  await expect(disc(page)).not.toHaveClass(/blocked/);
  await expect(disc(page)).toHaveAttribute('title', /Erst das Budget einstellen.*eine einzige Karte mit Nachteil/s);
  await expect(lock(page)).toHaveCount(1);
  await expect(notesMark(page)).toHaveCount(0);
  await page.waitForTimeout(400);
  const deck = await zoneCenter(page, 'DECK');
  await page.mouse.click(deck.x, deck.y);
  await expect(stackItem(page, 'Ziehen')).toHaveAttribute('aria-disabled', 'true');
  await expect(stackItem(page, 'Ziehen')).toHaveAttribute('title', 'Erst das Kartenbudget einstellen.');
  await page.keyboard.press('Escape');
  await counter(page).getByRole('button', { name: 'Budget erhöhen' }).click();
  await expect(disc(page)).not.toHaveClass(/unset/);
  await expect(lock(page)).toHaveCount(0);
});
