// Stapelmenü (Schritt 5o, ARCHITEKTUR.md 10.2): Lage am Stapel, gleicher Aufbau, Ausgrauen, Schließen.

import { expect, test, type Page } from '@playwright/test';
import { box, dragFromTo, expectCount, expectInStage, fromMenu, openMenuAndClick, ready, setPlayersByKeyboard, stackItem, zoneCenter, type Box } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

const menu = (page: Page) => page.locator('[data-stack-menu]');
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const STACKS = [
  { label: 'DECK', zone: 'deck', target: 'discard', side: 'left' },
  { label: 'LEICHT', zone: 'diamonds_easy', target: 'display', side: 'left' },
  { label: 'MITTEL', zone: 'diamonds_medium', target: 'display', side: 'right' },
  { label: 'SCHWIERIG', zone: 'diamonds_hard', target: 'display', side: 'right' },
  { label: 'KREUZ', zone: 'clubs', target: 'discard', side: 'right' },
] as const;

/** Stapel per Klick öffnen; liefert die Rechtecke von Menü, Stapel (im Endmaß) und Ziel. Erst kurz warten: zwei
 *  Klicks auf dieselbe Karte binnen 350 ms sind ein Doppelklick und drehen sie um, statt das Menü zu öffnen */
async function open(page: Page, s: (typeof STACKS)[number]) {
  await page.waitForTimeout(400);
  const z = await zoneCenter(page, s.label);
  await page.mouse.click(z.x, z.y);
  await expect(menu(page)).toBeVisible();
  return { m: (await menu(page).boundingBox())!, stack: await box(page.locator(`[data-zone=${s.zone}]`)), target: await box(page.locator(`[data-zone=${s.target}]`)) };
}

/** Menü liegt im sichtbaren Bereich (ohne offenes Protokoll, mit 8 px Rand) und frei von Dock und Menüknopf */
async function expectUsable(page: Page, m: Box, label: string) {
  await expectInStage(page, m, label);
  for (const b of await page.locator('[data-menu-avoid]').all()) expect(overlaps(m, (await b.boundingBox())!), label).toBe(false);
}

for (const role of [null, '1'] as const) {
  test(`${role ? 'Rollenansicht' : 'Übersicht'}: Menü an jedem Stapel auf der bevorzugten Seite, oben bündig, Stapel und Ziel frei`, async ({ page }) => {
    if (role) await page.keyboard.press(role);
    for (const s of STACKS) {
      const { m, stack, target } = await open(page, s);
      await expectUsable(page, m, s.label);
      expect(s.side === 'left' ? m.x + m.width <= stack.x : m.x >= stack.x + stack.width, s.label).toBe(true);
      expect(m.y, s.label).toBeCloseTo(stack.y, 0);
      expect(overlaps(m, stack), s.label).toBe(false);
      expect(overlaps(m, target), s.label).toBe(false);
      await page.keyboard.press('Escape');
      await expect(menu(page)).toHaveCount(0);
    }
  });
}

test('gleicher Aufbau an jedem Stapel: Kopf mit Name und Zahl, Ziehen, Umdrehen, Mischen', async ({ page }) => {
  for (const s of STACKS) {
    await open(page, s);
    await expect(menu(page).locator('.menu-head span').first()).toHaveText(new RegExp(`^${s.label}`));
    await expect(menu(page).locator('.menu-head .count')).toHaveText(/^\d+$/);
    await expect(menu(page).getByRole('menuitem')).toHaveText(['Ziehen', 'Umdrehen', 'Mischen']);
    await expect(menu(page).locator('.menu-main')).toHaveText('Ziehen');
    await page.keyboard.press('Escape');
  }
});

test('Schrift bleibt beim Hineinzoomen gleich groß, das Menü liegt über den Karten', async ({ page }) => {
  await open(page, STACKS[0]);
  const at1 = (await stackItem(page, 'Umdrehen').boundingBox())!;
  await page.keyboard.press('Escape');
  // hineinzoomen am Rand, damit das Deck sichtbar bleibt
  const deck = await zoneCenter(page, 'DECK');
  await page.mouse.move(deck.x, deck.y);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await box(page.locator('[data-zone=deck]'))).width).toBeGreaterThan(deck.box.width * 1.3);
  await page.waitForTimeout(400);
  const zoomed = await zoneCenter(page, 'DECK');
  await page.mouse.click(zoomed.x, zoomed.y);
  const at2 = (await stackItem(page, 'Umdrehen').boundingBox())!;
  expect(at2.height).toBeCloseTo(at1.height, 1);
  expect(at2.width).toBeCloseTo(at1.width, 1);
  // oberstes Element an der Stelle des Eintrags ist der Eintrag selbst (über Licht und Karten)
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.textContent, [at2.x + 20, at2.y + at2.height / 2]);
  expect(hit).toBe('Umdrehen');
});

test('kleines Fenster mit offenem Protokoll: Menü vollständig sichtbar, an jedem Stapel', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await fromMenu(page, 'Protokoll');
  await expect(page.locator('aside.log')).toBeVisible();
  for (const s of STACKS) {
    const { m } = await open(page, s);
    await expectUsable(page, m, s.label);
    expect(m.x + m.width, s.label).toBeLessThanOrEqual(1024 - 300);
    await page.keyboard.press('Escape');
  }
});

test('letzte Karte ziehen: Ziehen und Umdrehen werden ausgegraut mit Grund, Menü bleibt offen', async ({ page }) => {
  await openMenuAndClick(page, 'LEICHT', 'Ziehen');
  for (let i = 0; i < 4; i++) await stackItem(page, 'Ziehen').click();
  await expect(menu(page).locator('.count')).toHaveText('0');
  for (const a of ['Ziehen', 'Umdrehen'] as const) {
    await expect(stackItem(page, a)).toHaveAttribute('aria-disabled', 'true');
    await expect(stackItem(page, a)).toHaveAttribute('title', 'Stapel leer');
  }
  // Mischen holt die Karo aus der Auslage zurück und bleibt möglich
  await expect(stackItem(page, 'Mischen')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(stackItem(page, 'Mischen')).toHaveAttribute('title', /holt 5 Karten aus der Auslage zurück/);
  // ausgegraut: ein Klick tut nichts, der Eintrag bleibt fokussierbar (force: Playwright klickt sonst nicht auf aria-disabled)
  await stackItem(page, 'Ziehen').click({ force: true });
  await expect(stackItem(page, 'Ziehen')).toBeFocused();
  await expect(menu(page).locator('.count')).toHaveText('0');
  await stackItem(page, 'Mischen').click();
  await expect(menu(page).locator('.count')).toHaveText('5');
  await expect(stackItem(page, 'Ziehen')).not.toHaveAttribute('aria-disabled', 'true');
});

test('Esc schließt nur das Menü, die Rollenansicht bleibt', async ({ page }) => {
  await page.keyboard.press('1');
  await open(page, STACKS[0]);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('klio.view.role'))).toBe('seat1');
  // ohne Menü verlässt Esc die Rollenansicht wie bisher
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('klio.view.role'))).toBeNull();
});

test('Klick daneben, Verschieben, Mausrad, Zoomgeste und Fenstergröße schließen; ein Klick auf den Stapel öffnet wieder', async ({ page }) => {
  const felt = await box(page.locator('.panel'));
  const empty = { x: felt.x + felt.width * 0.75, y: felt.y + felt.height * 0.3 };
  // Klick daneben
  await open(page, STACKS[0]);
  await page.mouse.click(empty.x, empty.y);
  await expect(menu(page)).toHaveCount(0);
  // Verschieben mit der Maus beginnt mit einem Druck daneben
  await open(page, STACKS[0]);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await expect(menu(page)).toHaveCount(0);
  await page.mouse.move(empty.x + 40, empty.y + 20, { steps: 4 });
  await page.mouse.up();
  // Mausrad zoomt: der Stapel steht woanders (N4)
  await open(page, STACKS[0]);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.wheel(0, -200);
  await expect(menu(page)).toHaveCount(0);
  await page.evaluate(() => (document.querySelector('.stage') as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  // Zoomgeste mit zwei Fingern: beginnt mit Berührungen daneben
  await page.waitForTimeout(500);
  await open(page, STACKS[0]);
  await page.evaluate(([x, y]) => {
    const stage = document.querySelector('.stage')!;
    for (const [id, dx] of [[1, 0], [2, 80]] as const)
      stage.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x! + dx, clientY: y!, bubbles: true }));
    for (const id of [1, 2]) window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', bubbles: true }));
  }, [empty.x, empty.y]);
  await expect(menu(page)).toHaveCount(0);
  // Fenstergröße
  await open(page, STACKS[0]);
  await page.setViewportSize({ width: 1500, height: 860 });
  await expect(menu(page)).toHaveCount(0);
  // ein einfacher Klick auf den Stapel öffnet weiter, ein zweiter schließt
  await open(page, STACKS[0]);
  await page.waitForTimeout(400);
  const deck = await zoneCenter(page, 'DECK');
  await page.mouse.click(deck.x, deck.y);
  await expect(menu(page)).toHaveCount(0);
});

test('Klick auf einen anderen Stapel schließt und öffnet dessen Menü', async ({ page }) => {
  await open(page, STACKS[0]);
  await open(page, STACKS[4]);
  await expect(menu(page)).toHaveCount(1);
  await expect(menu(page)).toHaveAttribute('data-stack-menu', 'clubs');
});

test('nur ein Menü offen: Stapelmenü schließt das Namensschild-Menü und umgekehrt', async ({ page }) => {
  await open(page, STACKS[0]);
  await page.locator('[data-plate=seat1]').click();
  await expect(page.locator('[data-plate-menu]')).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
  await open(page, STACKS[0]);
  await expect(page.locator('[data-plate-menu]')).toHaveCount(0);
});

test('Spielerzahl ändern bewegt die Stapel nicht: das Menü bleibt offen und am Stapel', async ({ page }) => {
  const { m } = await open(page, STACKS[2]);
  await setPlayersByKeyboard(page, 2);
  await expect(page.locator('[data-sheet=seat3]')).toHaveCount(0);
  await expect(menu(page)).toBeVisible();
  expect((await menu(page).boundingBox())!).toEqual(m);
});

// ---------- Teil 4: Mischen ohne Rückfrage und Kürzel (F2, N5) ----------

const count = (page: Page) => menu(page).locator('.count');

test('leeres Deck mit Karten in der Ablage: nur Mischen, ein Klick mischt sofort, danach liegen die Karo in ihren Stapeln', async ({ page }) => {
  // eine Karo-Karte auf die Ablage, dann das Deck mit Z leer ziehen
  await dragFromTo(page, await zoneCenter(page, 'LEICHT'), await zoneCenter(page, 'ABLAGE'));
  await expectCount(page, 'LEICHT', 4);
  await open(page, STACKS[0]);
  for (let i = 0; i < 27; i++) await page.keyboard.press('z');
  await expect(count(page)).toHaveText('0');
  await expect(stackItem(page, 'Ziehen')).toHaveAttribute('aria-disabled', 'true');
  await expect(stackItem(page, 'Umdrehen')).toHaveAttribute('aria-disabled', 'true');
  const shuffle = menu(page).getByRole('menuitem').nth(2);
  await expect(shuffle).toHaveAttribute('title', 'Stapel mischen; holt 28 Karten aus der Ablage zurück (1 davon nach Leicht) (M)');
  await shuffle.click();
  await expect(count(page)).toHaveText('27');
  await expectCount(page, 'ABLAGE', 0);
  await expectCount(page, 'LEICHT', 5);
  await expect(shuffle).toHaveText('Mischen');
});

test('Mischen ohne etwas einzusammeln mischt sofort, ohne Rückfrage', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  await open(page, STACKS[0]);
  await stackItem(page, 'Mischen').click();
  await expect(stackItem(page, 'Mischen')).not.toHaveClass(/armed/);
  await expect(page.getByRole('list', { name: 'Protokoll' }).locator('li').first()).toContainText('Gemischt: DECK');
});

test('Kürzel: Z, U, M groß und klein; nicht mit Strg, Alt oder Meta; gehaltenes M mischt nur einmal', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  await open(page, STACKS[0]);
  await page.keyboard.press('Shift+Z');
  await expect(count(page)).toHaveText('26');
  await page.keyboard.press('z');
  await expect(count(page)).toHaveText('25');
  for (const k of ['Control+z', 'Alt+m', 'Meta+u', 'Control+Shift+Z']) await page.keyboard.press(k);
  await expect(count(page)).toHaveText('25');
  await expect(stackItem(page, 'Mischen')).toHaveText('Mischen');
  // U dreht die oberste Karte um, das Menü bleibt
  const faceUp = page.locator('[data-card] .inner:not(.down)');
  const before = await faceUp.count();
  await page.keyboard.press('u');
  await expect(faceUp).toHaveCount(before + 1);
  await expect(menu(page)).toBeVisible();
  // gehaltenes M: der erste Druck mischt, die Wiederholung nicht noch einmal
  await page.keyboard.down('m');
  await page.keyboard.down('m');
  await page.keyboard.down('m');
  await page.keyboard.up('m');
  await expectCount(page, 'ABLAGE', 0);
  await expect(count(page)).toHaveText('27');
  await expect(page.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: 'Gemischt' })).toHaveCount(1);
});

test('Kürzel wirken nur bei offenem Menü und nicht in Textfeldern', async ({ page }) => {
  await page.keyboard.press('z');
  await expectCount(page, 'DECK', 27);
  await open(page, STACKS[0]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  const name = page.locator('[data-sheet=seat1] [data-field="name"]');
  await name.click();
  await expect(menu(page)).toHaveCount(0);
  await name.press('z');
  await expectCount(page, 'DECK', 27);
});
