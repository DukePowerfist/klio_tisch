// Bögen und Trümpfe im lokalen Betrieb (Schritt 3b).

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, makePng, ready, setField as setSeatField, setPlayers, zoneCenter, zoomIn } from './helpers';

const sheet1 = (page: Page) => page.locator('[data-sheet=seat1]');

const setField = (page: Page, field: string, value: string) => setSeatField(page, 'seat1', field, value);

test.beforeEach(async ({ page }) => ready(page));

test('Textfelder nehmen höchstens 200 Zeichen, auch beim Einfügen, ohne Ablehnung (5z)', async ({ page }) => {
  await page.keyboard.press('1');
  const field = sheet1(page).locator('[data-field="gear.text.0"]');
  await expect(field).toHaveAttribute('maxlength', '200');
  await expect(sheet1(page).locator('[data-field="attributes.K"]')).not.toHaveAttribute('maxlength');
  // wie Einfügen: der Browser schneidet bei maxlength ab
  await field.click();
  await page.keyboard.insertText('z'.repeat(250));
  await field.press('Enter');
  await expect(field).toHaveValue('z'.repeat(200));
  await expect(page.getByRole('status')).toHaveCount(0);
  await ready(page, true);
  await expect(sheet1(page).locator('[data-field="gear.text.0"]')).toHaveValue('z'.repeat(200));
});

test('Feldfenster (5z): „…“ nur am abgeschnittenen Feld, ganzer Text im Fenster, Enter übernimmt, Esc nicht', async ({ page }) => {
  await page.keyboard.press('1');
  const long = 'Ein sehr langes Seil aus Hanf, zwanzig Meter, an einem Ende ausgefranst und am anderen Ende mit einem Haken';
  await setField(page, 'gear.text.0', long);
  await setField(page, 'gear.text.1', 'Seil');
  const more = sheet1(page).locator('[data-more="gear.text.0"]');
  await expect(more).toBeVisible();
  await expect(sheet1(page).locator('[data-more="gear.text.1"]')).toHaveCount(0);
  // nach dem Tippen steht wieder der Anfang im Feld
  expect(await sheet1(page).locator('[data-field="gear.text.0"]').evaluate((el) => el.scrollLeft)).toBe(0);
  // beim Tippen kein „…“
  await sheet1(page).locator('[data-field="gear.text.0"]').click();
  await expect(more).toHaveCount(0);
  await page.keyboard.press('Escape');
  await sheet1(page).locator('[data-field="gear.text.0"]').blur();

  await more.click();
  const dialog = page.getByRole('dialog', { name: 'Rüstzeug 1 · Bogen 1' });
  const box = dialog.getByRole('textbox');
  await expect(box).toHaveValue(long);
  await expect(box).toBeFocused();
  await box.fill('Kurzes Seil');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(sheet1(page).locator('[data-field="gear.text.0"]')).toHaveValue(long);

  await more.click();
  await box.fill(`${long}, neu`);
  await box.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(sheet1(page).locator('[data-field="gear.text.0"]')).toHaveValue(`${long}, neu`);

  // Stärken mit römischer Nummer; Zähler ab 150 Zeichen
  await setField(page, 'strengths.text.2', long);
  await sheet1(page).locator('[data-more="strengths.text.2"]').click();
  const strength = page.getByRole('dialog', { name: 'Stärke III · Bogen 1' });
  await strength.getByRole('textbox').fill('x'.repeat(160));
  await expect(strength.getByText('160 / 200')).toBeVisible();
  await strength.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(strength).toHaveCount(0);
});

test('Klickflächen (5z): knapp neben dem Kästchen trifft es noch, das Feld daneben bleibt ein Feld', async ({ page }) => {
  await page.keyboard.press('1');
  /** Klick `dx` Bildpunkte rechts neben der Mitte eines Kästchens (Bildpunkte nach der Haut, `size` dort) */
  const besides = async (id: string, size: number, dx: number) => {
    const b = (await sheet1(page).locator(`[data-check="${id}"]`).boundingBox())!;
    const k = b.width / size;
    await page.mouse.click(b.x + b.width / 2 + dx * k, b.y + b.height / 2);
  };
  const improved = sheet1(page).locator('[data-check="strengths.improved.0"]');
  await besides('strengths.improved.0', 20, 14); // sichtbar bis 10, Klickfläche bis 16
  await expect(improved).toHaveAttribute('aria-pressed', 'true');
  const scar = sheet1(page).locator('[data-check="scars.heart"]');
  await besides('scars.heart', 30, -20); // sichtbar bis 15, Klickfläche bis 22
  await expect(scar).toHaveAttribute('aria-pressed', 'true');
  // Rüstzeugzeile: ganz rechts im Feld trifft weiter das Feld, nicht den Streichknopf
  const gear = sheet1(page).locator('[data-field="gear.text.0"]');
  const g = (await gear.boundingBox())!;
  await page.mouse.click(g.x + g.width - 2, g.y + g.height / 2);
  await expect(gear).toBeFocused();
});

test('Tasten am Bogen (5z): Tab wie im Bild, Enter in der Gruppe weiter, Esc verlässt das Feld, Pfeiltasten an Attributen', async ({ page }) => {
  await page.keyboard.press('1');
  const f = (id: string) => sheet1(page).locator(`[data-field="${id}"]`);
  // Tab: Rüstzeug vor den Erlebnissen
  await f('weaknesses.1').click();
  await page.keyboard.press('Tab');
  await expect(f('gear.text.0')).toBeFocused();

  // Enter springt weiter und sendet, Umschalt+Enter zurück, am Ende der Gruppe verlässt Enter das Feld
  await f('strengths.text.0').click();
  await page.keyboard.type('Seil');
  await page.keyboard.press('Enter');
  await expect(f('strengths.text.1')).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expect(f('strengths.text.0')).toBeFocused();
  await f('strengths.text.4').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('input:focus')).toHaveCount(0);
  await f('attributes.K').click();
  await page.keyboard.press('Enter');
  await expect(f('attributes.V')).toBeFocused();

  // Esc mitten in der Gruppe: Feld verlassen, Text gesendet, Ansicht bleibt; ein zweites Esc wechselt in die Draufsicht
  const width = (await sheet1(page).boundingBox())!.width;
  await f('strengths.text.2').click();
  await page.keyboard.type('Laterne');
  await page.keyboard.press('Escape');
  await expect(page.locator('input:focus')).toHaveCount(0);
  await page.waitForTimeout(400);
  expect((await sheet1(page).boundingBox())!.width).toBe(width);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await sheet1(page).boundingBox())!.width).toBeLessThan(width * 0.8);

  // Pfeiltasten: leer zählt ab 0, Grenzen 0 und 9
  await page.keyboard.press('1');
  await f('attributes.P').click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect(f('attributes.P')).toHaveValue('3');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await expect(f('attributes.P')).toHaveValue('0');
  await page.keyboard.type('9');
  await page.keyboard.press('ArrowUp');
  await expect(f('attributes.P')).toHaveValue('9');
  await page.keyboard.press('Escape');
  // Neuladen erst, wenn der Stand gespeichert ist (geschieht nach dem Befehl)
  await page.waitForTimeout(500);

  await ready(page, true);
  await expect(f('strengths.text.0')).toHaveValue('Seil');
  await expect(f('strengths.text.2')).toHaveValue('Laterne');
  await expect(f('attributes.P')).toHaveValue('9');
});

test('Foto auf den Rahmen ziehen oder bei fokussiertem Rahmen einfügen (5z)', async ({ page }) => {
  await page.keyboard.press('1');
  const photo = sheet1(page).locator('.photo');
  const png = (await makePng(page)).toString('base64');
  const files = () => page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'foto.png', { type: 'image/png' }));
    return dt;
  }, png);
  const dt = await files();
  await photo.dispatchEvent('dragover', { dataTransfer: dt });
  await expect(photo).toHaveClass(/dropping/);
  await photo.dispatchEvent('drop', { dataTransfer: dt });
  await expect(photo).toHaveCSS('background-image', /^url\(/);
  await expect(photo).not.toHaveClass(/dropping/);
  const first = await photo.evaluate((el) => getComputedStyle(el).backgroundImage);

  // Einfügen: anderes Bild, Rahmen fokussiert
  const blue = await page.evaluate(async () => {
    const c = new OffscreenCanvas(300, 400);
    const g = c.getContext('2d')!;
    g.fillStyle = '#33c';
    g.fillRect(0, 0, 300, 400);
    const b = await c.convertToBlob({ type: 'image/png' });
    return btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())));
  });
  await photo.focus();
  await photo.evaluate((el, b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'blau.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, blue);
  await expect.poll(() => photo.evaluate((el) => getComputedStyle(el).backgroundImage)).not.toBe(first);
});

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

/** Starttrumpf „Anatomie“ an Bogen 1, Platz 0 (Rollenansicht Bogen 1) */
async function chooseAnatomie(page: Page) {
  await page.keyboard.press('1');
  await setField(page, 'attributes.V', '3');
  await sheet1(page).locator('[data-slot="0"]').click();
  await page.getByRole('button', { name: /^Starttrumpf/ }).click();
  await page.getByRole('button', { name: /^Verstehen/ }).click();
  await page.getByRole('button', { name: /Anatomie/ }).click();
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toContainText('Anatomie');
  await page.mouse.move(5, 5);
}

test('Trumpf: schneller Klick heftet die Großansicht an, das Überfahren überschreibt es nicht (5x)', async ({ page }) => {
  await chooseAnatomie(page);
  await sheet1(page).locator('[data-slot="0"]').click(); // Klick gleich beim Überfahren, vor Ablauf der 650 ms
  await page.waitForTimeout(900);
  await page.mouse.move(5, 5); // Zeiger verlässt das Feld: eine angeheftete Ansicht bleibt
  await expect(page.locator('.big .tcard')).toContainText('Anatomie');
});

test('Trumpf: Großansicht nur, wenn das Feld nach 650 ms noch unter dem Zeiger liegt (5x)', async ({ page }) => {
  // Ein Ansichtswechsel oder Abbau kann den Bogen unter dem ruhenden Zeiger wegziehen, ohne dass jeder Browser ein
  // pointerleave schickt (Chromium tut es); nachgestellt mit einem pointerenter ohne Zeiger über dem Feld
  await chooseAnatomie(page);
  await sheet1(page).locator('[data-slot="0"]').dispatchEvent('pointerenter');
  await page.waitForTimeout(900);
  await expect(page.locator('.big')).toHaveCount(0);
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

test('Trumpf wählen (5y): Knöpfe in einer Reihe am Ende; „Zurück“ und „Ohne Verbesserung weiter“ schicken die Formulierung nicht ab', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.K', '2');
  await setField(page, 'strengths.text.1', 'Peitsche');
  await sheet1(page).locator('[data-slot="0"]').click();
  await page.getByRole('button', { name: /^Starttrumpf/ }).click();
  await page.getByRole('button', { name: /^Körper/ }).click();
  await page.getByRole('button', { name: /Schnelle Reflexe/ }).click();
  for (const i of [0, 1, 2]) await sheet1(page).locator(`[data-check="lamps.${i}"]`).click();
  await sheet1(page).locator('[data-slot="1"]').click();
  const dialog = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  const top = async (name: string) => (await dialog.getByRole('button', { name, exact: true }).boundingBox())!.y;
  // Startseite: „Freie Wahl“ und „Zufälliger Trumpf“ auf einer Höhe (1600 × 900: die Reihe bricht nicht um)
  expect(await top('Freie Wahl')).toBe(await top('Zufälliger Trumpf'));
  await dialog.getByRole('button', { name: /^Erlebnis eingetroffen/ }).click();
  await dialog.getByRole('button', { name: /^II · Peitsche/ }).click();
  await dialog.getByRole('textbox').fill('gute Peitsche');
  const back = await top('← Zurück');
  expect(await top('Ohne Verbesserung weiter')).toBe(back);
  expect(await top('Weiter')).toBe(back);
  // Zurück: zur Startseite, nichts abgeschickt
  await dialog.getByRole('button', { name: '← Zurück' }).click();
  await expect(dialog.getByRole('button', { name: 'Zufälliger Trumpf' })).toBeVisible();
  // Überspringen aus dem Formular: weiter ohne Verbesserung
  await dialog.getByRole('button', { name: /^Erlebnis eingetroffen/ }).click();
  await dialog.getByRole('button', { name: /^II · Peitsche/ }).click();
  await dialog.getByRole('textbox').fill('gute Peitsche');
  await dialog.getByRole('button', { name: 'Ohne Verbesserung weiter' }).click();
  await expect(dialog.locator('h2')).toHaveText('Für welches Attribut?');
  await dialog.getByRole('button', { name: /^Körper/ }).click();
  await dialog.getByRole('button', { name: /Stoiker/ }).click();
  await expect(sheet1(page).locator('[data-slot="1"] .tcard')).toContainText('Stoiker');
  await expect(sheet1(page).locator('[data-field="strengths.text.1"]')).toHaveValue('Peitsche');
  await expect(sheet1(page).locator('[data-check="strengths.improved.1"]')).toHaveAttribute('aria-pressed', 'false');
});

test('Trumpf wählen (5y, F3): Ablehnung steht im Fenster, das Fenster bleibt offen', async ({ page }) => {
  await chooseAnatomie(page);
  // kein Weg offen: Start schon gewählt, keine Kästchen, keine Lampen, keine neue Narbe
  await sheet1(page).locator('[data-slot="1"]').click();
  const dialog = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  await dialog.getByRole('button', { name: 'Zufälliger Trumpf' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Keine Voraussetzung erfüllt: Es ist gerade kein Trumpf wählbar.');
  await expect(dialog.getByRole('alert')).toBeInViewport();
  // beim nächsten Schritt verschwindet der Grund
  await dialog.getByRole('button', { name: 'Freie Wahl' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
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
