// Gemeinsame Tischmitte (Schritt 5d, ARCHITEKTUR.md 10): Abnahme in der Oberfläche.

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, fromMenu, openSettings, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

type Box = { x: number; y: number; width: number; height: number };
const free = (page: Page) => page.locator('[data-card][style*="rotate(90deg)"]');
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
/** Lage der frei liegenden Karte relativ zum Deck, in Deckbreiten (unabhängig von Zoom und Fenster) */
async function nearDeck(page: Page) {
  const d = (await zoneCenter(page, 'DECK')).box;
  const c = (await free(page).boundingBox())!;
  return { x: (c.x - d.x) / d.width, y: (c.y - d.y) / d.width };
}
const inside = (c: Box, r: Box, tol = 1) =>
  c.x >= r.x - tol && c.y >= r.y - tol && c.x + c.width <= r.x + r.width + tol && c.y + c.height <= r.y + r.height + tol;
/** Ansicht gleitet nicht (reducedMotion), aber der Zoom passt sich nach dem Wechsel an */
const settled = (page: Page) => page.waitForTimeout(200);

test('Frei liegende Karte zwischen den Stapeln liegt in beiden Ansichten und bei jedem Zoom gleich zu ihnen', async ({ page }) => {
  // zwischen Deck und Gefahr, links unter dem Deck
  const deck = await zoneCenter(page, 'DECK');
  await dragFromTo(page, deck, { x: deck.x - 90, y: deck.y + 95 });
  await expectCount(page, 'DECK', 26);
  const over = await nearDeck(page);

  await page.keyboard.press('2');
  await settled(page);
  const role = await nearDeck(page);
  expect(role.x).toBeCloseTo(over.x, 2);
  expect(role.y).toBeCloseTo(over.y, 2);

  // hineinzoomen über der Tischmitte
  const d = await zoneCenter(page, 'DECK');
  await page.mouse.move(d.x, d.y);
  await page.mouse.wheel(0, -400);
  await settled(page);
  expect((await zoneCenter(page, 'DECK')).box.width).toBeGreaterThan(d.box.width * 1.3);
  const zoomed = await nearDeck(page);
  expect(zoomed.x).toBeCloseTo(over.x, 2);
  expect(zoomed.y).toBeCloseTo(over.y, 2);
});

test('Draufsicht: zwischen Bogen und Tischmitte abgelegt liegt die Karte ganz in der Tischmitte an ihrem Rand', async ({ page }) => {
  const panel = await box(page, '.panel');
  const deck = await zoneCenter(page, 'DECK');
  await dragFromTo(page, deck, { x: panel.x - 20, y: deck.y });
  await expectCount(page, 'DECK', 26);
  const c = (await free(page).boundingBox())!;
  expect(inside(c, panel)).toBe(true);
  expect(c.x).toBeCloseTo(panel.x, 0);
  // in der Rollenansicht ebenso am linken Rand
  await page.keyboard.press('2');
  await settled(page);
  const p2 = await box(page, '.panel');
  const c2 = (await free(page).boundingBox())!;
  expect(inside(c2, p2)).toBe(true);
  expect(c2.x).toBeCloseTo(p2.x, 0);
});

test('Rollenansicht: in der Lücke neben den kleinen Bögen abgelegt liegt die Karte ganz in der Tischmitte am rechten Rand', async ({ page }) => {
  await page.keyboard.press('2');
  await settled(page);
  const panel = await box(page, '.panel');
  const small = await box(page, '[data-sheet=seat1]');
  expect(small.x).toBeGreaterThan(panel.x + panel.width); // Spalte rechts der Tischmitte
  const deck = await zoneCenter(page, 'DECK');
  await dragFromTo(page, deck, { x: small.x - 4, y: deck.y });
  await expectCount(page, 'DECK', 26);
  const c = (await free(page).boundingBox())!;
  expect(inside(c, panel)).toBe(true);
  expect(c.x + c.width).toBeCloseTo(panel.x + panel.width, 0);
  // in der Draufsicht ebenso, nicht über dem Bogen von Spieler 2
  await page.keyboard.press('0');
  await settled(page);
  const p0 = await box(page, '.panel');
  const c0 = (await free(page).boundingBox())!;
  expect(inside(c0, p0)).toBe(true);
  expect(c0.x + c0.width).toBeCloseTo(p0.x + p0.width, 0);
});

test('Rollenansicht: kein Bogen unter dem Menüknopf, bei 2 bis 4 Spielern, mit und ohne Protokoll, ab 700 Höhe', async ({ page }) => {
  const menu = page.getByRole('button', { name: 'Menü' });
  const apart = (a: Box, b: Box) => a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y;
  for (const height of [700, 900]) {
    await page.setViewportSize({ width: 1600, height });
    for (const log of [false, true]) {
      if (log) await fromMenu(page, 'Protokoll');
      for (const players of ['2', '3', '4']) {
        await page.keyboard.press('0');
        await page.getByRole('combobox').selectOption(players);
        await page.keyboard.press('1');
        await settled(page);
        const m = (await menu.boundingBox())!;
        const sheets = await page.locator('[data-sheet]').all();
        expect(sheets.length).toBe(Number(players));
        for (const s of sheets) {
          const b = (await s.boundingBox())!;
          expect(apart(m, b), `${players} Spieler, Höhe ${height}, Protokoll ${log}: ${await s.getAttribute('data-sheet')}`).toBe(true);
        }
      }
      if (log) await page.locator('aside.log').getByRole('button', { name: 'Schließen' }).click();
    }
  }
});

test('Alter Spielstand (Format 1) aus einer Datei: frei liegende Karte liegt wie vorher zum Deck; neueres Format abgelehnt', async ({ page }) => {
  // eine Karte frei in die Tischmitte, dann speichern
  const deck = await zoneCenter(page, 'DECK');
  await dragFromTo(page, deck, { x: deck.x + 150, y: deck.y - 120 });
  await expectCount(page, 'DECK', 26);
  const dialog = await openSettings(page, 'Spielstand');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Als Datei speichern' }).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const [card] = saved.state.free as string[];

  // so, wie es eine alte Fassung gespeichert hätte: alter Spielbereich der Draufsicht (4 Spieler: x 372, Breite 1016),
  // Stapel 48 weiter rechts als heute. Karte 100 rechts von der linken Kante des Decks (heute Tisch-x 712, damals 760).
  const old = structuredClone(saved);
  old.state.format = 1;
  old.state.freePos[card!] = { anchor: 'center', x: (760 + 100 - 372) / 1016, y: (430 + 10 - 10) / 970 };
  const input = dialog.locator('input[type=file]');
  await input.setInputFiles({ name: 'alt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await expect(dialog.getByText(/vor dem Laden einer Datei/)).toBeVisible();
  await page.keyboard.press('Escape');
  const d = (await zoneCenter(page, 'DECK')).box;
  const c = (await free(page).boundingBox())!;
  const unit = d.width / 80; // Tischpunkt in Bildschirmpunkten
  expect((c.x - d.x) / unit).toBeCloseTo(100, 0);
  expect((c.y - d.y) / unit).toBeCloseTo(0, 0);

  const newer = structuredClone(saved);
  newer.state.format = 99;
  await fromMenu(page, 'Einstellungen');
  await input.setInputFiles({ name: 'neu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await expect(dialog.getByText('Diese Datei stammt aus einer neueren Fassung des Kartentischs. Bitte die Seite neu laden.')).toBeVisible();
  // der Stand bleibt unverändert
  expect((await free(page).boundingBox())!.x).toBeCloseTo(c.x, 0);
});
