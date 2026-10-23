// Menü am Namensschild im lokalen Betrieb (Schritt 5j, ARCHITEKTUR.md 10.1). Mit Mitspielern: multiplayer.spec.ts.

import { expect, test, type Page } from '@playwright/test';
import { box, dragFromTo, expectCount, expectInStage, expectTipAt, makePng, nameCharacter, ready, setPlayersByKeyboard, zoneCenter } from './helpers';

const plate = (page: Page, seat: string) => page.locator(`[data-plate=${seat}]`);
const menu = (page: Page) => page.getByRole('menu');
const entries = (page: Page) => menu(page).getByRole('menuitem');

test.beforeEach(async ({ page }) => ready(page));

test('Übersicht: Klick öffnet das Menü, Esc und Klick daneben schließen es', async ({ page }) => {
  await plate(page, 'seat2').click();
  await expect(menu(page)).toHaveAccessibleName('Platz 2');
  // lokal: nichts zu Personen; am freien Platz nur die Farbe
  await expect(entries(page)).toHaveText(['Farbe …', 'Zur Rollenansicht', 'Charakter auswürfeln', 'Foto ändern …', 'Charakter exportieren', 'Charakter importieren …', 'Charakter zurücksetzen']);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await plate(page, 'seat2').click();
  await page.mouse.click(5, 300);
  await expect(menu(page)).toHaveCount(0);
  // erneuter Klick aufs Schild schließt, ein anderes Schild wechselt
  await plate(page, 'seat2').click();
  await plate(page, 'seat2').click();
  await expect(menu(page)).toHaveCount(0);
  await plate(page, 'seat1').click();
  await plate(page, 'seat3').click();
  await expect(menu(page)).toHaveAccessibleName('Platz 3');
});

test('Zur Rollenansicht; dort steht das Schild auf dem großen Bogen, Esc schließt nur das Menü', async ({ page }) => {
  await plate(page, 'seat3').click();
  await entries(page).getByText('Zur Rollenansicht').click();
  await expect(page.locator('[data-dock=seat3]')).toHaveClass(/on/);
  await expect(page.locator('[data-plate]')).toHaveCount(1);
  await plate(page, 'seat3').click();
  await expect(entries(page)).not.toContainText(['Zur Rollenansicht']);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('[data-dock=seat3]')).toHaveClass(/on/);
});

test('Auswürfeln und Zurücksetzen mit Rückfrage', async ({ page }) => {
  const name = page.locator('[data-sheet=seat2] [data-field=name]');
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter auswürfeln').click();
  await expect(menu(page)).toHaveCount(0);
  await expect(name).not.toHaveValue('');
  // schon ausgefüllt: erst „Überschreiben?“
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter auswürfeln').click();
  await expect(entries(page).getByText('Überschreiben?')).toBeVisible();
  await page.keyboard.press('Escape');
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter zurücksetzen').click();
  await expect(name).not.toHaveValue('');
  await entries(page).getByText('Wirklich zurücksetzen?').click();
  await expect(menu(page)).toHaveCount(0);
  await expect(name).toHaveValue('');
  await expect(page.locator('[data-sheet=seat2] [data-field="strengths.text.0"]')).toHaveValue('');
});

test('Farbe eines Platzes über das Schild', async ({ page }) => {
  await plate(page, 'seat2').click();
  await entries(page).getByText('Farbe …').click();
  const dialog = page.getByRole('dialog', { name: 'Farbe: Platz 2' });
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Türkis' }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-dock=seat2]')).toHaveAttribute('style', /who-c-teal/);
});

test('Foto über das Schild, auch das Fotofeld am Bogen öffnet die Auswahl', async ({ page }) => {
  await plate(page, 'seat1').click();
  const chooser = page.waitForEvent('filechooser');
  await entries(page).getByText('Foto ändern …').click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page) });
  await expect(page.locator('[data-sheet=seat1] .photo')).toHaveCSS('background-image', /^url\(/);
  await page.keyboard.press('1');
  await expect(page.locator('[data-sheet=seat1] .photo')).toBeEnabled();
});

test('Foto entfernen über das Schild (5z): nur mit Foto, mit zweitem Klick, bleibt nach Neuladen weg', async ({ page }) => {
  const photo = page.locator('[data-sheet=seat1] .photo');
  await plate(page, 'seat1').click();
  await expect(entries(page).getByText('Foto entfernen')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await entries(page).getByText('Foto ändern …').click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page) });
  await expect(photo).toHaveCSS('background-image', /^url\(/);

  await plate(page, 'seat1').click();
  await entries(page).getByText('Foto entfernen').click();
  // erst scharf: Menü bleibt offen, Foto noch da
  await expect(entries(page).getByText('Foto wirklich entfernen?')).toBeVisible();
  await expect(photo).toHaveCSS('background-image', /^url\(/);
  await entries(page).getByText('Foto wirklich entfernen?').click();
  await expect(photo).toHaveCSS('background-image', 'none');
  await ready(page, true);
  await expect(photo).toHaveCSS('background-image', 'none');
  await plate(page, 'seat1').click();
  await expect(entries(page).getByText('Foto entfernen')).toHaveCount(0);
});

test('Schild stört den Tisch nicht: Menü auf und zu, danach Karte ziehen', async ({ page }) => {
  await plate(page, 'seat1').click();
  await page.keyboard.press('Escape');
  const deck = await zoneCenter(page, 'DECK');
  await dragFromTo(page, deck, await zoneCenter(page, 'GEFAHR'));
  await expectCount(page, 'GEFAHR', 1);
});

test('Charakter exportieren, zurücksetzen, importieren ergibt denselben Bogen mit Foto', async ({ page }) => {
  const field = (f: string) => page.locator(`[data-sheet=seat2] [data-field="${f}"]`);
  // Bogen mit Einträgen und Foto
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter auswürfeln').click();
  await plate(page, 'seat2').click();
  let chooser = page.waitForEvent('filechooser');
  await entries(page).getByText('Foto ändern …').click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page) });
  const photo = page.locator('[data-sheet=seat2] .photo');
  await expect(photo).toHaveCSS('background-image', /^url\(/);
  const name = await field('name').inputValue();
  const strength = await field('strengths.text.0').inputValue();

  await plate(page, 'seat2').click();
  const download = page.waitForEvent('download');
  await entries(page).getByText('Charakter exportieren').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${name}.klio-charakter.json`);
  const path = await file.path();

  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter zurücksetzen').click();
  await entries(page).getByText('Wirklich zurücksetzen?').click();
  await expect(field('name')).toHaveValue('');
  await expect(photo).toHaveCSS('background-image', 'none');

  // leerer Bogen: ohne Rückfrage direkt die Dateiauswahl
  await plate(page, 'seat2').click();
  chooser = page.waitForEvent('filechooser');
  await entries(page).getByText('Charakter importieren …').click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole('status')).toHaveText('Bogen 2: Charakter aus einer Datei geladen');
  await expect(field('name')).toHaveValue(name);
  await expect(field('strengths.text.0')).toHaveValue(strength);
  await expect(photo).toHaveCSS('background-image', /^url\(/);
  await ready(page, true);
  await expect(page.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue(name);

  // Bogen mit Einträgen: erst „Bogen ersetzen?“; eine falsche Datei wird gemeldet und ändert nichts
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter importieren …').click();
  chooser = page.waitForEvent('filechooser');
  await entries(page).getByText('Bogen ersetzen?').click();
  await (await chooser).setFiles({ name: 'falsch.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"etwas"}') });
  await expect(page.getByRole('status')).toHaveText('Diese Datei ist kein Charakter des Kartentischs.');
  await expect(page.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue(name);
});

// ---------- Schritt 5p, Teil 2: eine Schließregel mit dem Stapelmenü (10.4, N4, R6) ----------

test('Fenstergröße schließt das Menü', async ({ page }) => {
  await plate(page, 'seat1').click();
  await expect(menu(page)).toBeVisible();
  await page.setViewportSize({ width: 1500, height: 860 });
  await expect(menu(page)).toHaveCount(0);
});

test('Spielerzahl: Menü schließt, wenn der Platz verschwindet oder der Bogen woanders steht, sonst bleibt es', async ({ page }) => {
  // 4 → 3: Platz 4 verschwindet
  await plate(page, 'seat4').click();
  await setPlayersByKeyboard(page, 3);
  await expect(page.locator('[data-sheet=seat4]')).toHaveCount(0);
  await expect(menu(page)).toHaveCount(0);
  // 3 → 4: Platz 1 bleibt, wo er ist, das Menü bleibt offen
  const before = await plate(page, 'seat1').boundingBox();
  await plate(page, 'seat1').click();
  await setPlayersByKeyboard(page, 4);
  await expect(page.locator('[data-sheet=seat4]')).toHaveCount(1);
  expect(await plate(page, 'seat1').boundingBox()).toEqual(before);
  await expect(menu(page)).toHaveAccessibleName('Platz 1');
  // 4 → 2: größere Bögen, Platz 1 steht woanders
  await setPlayersByKeyboard(page, 2);
  await expect(page.locator('[data-sheet=seat3]')).toHaveCount(0);
  await expect(menu(page)).toHaveCount(0);
});

// ---------- Schritt 5p, Teil 3: Menüstil, Kopf, Zipfel, Lage (10.4) ----------

const panel = (page: Page) => page.locator('[data-plate-menu]');
const expectInside = (page: Page) => expectInStage(page, panel(page));

test('Kopf: „Platz n“ mit Charaktername, ohne Namen nur „Platz n“; langer Name gekürzt, ganz im Tooltip', async ({ page }) => {
  await plate(page, 'seat2').click();
  await expect(panel(page).locator('.menu-head')).toHaveText('Platz 2');
  await expect(panel(page).locator('.menu-head .name')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const long = 'Wilhelmine Adelheid von Hohenstein-Eberstadt';
  await nameCharacter(page, 'seat2', long);
  await plate(page, 'seat2').click();
  const name = panel(page).locator('.menu-head .name');
  await expect(name).toHaveText(long);
  await expect(name).toHaveCSS('text-transform', 'none');
  await expect(panel(page).locator('.menu-head')).toHaveAttribute('title', long);
  expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(panel(page)).toHaveCSS('width', '240px');
});

test('am Schild: unter dem Schild mit Zipfel auf dessen Mitte, sonst darüber, immer ganz sichtbar', async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1600, height: 900 }]) {
    await page.setViewportSize(size);
    for (const seat of ['seat1', 'seat2', 'seat3', 'seat4']) {
      await plate(page, seat).click();
      await expect(panel(page)).toBeVisible();
      await expectInside(page);
      await expectTipAt(panel(page), await box(plate(page, seat)));
      const p = await box(plate(page, seat));
      const m = await box(panel(page));
      const side = await panel(page).getAttribute('data-side');
      if (side === 'below') expect(m.y).toBeGreaterThan(p.y + p.height);
      else expect(m.y + m.height).toBeLessThan(p.y);
      // die oberen Schilder: darunter
      if (seat === 'seat1' || seat === 'seat2') expect(side).toBe('below');
      await page.keyboard.press('Escape');
    }
  }
});

test('passt auf keiner Seite: rutscht ins Fenster über das Schild, ohne Zipfel (R2, F1 a)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await plate(page, 'seat3').click();
  await expect(panel(page)).toBeVisible();
  await expectInside(page);
  await expect(panel(page).locator('.menu-tip')).toHaveCount(0);
  const p = await box(plate(page, 'seat3'));
  const m = await box(panel(page));
  expect(m.x).toBeCloseTo(p.x, 0);
  expect(m.y).toBeLessThan(p.y);
  expect(m.y + m.height).toBeGreaterThan(p.y + p.height);
});

test('sehr kleines Fenster: Höchsthöhe, der Inhalt scrollt, der Kopf bleibt (R2)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 260 });
  await plate(page, 'seat2').click();
  await expectInside(page);
  const body = panel(page).locator('.menu-body');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const head = await box(panel(page).locator('.menu-head'));
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await box(panel(page).locator('.menu-head'))).toEqual(head);
  await expect(entries(page).getByText('Charakter zurücksetzen')).toBeInViewport();
});

test('Rückfragen: Fläche mit Rahmen; Zurücksetzen und Importieren im gedämpften Rot, Auswürfeln ohne', async ({ page }) => {
  // ausgewürfelt: Auswürfeln überschreibt, also fragt es nach
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter auswürfeln').click();
  await plate(page, 'seat2').click();
  await entries(page).getByText('Charakter zurücksetzen').click();
  const reset = entries(page).getByText('Wirklich zurücksetzen?');
  await expect(reset).toHaveClass(/armed/);
  await expect(reset).toHaveCSS('color', 'rgb(237, 165, 147)');
  await expect(reset).toHaveCSS('border-top-color', 'rgba(243, 239, 227, 0.45)');
  await entries(page).getByText('Charakter importieren …').click();
  await expect(entries(page).getByText('Bogen ersetzen?')).toHaveCSS('color', 'rgb(237, 165, 147)');
  await entries(page).getByText('Charakter auswürfeln').click();
  const roll = entries(page).getByText('Überschreiben?');
  await expect(roll).toHaveClass(/armed/);
  await expect(roll).toHaveCSS('color', 'rgb(243, 239, 227)');
});
