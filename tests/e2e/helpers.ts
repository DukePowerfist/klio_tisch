import { expect, type Page } from '@playwright/test';

/** Mitte einer Zone anhand ihrer Beschriftung (Tischzonen) bzw. die n-te passende. */
export async function zoneCenter(page: Page, label: string, nth = 0) {
  const box = (await page.locator('.zone').filter({ hasText: new RegExp(`^${label}`) }).nth(nth).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/** Karte von a nach b ziehen (Bildschirmkoordinaten). */
export async function dragFromTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (shift) await page.keyboard.up('Shift');
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

export async function openMenuAndClick(page: Page, zoneLabel: string, action: 'Mischen' | 'Umdrehen' | 'Ziehen') {
  const z = await zoneCenter(page, zoneLabel);
  await page.mouse.click(z.x, z.y);
  await page.getByRole('button', { name: action, exact: true }).click();
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
  await input.press('Enter');
}

/** Einem Charakter einen Namen geben (über seine Rollenansicht, danach zurück zur Übersicht). */
export async function nameCharacter(page: Page, seat: string, name: string) {
  await page.keyboard.press(seat.slice(-1));
  await setField(page, seat, 'name', name);
  await page.keyboard.press('0');
}

/** Hineinzoomen um einen Punkt, bis die kleinen Bedienelemente sichtbar sind (wie bisher ab Zoom 1,6). */
export async function zoomIn(page: Page, at = { x: 20, y: 20 }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -500);
  await expect(page.locator('body.zoomed')).toHaveCount(1);
}

export async function ready(page: Page, reload = false) {
  if (reload) await page.reload();
  else await page.goto('./');
  await expect(page.locator('.board')).toBeVisible();
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
  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  if (characters) await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Zurücksetzen' }).click();
}
