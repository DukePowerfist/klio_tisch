// Farben nach Bedeutung (Schritt 5v, Teil 3, ARCHITEKTUR.md 10.8): Gold nur für wählbar oder ablegbar, gewählt grün
// mit hellem Rand, geänderte Rechte mit Schild, ein Fokusrahmen überall.

import { expect, test, type Locator, type Page } from '@playwright/test';
import { fromMenu, holdOver, openMenuAndClick, openSettings, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

/** sichtbare Elemente mit Gold (#d6a828 oder #f5d76e, auch durchscheinend) in Schrift, Fläche, Rand oder Schatten */
const golden = (page: Page) =>
  page.evaluate(() => {
    const gold = /rgba?\((214, 168, 40|245, 215, 110)/;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (!el.getClientRects().length) continue;
      const c = getComputedStyle(el);
      const own = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) ? c.color : '';
      // alles im Trumpffeld zählt als „slot“ (das Plus ist seit 5z gezeichnet: SVG, Farbe geerbt)
      if ([own, c.backgroundColor, c.borderTopColor, c.outlineColor, c.boxShadow].some((v) => gold.test(v))) out.push(el.closest('.slot') ? 'slot' : el.getAttribute('class') || el.tagName);
    }
    return out;
  });
const look = (l: Locator) => l.evaluate((b) => { const c = getComputedStyle(b); return { bg: c.backgroundColor, rim: c.borderTopColor, ink: c.color }; });

test('Gold nur, wo man wählen oder ablegen kann: Plus im leeren Trumpffeld, Zone unter der gezogenen Karte', async ({ page }) => {
  // Draufsicht: nichts ist gold, außer dem Plus in leeren Trumpffeldern
  expect((await golden(page)).filter((c) => !/\bslot\b/.test(c))).toEqual([]);
  // Protokoll und Meldung: kein Gold
  await fromMenu(page, 'Protokoll');
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toBeVisible();
  expect((await golden(page)).filter((c) => !/\bslot\b/.test(c))).toEqual([]);
  // beim Ziehen über der Ablage: die Zone ist gold
  await holdOver(page, await zoneCenter(page, 'DECK'), await zoneCenter(page, 'ABLAGE'));
  expect(await golden(page)).toContainEqual(expect.stringMatching(/\bhot\b/));
  await page.mouse.up();
});

test('Gewählt: Übersicht-Knopf im Dock grün mit hellem Rand', async ({ page }) => {
  const on = page.locator('.dock button.on');
  await expect(on).toHaveCount(1);
  expect(await look(on)).toEqual({ bg: 'rgb(44, 90, 71)', rim: 'rgba(243, 239, 227, 0.45)', ink: 'rgb(243, 239, 227)' });
});

test('Geändertes Recht: Schild „geändert“ am Titel, Titel ohne Gold; Voreinstellung nimmt es weg', async ({ page }) => {
  const dialog = await openSettings(page, 'Rechte der Spieler');
  const free = dialog.getByRole('combobox', { name: 'Trumpf frei wählen (ohne Regelprüfung)' });
  const row = dialog.locator('.row', { has: page.getByRole('combobox', { name: 'Trumpf frei wählen (ohne Regelprüfung)' }) });
  await expect(row.locator('.changed')).toHaveCount(0);
  await free.selectOption('allow');
  await expect(row.locator('.changed')).toHaveText('geändert');
  expect((await look(row.locator('.title'))).ink).toBe('rgb(243, 239, 227)');
  await dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' }).click();
  await expect(row.locator('.changed')).toHaveCount(0);
});

test('Fokusrahmen überall gleich: Knöpfe der Fenster, ×, Schalter, Spielerzahl, Menüeinträge', async ({ page }) => {
  const ring = (l: Locator) => l.evaluate((e) => { const c = getComputedStyle(e); return `${c.outlineStyle} ${c.outlineColor}`; });
  const want = 'solid rgb(243, 239, 227)';
  const dialog = await openSettings(page, 'Tisch');
  await dialog.getByRole('radio', { name: '4', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await ring(dialog.getByRole('radio', { name: '4', exact: true }))).toBe(want);
  await page.keyboard.press('Tab');
  expect(await ring(dialog.getByRole('switch').first())).toBe(want);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused();
  expect(await ring(dialog.getByRole('button', { name: 'Schließen' }))).toBe(want);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Zurücksetzen' }).focus();
  await page.keyboard.press('Enter');
  const reset = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  await reset.getByRole('button', { name: 'Abbrechen' }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await ring(reset.getByRole('button', { name: 'Abbrechen' }))).toBe(want);
});
