import { readFile } from 'node:fs/promises';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

export type Box = { x: number; y: number; width: number; height: number };
/** Rechteck des ersten Treffers am Bildschirm */
export const box = async (l: Locator): Promise<Box> => (await l.first().boundingBox())!;

/** Menü ganz in der sichtbaren Tischfläche, mit dem Rand MENU_MARGIN (8 px) aus Board.svelte. Mit einem Locator wird
 *  gewartet: Ändert sich die Höhe (Namensschild-Menü), rückt das Menü erst mit der nächsten Messung nach (vor dem
 *  Zeichnen, aber ein Test kann dazwischen lesen) */
export async function expectInStage(page: Page, m: Box | Locator, label?: string) {
  const outside = async (r: Box) => {
    const s = await box(page.locator('.stage'));
    return Math.max(s.x + 7.5 - r.x, s.y + 7.5 - r.y, r.x + r.width - (s.x + s.width - 7.5), r.y + r.height - (s.y + s.height - 7.5));
  };
  if ('x' in m) expect(await outside(m), label).toBeLessThanOrEqual(0);
  else await expect.poll(async () => outside(await box(m)), label).toBeLessThanOrEqual(0);
}

/** Zipfel eines Menüs zeigt waagerecht auf die Mitte des Ankers */
export async function expectTipAt(menu: Locator, anchor: Box) {
  const tip = await box(menu.locator('.menu-tip'));
  expect(Math.abs(tip.x + tip.width / 2 - (anchor.x + anchor.width / 2))).toBeLessThan(1.5);
}

/** Mitte einer Zone anhand ihrer Beschriftung (Tischzonen). */
export async function zoneCenter(page: Page, label: string) {
  const box = (await page.locator('.zone').filter({ hasText: new RegExp(`^${label}`) }).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/** Karte greifen und über `to` halten (nicht loslassen; Bildschirmkoordinaten) */
export async function holdOver(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
}

/** Karte von a nach b ziehen (Bildschirmkoordinaten). */
export async function dragFromTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await holdOver(page, from, to, 12);
  await page.mouse.up();
}

/** Eintrag im offenen Stapelmenü (10.2) */
export const stackItem = (page: Page, action: 'Mischen' | 'Umdrehen' | 'Ziehen') =>
  page.locator('[data-stack-menu]').getByRole('menuitem', { name: action, exact: true });

/** Mischen, das n Karten von woanders zurückholt: mischt ohne Rückfrage, der Tooltip nennt die Anzahl (10.2) */
export async function shuffleBack(page: Page, n: number) {
  const item = page.locator('[data-stack-menu]').getByRole('menuitem').nth(2);
  await expect(item).toHaveAttribute('title', new RegExp(`holt ${n === 1 ? '1 Karte' : `${n} Karten`} `));
  await item.click();
}

export async function openMenuAndClick(page: Page, zoneLabel: string, action: 'Mischen' | 'Umdrehen' | 'Ziehen') {
  const z = await zoneCenter(page, zoneLabel);
  await page.mouse.click(z.x, z.y);
  await stackItem(page, action).click();
}

/** Anzahl an einer Tischzone; wartet im Browser, bis sie stimmt. */
export async function expectCount(page: Page, zoneLabel: string, n: number) {
  await expect(page.locator('.zone').filter({ hasText: new RegExp(`^${zoneLabel}`) }).first().locator('.n')).toHaveText(String(n));
}

/** Feld eines Bogens ausfüllen und bestätigen. */
export async function setField(page: Page, seat: string, field: string, value: string) {
  const input = page.locator(`[data-sheet=${seat}] [data-field="${field}"]`);
  await input.click();
  await input.fill(value);
  // Esc verlässt das Feld; Enter spränge seit 5z ins nächste Feld der Gruppe
  await input.press('Escape');
}

/** Einem Charakter einen Namen geben (über seine Rollenansicht, danach zurück zur Übersicht). */
export async function nameCharacter(page: Page, seat: string, name: string) {
  await page.keyboard.press(seat.slice(-1));
  await setField(page, seat, 'name', name);
  await page.keyboard.press('0');
}

/** Hineinzoomen um einen Punkt, bis alle Bögen ihre kleinen Bedienelemente zeigen (ab Zoom 1,3, ARCHITEKTUR.md 10). */
export async function zoomIn(page: Page, at = { x: 20, y: 20 }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -500);
  await expect(page.locator('[data-sheet]:not(.tools)')).toHaveCount(0);
}

export const menuButton = (page: Page) => page.getByRole('button', { name: 'Menü' });

/** Eintrag im Menü oben rechts wählen (5b Teil 4). */
export async function fromMenu(page: Page, entry: string) {
  await menuButton(page).click();
  await page.getByRole('button', { name: entry, exact: true }).click();
}

/** Einstellungen über das Menü öffnen und auf eine Seite wechseln (Schritt 5f) */
export async function openSettings(page: Page, tab: string) {
  await fromMenu(page, 'Einstellungen');
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  await dialog.getByRole('tab', { name: tab, exact: true }).click();
  return dialog;
}

/** Spielerzahl über die Einstellungsseite „Tisch“ wählen und das Fenster wieder schließen (5s) */
export async function setPlayers(page: Page, n: number) {
  const dialog = await openSettings(page, 'Tisch');
  await dialog.getByRole('radio', { name: String(n), exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

/** Dasselbe nur mit der Tastatur: ohne Zeigerklick daneben bleiben offene Stapel- und Namensschild-Menüs offen, so
 *  lässt sich prüfen, was eine neue Spielerzahl mit ihnen macht. Schließt das Fenster über den Knopf, nicht mit Esc
 *  (Esc schlösse auch das offene Menü). */
export async function setPlayersByKeyboard(page: Page, n: number) {
  const press = async (target: Locator, key = 'Enter') => {
    await target.focus();
    await page.keyboard.press(key);
  };
  await press(menuButton(page));
  await press(page.getByRole('button', { name: 'Einstellungen', exact: true }));
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  await press(dialog.getByRole('tab', { name: 'Tisch', exact: true }));
  await press(dialog.getByRole('radio', { name: String(n), exact: true }), 'Space');
  await expect(dialog.getByRole('radio', { name: String(n), exact: true })).toBeChecked();
  await press(dialog.getByRole('button', { name: 'Schließen' }));
  await expect(dialog).toHaveCount(0);
}

/** Spielstand über die offene Einstellungsseite „Spielstand“ als Datei speichern und gelesen zurückgeben */
export async function saveArchive(page: Page, dialog: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Als Datei speichern' }).click()]);
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

/** Einträge im Menü oben rechts (danach wieder zu) */
export async function menuEntries(page: Page): Promise<string[]> {
  await menuButton(page).click();
  // ohne den Zusatz rechts („offen“ am Protokoll)
  const entries = await page.locator('[data-top-menu] .menu-item').evaluateAll((els) =>
    els.map((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelector('.menu-note')?.remove();
      return copy.textContent ?? '';
    }),
  );
  await menuButton(page).click();
  return entries;
}

export async function ready(page: Page, reload = false) {
  if (reload) await page.reload();
  else await page.goto('./');
  await expect(page.locator('.board')).toBeVisible();
}

/** SL in einem eigenen Browser lädt ein; liefert Seite und Link, sobald der Raum steht (braucht Netz) */
export async function openRoom(browser: Browser) {
  const gm = await (await browser.newContext()).newPage();
  await ready(gm);
  await fromMenu(gm, 'Mitspieler einladen');
  await expect(gm.locator('[data-health=ok]')).toBeVisible();
  return { gm, link: gm.url() };
}

/** Testbild: 400 × 300 PNG, im Browser erzeugt */
export async function makePng(page: Page): Promise<Buffer> {
  const png = await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 300);
    const g = c.getContext('2d')!;
    g.fillStyle = '#c33';
    g.fillRect(0, 0, 400, 300);
    const b = await c.convertToBlob({ type: 'image/png' });
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  return Buffer.from(png);
}

/** Tisch zurücksetzen über die Rückfrage; mit `characters` auch die Charaktere. */
export async function resetTable(page: Page, characters = false) {
  await fromMenu(page, 'Zurücksetzen');
  const dialog = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  if (characters) await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Zurücksetzen' }).click();
}

/** Die nächsten Würfe des Hosts (`cryptoRng`: v % 13) liefern genau diese Werte, danach wieder echter Zufall */
export async function fixRolls(page: Page, values: number[]) {
  await page.evaluate((vals) => {
    const orig = crypto.getRandomValues.bind(crypto);
    const queue = [...vals];
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
      if (queue.length > 0 && a instanceof Uint32Array && a.length === 1) {
        a[0] = queue.shift()!;
        if (queue.length === 0) crypto.getRandomValues = orig;
        return a;
      }
      return orig(a as never) as T;
    }) as typeof crypto.getRandomValues;
  }, values);
}

/** Indizes der längsten Einträge je Tabelle der Expedition (expedition.yaml) */
export const LONGEST = [6, 10, 12, 5];
