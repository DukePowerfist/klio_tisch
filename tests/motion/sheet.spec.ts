// Bewegung am Bogen (Stufe „Ruhig“): Geisterkarte im leeren Trumpffeld (5zn, ARCHITEKTUR.md 10.19).

import { expect, test } from '@playwright/test';
import { ready, settled } from '../e2e/helpers';

test('Geisterkarte (5zn): legt sich beim Überfahren ins Feld, auch im ersten freien', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('1');
  const ghost = (i: number) => page.locator(`[data-sheet=seat1] [data-slot="${i}"] .ghost`);
  /** Drehung und Versatz nach unten aus der Transformation, in Grad und Bildpunkten der Haut */
  const pose = (i: number) => ghost(i).evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { tilt: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI * 10) / 10, y: Math.round(m.f * 10) / 10 };
  });
  await page.mouse.move(10, 10);
  // erst wenn der Bogen nach dem Ansichtswechsel steht: sonst rutscht das Feld unter dem Zeiger weg
  await settled(page);
  // jedes freie Feld, auch das erste: die Karte wartet schräg und höher, unsichtbar
  for (const i of [0, 2]) expect(await pose(i)).toEqual({ tilt: -2, y: -6 });
  await page.locator('[data-sheet=seat1] [data-slot="2"]').hover();
  // unterwegs zwischen beiden Lagen, am Ende gerade
  await expect.poll(() => pose(2).then((p) => p.y), { intervals: [20] }).toBeGreaterThan(-6);
  await expect.poll(() => pose(2)).toEqual({ tilt: 0, y: 0 });
});
