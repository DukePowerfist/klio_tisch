// Bögen und Trümpfe im lokalen Betrieb (Schritt 3b).

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, makePng, ready, setField as setSeatField, setPlayers, zoneCenter, zoomIn } from './helpers';

const sheet1 = (page: Page) => page.locator('[data-sheet=seat1]');

const setField = (page: Page, field: string, value: string) => setSeatField(page, 'seat1', field, value);

test.beforeEach(async ({ page }) => ready(page));

test('Eintragen bleibt nach Neuladen; Attribute nur eine Ziffer', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'name', 'Ida Weber');
  await setField(page, 'strengths.text.2', 'Seil');
  const k = sheet1(page).locator('[data-field="attributes.K"]');
  await k.click();
  await k.pressSequentially('a7');
  await k.press('Enter');
  await expect(k).toHaveValue('7');
  await ready(page, true);
  await expect(sheet1(page).locator('[data-field="name"]')).toHaveValue('Ida Weber');
  await expect(sheet1(page).locator('[data-field="strengths.text.2"]')).toHaveValue('Seil');
  await expect(sheet1(page).locator('[data-field="attributes.K"]')).toHaveValue('7');
});

test('Kästchen, Narbe ohne Zähler (5k), Rüstzeug streichen', async ({ page }) => {
  await page.keyboard.press('1'); // eigener Bogen: kleine Bedienelemente ohne Zoom (5b)
  const lamp = sheet1(page).locator('[data-check="lamps.1"]');
  await lamp.click();
  await expect(lamp).toHaveAttribute('aria-pressed', 'true');
  await sheet1(page).locator('[data-check="scars.heart"]').click();
  await expect(sheet1(page).locator('[data-check="scars.heart"]')).toHaveAttribute('aria-pressed', 'true');
  // eine Zahl „neue Narben“ am Bogen gibt es nicht mehr (ob „Neue Narbe“ offen ist, zeigt der Trumpfdialog)
  await expect(sheet1(page).locator('[data-counter]')).toHaveCount(0);
  await setField(page, 'gear.text.0', 'Seil');
  await sheet1(page).getByTitle('Untauglich markieren (durchstreichen)').first().click();
  await expect(sheet1(page).locator('[data-field="gear.text.0"]')).toHaveClass(/struck/);
});

test('Schaden: niedrigere Karo-Karte tötet; Wiederbeleben über das Schild', async ({ page }) => {
  // Karo B–A, dann Karo 2–6: immer niedriger, Karo als Treffer → tot (A3)
  const hard = await zoneCenter(page, 'SCHWIERIG');
  const easy = await zoneCenter(page, 'LEICHT');
  const dmg = await zoneCenter(page, 'SCHADEN');
  await dragFromTo(page, hard, dmg);
  await expect(sheet1(page).locator('.dead-cross')).toHaveCount(0);
  await dragFromTo(page, easy, dmg);
  await expect(page.getByRole('status')).toHaveText('Bogen 1: Der Charakter ist tot.');
  await expect(sheet1(page).locator('.dead-cross')).toHaveCount(1);
  await page.locator('[data-plate=seat1]').click();
  await page.getByRole('menuitem', { name: 'Charakter wiederbeleben' }).click();
  await expect(sheet1(page).locator('.dead-cross')).toHaveCount(0);
});

test('Trumpf: Starttrumpf wählen, Großansicht, entfernen', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.V', '3');
  await sheet1(page).locator('[data-slot="0"]').click();
  await page.getByRole('button', { name: /^Starttrumpf/ }).click();
  await page.getByRole('button', { name: /^Verstehen/ }).click();
  await page.getByRole('button', { name: /Anatomie/ }).click();
  await expect(page.getByRole('status')).toHaveText('Bogen 1: Trumpf „Anatomie“ gewählt');
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toContainText('Anatomie');
  await sheet1(page).locator('[data-slot="0"]').click();
  await expect(page.locator('.big .tcard')).toContainText('Anatomie');
  await page.locator('.panel').click({ position: { x: 40, y: 40 } }); // ein Klick irgendwo schließt die Großansicht
  await expect(page.locator('.big')).toHaveCount(0);
  await sheet1(page).getByTitle('Trumpf entfernen').click();
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toHaveCount(0);
});

test('Trumpf: Erlebnis mit Verbesserung und neuer Formulierung', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.K', '2');
  await setField(page, 'strengths.text.1', 'Peitsche');
  // erst einen Starttrumpf, dann Lampen markieren
  await sheet1(page).locator('[data-slot="0"]').click();
  await page.getByRole('button', { name: /^Starttrumpf/ }).click();
  await page.getByRole('button', { name: /^Körper/ }).click();
  await page.getByRole('button', { name: /Schnelle Reflexe/ }).click();
  for (const i of [0, 1, 2]) await sheet1(page).locator(`[data-check="lamps.${i}"]`).click();
  await sheet1(page).locator('[data-slot="1"]').click();
  await page.getByRole('button', { name: /^Erlebnis eingetroffen/ }).click();
  await page.getByRole('button', { name: /^II · Peitsche/ }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('gute Peitsche');
  await page.getByRole('dialog').getByRole('textbox').press('Enter');
  await page.getByRole('button', { name: /^Körper/ }).click();
  await page.getByRole('button', { name: /Stoiker/ }).click();
  await expect(sheet1(page).locator('[data-field="strengths.text.1"]')).toHaveValue('gute Peitsche');
  await expect(sheet1(page).locator('[data-check="strengths.improved.1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet1(page).locator('[data-check="lamps.0"]')).toHaveAttribute('aria-pressed', 'false');
});

test('Zufälliger Trumpf und freie Wahl', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.P', '4');
  await sheet1(page).locator('[data-slot="0"]').click();
  await page.getByRole('button', { name: 'Zufälliger Trumpf' }).click();
  await expect(page.getByRole('status')).toHaveText(/^Bogen 1: Trumpf „.+“ gewählt$/);
  await sheet1(page).locator('[data-slot="1"]').click();
  await page.getByRole('button', { name: 'Freie Wahl' }).click();
  await page.getByRole('button', { name: /^Verschiedene/ }).click();
  await page.getByRole('button', { name: /Kraftakt/ }).click();
  await expect(sheet1(page).locator('[data-slot="1"] .tcard')).toContainText('Kraftakt');
});

test('Foto wird verkleinert gespeichert und bleibt nach Neuladen', async ({ page }) => {
  await page.keyboard.press('1');
  await sheet1(page).locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page) });
  await expect(sheet1(page).getByRole('button', { name: 'Foto' })).toHaveCSS('background-image', /^url\("blob:/);
  await ready(page, true);
  await expect(sheet1(page).getByRole('button', { name: 'Foto' })).toHaveCSS('background-image', /^url\("blob:/);
});

test('Bedienelemente: kleine erst ab Zoom 1,3, am eigenen Bogen der Rollenansicht immer', async ({ page }) => {
  for (const seat of ['seat1', 'seat2']) {
    await page.keyboard.press(seat.slice(-1));
    await setSeatField(page, seat, 'gear.text.0', 'Seil');
  }
  await page.keyboard.press('0');
  const strike = (seat: string) => page.locator(`[data-sheet=${seat}]`).getByTitle('Untauglich markieren (durchstreichen)').first();
  // Draufsicht bei Zoom 1: kleine verborgen
  await expect(strike('seat1')).toBeHidden();
  // bei 2 wie bei 4 Spielern: ab Zoom 1,3 sichtbar, beim Herauszoomen wieder verborgen
  for (const players of ['4', '2']) {
    await setPlayers(page, Number(players));
    await page.mouse.move(800, 450);
    const w0 = (await page.locator('.board').boundingBox())!.width;
    await page.mouse.wheel(0, -200); // Zoom etwa 1,27
    await expect.poll(async () => (await page.locator('.board').boundingBox())!.width).toBeGreaterThan(w0 * 1.2);
    await expect(strike('seat1')).toBeHidden();
    await page.mouse.wheel(0, -50); // etwa 1,35
    await expect(strike('seat1')).toBeVisible();
    await expect(strike('seat2')).toBeVisible();
    await page.mouse.wheel(0, 100);
    await expect(strike('seat1')).toBeHidden();
    await page.keyboard.press('Escape');
  }
  // Rollenansicht: eigener Bogen ohne Zoom; kleine Bögen erst ab Zoom 1,3
  await page.keyboard.press('1');
  await expect(strike('seat1')).toBeVisible();
  await expect(strike('seat2')).toBeHidden();
  await zoomIn(page, { x: 1200, y: 300 });
  await expect(strike('seat2')).toBeVisible();
});
