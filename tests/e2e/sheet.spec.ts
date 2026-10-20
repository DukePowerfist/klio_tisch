// Bögen und Trümpfe im lokalen Betrieb (Schritt 3b).

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, ready, setField as setSeatField, zoneCenter, zoomIn } from './helpers';

const sheet1 = (page: Page) => page.locator('[data-sheet=seat1]');

/** Rollenansicht von Platz 1, hineingezoomt (kleine Bedienelemente sichtbar, wie bisher ab Zoom 1,6). */
async function zoomOnSheet(page: Page) {
  await page.keyboard.press('1');
  await zoomIn(page);
}

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

test('Auswürfeln füllt den Bogen; bei Einträgen erst „Überschreiben?“', async ({ page }) => {
  await zoomOnSheet(page);
  const roll = sheet1(page).getByRole('button', { name: 'Auswürfeln' });
  await roll.click();
  await expect(page.getByRole('status')).toHaveText('Bogen 1: Charakter ausgewürfelt');
  await expect(sheet1(page).locator('[data-field="strengths.text.0"]')).not.toHaveValue('');
  await roll.click();
  await expect(sheet1(page).getByRole('button', { name: 'Überschreiben?' })).toBeVisible();
  await sheet1(page).getByRole('button', { name: 'Überschreiben?' }).click();
  await expect(sheet1(page).getByRole('button', { name: 'Auswürfeln' })).toBeVisible();
});

test('Kästchen, Narbe mit Zähler, Rüstzeug streichen', async ({ page }) => {
  await zoomOnSheet(page);
  const lamp = sheet1(page).locator('[data-check="lamps.1"]');
  await lamp.click();
  await expect(lamp).toHaveAttribute('aria-pressed', 'true');
  await sheet1(page).locator('[data-check="scars.heart"]').click();
  await expect(sheet1(page).locator('[data-counter=newScars]')).toHaveText('1');
  await setField(page, 'gear.text.0', 'Seil');
  await sheet1(page).getByTitle('Untauglich markieren (durchstreichen)').first().click();
  await expect(sheet1(page).locator('[data-field="gear.text.0"]')).toHaveClass(/struck/);
});

test('Schaden: niedrigere Karo-Karte tötet; Wiederbeleben', async ({ page }) => {
  // Karo B–A, dann Karo 2–6: immer niedriger, Karo als Treffer → tot (A3)
  const hard = await zoneCenter(page, 'SCHWIERIG');
  const easy = await zoneCenter(page, 'LEICHT');
  const dmg = await zoneCenter(page, 'SCHADEN');
  await dragFromTo(page, hard, dmg);
  await expect(sheet1(page).locator('.dead-cross')).toHaveCount(0);
  await dragFromTo(page, easy, dmg);
  await expect(page.getByRole('status')).toHaveText('Bogen 1: Der Charakter ist tot.');
  await expect(sheet1(page).locator('.dead-cross')).toHaveCount(1);
  await sheet1(page).getByRole('button', { name: 'Wiederbeleben' }).click();
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
  await page.locator('.panel').click(); // ein Klick irgendwo schließt die Großansicht
  await expect(page.locator('.big')).toHaveCount(0);
  // Entfernen-Knopf erscheint erst gezoomt (wie bisher)
  await zoomIn(page, { x: 100, y: 700 });
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
  await zoomIn(page, { x: 100, y: 800 });
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
  await page.getByRole('link', { name: 'Freie Wahl' }).click();
  await page.getByRole('button', { name: /^Verschiedene/ }).click();
  await page.getByRole('button', { name: /Kraftakt/ }).click();
  await expect(sheet1(page).locator('[data-slot="1"] .tcard')).toContainText('Kraftakt');
});

test('Foto wird verkleinert gespeichert und bleibt nach Neuladen', async ({ page }) => {
  await page.keyboard.press('1');
  // 400 × 300 PNG im Browser erzeugen und hochladen
  const png = await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 300);
    const g = c.getContext('2d')!;
    g.fillStyle = '#c33';
    g.fillRect(0, 0, 400, 300);
    const b = await c.convertToBlob({ type: 'image/png' });
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  await sheet1(page).locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(sheet1(page).getByRole('button', { name: 'Foto' })).toHaveCSS('background-image', /^url\("blob:/);
  await ready(page, true);
  await expect(sheet1(page).getByRole('button', { name: 'Foto' })).toHaveCSS('background-image', /^url\("blob:/);
});
