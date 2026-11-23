// Bewegung am Bogen (Stufe „Ruhig“): Geisterkarte im leeren Trumpffeld (5zn, ARCHITEKTUR.md 10.19), Aufdecken eines
// neuen Trumpfs und Aufrichten der Großansicht (5zr, 10.20).

import { expect, test } from '@playwright/test';
import { pickTrump, ready, settled } from '../e2e/helpers';

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

test('Neuer Trumpf (5zr): dreht sich einmal von der Rückseite um, nicht nach dem Neuladen; die Großansicht richtet sich auf', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('1');
  await settled(page);
  const slot = page.locator('[data-sheet=seat1] [data-slot="0"]');
  /** Drehung um die Hochachse in Grad, aus der Transformation des Wenders */
  const angle = () => slot.locator('.turn').evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return Math.abs(Math.round((Math.atan2(m.m31, m.m11) * 180) / Math.PI));
  });
  await slot.click();
  await pickTrump(page, /^Starttrumpf/, /^Körper/, /Schnelle Reflexe/);
  // unterwegs: Rückseite der Spielkarten im Feld, die Karte steht schräg
  await expect(slot.locator('.turn.dealt')).toHaveCount(1);
  await expect(slot.locator('.tback')).toHaveCSS('background-image', /cards\/back\.webp/);
  await expect(slot.locator('.turn')).toHaveCSS('animation-duration', '0.6s');
  await expect.poll(angle, { intervals: [20] }).toBeGreaterThan(20);
  // am Ende: Vorderseite gerade, die Rückseite ist wieder aus dem Dokument
  await expect(slot.locator('.tback')).toHaveCount(0);
  await expect(slot.locator('.turn.dealt')).toHaveCount(0);
  expect(await angle()).toBe(0);
  await expect(slot.locator('.tcard')).toContainText('Schnelle Reflexe');

  // Großansicht: richtet sich beim Erscheinen auf
  await page.mouse.move(5, 5);
  await slot.click();
  const big = page.locator('.big .tcard');
  await expect(big).toHaveCSS('animation-name', 'trump-rise');
  await expect(big).toHaveCSS('animation-duration', '0.18s');
  await expect.poll(() => big.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  await page.keyboard.press('Escape');

  // nach dem Neuladen liegt der Trumpf einfach da
  await ready(page, true);
  await page.keyboard.press('1');
  await expect(slot.locator('.tcard')).toContainText('Schnelle Reflexe');
  await expect(slot.locator('.turn.dealt, .tback')).toHaveCount(0);
});

test('Erlebnislaterne: beim Drücken wird sie nicht eingedrückt, der Schein bleibt mit dem Papier verrechnet', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('1');
  await settled(page);
  const lantern = page.locator('[data-sheet=seat1] [data-lantern]');
  await lantern.click();
  await expect(lantern).toHaveAttribute('data-lantern', '1');
  await lantern.hover();
  await page.mouse.down();
  // `scale` am Knopf würde ihn isolieren: der Schein läge deckend über der Zeichnung statt mit ihr verrechnet
  expect(await lantern.evaluate((el) => [el.matches(':active'), getComputedStyle(el).scale])).toEqual([true, 'none']);
  // die Pfeilknöpfe daneben geben weiter nach wie alle Knöpfe
  await page.mouse.up();
  const up = page.locator('[data-sheet=seat1] [data-lantern-step=up]');
  await up.hover();
  await page.mouse.down();
  expect(await up.evaluate((el) => getComputedStyle(el).scale)).toBe('0.97');
  await page.mouse.up();
});
