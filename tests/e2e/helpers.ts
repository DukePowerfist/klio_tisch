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

export async function count(page: Page, zoneLabel: string): Promise<number> {
  const txt = await page.locator('.zone').filter({ hasText: new RegExp(`^${zoneLabel}`) }).first().locator('.n').textContent();
  return Number(txt);
}

export async function ready(page: Page) {
  await page.goto('./');
  await expect(page.locator('.board')).toBeVisible();
}
