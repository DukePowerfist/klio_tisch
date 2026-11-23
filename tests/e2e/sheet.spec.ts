// Bögen und Trümpfe im lokalen Betrieb (Schritt 3b).

import { expect, test, type Locator, type Page } from '@playwright/test';
import { readContent } from '../content/read';
import { dragFromTo, makePng, pickTrump, ready, setField as setSeatField, setPlayers, zoneCenter, zoomIn } from './helpers';

const sheet1 = (page: Page) => page.locator('[data-sheet=seat1]');
/** Trümpfe aus dem Inhalt: Zahlen je Gruppe stehen nicht noch einmal im Test */
const TRUMPS = (readContent() as unknown as { trumps: { category: string }[] }).trumps;

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

test('Optik (5z): gezeichnetes Kreuz und Plus, Streichlinie statt Kursiv, verbesserte Stärke halbfett und nicht abgeschnitten', async ({ page }) => {
  await page.keyboard.press('1');
  const f = (id: string) => sheet1(page).locator(`[data-field="${id}"]`);
  const c = (id: string) => sheet1(page).locator(`[data-check="${id}"]`);
  // Kreuz nur am angekreuzten Kästchen
  await expect(c('weaknessMarks.0').locator('svg.mark')).toHaveCount(0);
  await c('weaknessMarks.0').click();
  await expect(c('weaknessMarks.0').locator('svg.mark')).toHaveCount(1);
  await expect(sheet1(page).locator('[data-slot="0"] svg.plus')).toHaveCount(1);

  // Streichlinie über dem Text, ohne Kursiv; ungestrichen keine
  await setField(page, 'gear.text.0', 'Seil');
  await expect(sheet1(page).locator('[data-strike-line]')).toHaveCount(0);
  await sheet1(page).getByTitle('Untauglich markieren (durchstreichen)').first().click();
  await expect(sheet1(page).locator('[data-strike-line="gear.text.0"]')).toHaveCount(1);
  await expect(f('gear.text.0')).toHaveCSS('font-style', 'normal');
  await expect(f('gear.text.0')).toHaveCSS('text-decoration-line', 'none');

  // halbfett mit eigener Messung: ein Text, der schon verkleinert ist, wird halbfett noch kleiner statt abgeschnitten
  await setField(page, 'strengths.text.0', 'Kann jedes Schloss öffnen, das je gebaut wurde');
  const size = async () => parseFloat(await f('strengths.text.0').evaluate((el) => getComputedStyle(el).fontSize));
  const normal = await size();
  await c('strengths.improved.0').click();
  await expect(f('strengths.text.0')).toHaveCSS('font-weight', '600');
  await expect.poll(size).toBeLessThan(normal);
  await expect(sheet1(page).locator('[data-more="strengths.text.0"]')).toHaveCount(0);
  await c('strengths.improved.0').click();
  await expect(f('strengths.text.0')).toHaveCSS('font-weight', '400');
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

test('Erlebnislaterne (5zm): Linksklick füllt von unten, Rechtsklick leert, Pfeiltasten, Grenzen 0 und 3', async ({ page }) => {
  await page.keyboard.press('1');
  const lantern = sheet1(page).locator('[data-lantern]');
  const lit = () => lantern.locator('polygon').evaluateAll((ps) => ps.map((p) => p.classList.contains('on')));
  await expect(lantern).toHaveAttribute('data-lantern', '0');
  await expect(lantern).toHaveAttribute('aria-label', 'Erlebnisse: 0 von 3');
  await expect(lantern.locator('.flame')).not.toHaveClass(/(^|\s)on(\s|$)/);
  // die alten Kästchen gibt es nicht mehr
  await expect(sheet1(page).locator('[data-check^="lamps."]')).toHaveCount(0);

  await lantern.click();
  await expect(lantern).toHaveAttribute('data-lantern', '1');
  // Abschnitte stehen in der Haut unten zuerst
  expect(await lit()).toEqual([true, false, false]);
  await expect(lantern.locator('.flame')).toHaveClass(/(^|\s)on(\s|$)/);
  const flameHeight = async () => (await lantern.locator('.flame').boundingBox())!.height;
  const small = await flameHeight();
  // drei schnelle Klicks hintereinander: keiner geht verloren, bei 3 ist Schluss
  await lantern.click({ clickCount: 3, delay: 0 });
  await expect(lantern).toHaveAttribute('data-lantern', '3');
  expect(await lit()).toEqual([true, true, true]);
  expect(await flameHeight()).toBeGreaterThan(small * 1.8);

  // Rechtsklick leert um eins, ohne Menü des Browsers
  const prevented = lantern.evaluate((el) => new Promise<boolean>((done) => el.addEventListener('contextmenu', (e) => setTimeout(() => done(e.defaultPrevented)), { once: true })));
  await lantern.click({ button: 'right' });
  expect(await prevented).toBe(true);
  await expect(lantern).toHaveAttribute('data-lantern', '2');
  expect(await lit()).toEqual([true, true, false]);

  // Pfeiltasten am fokussierten Knopf; die Ansicht bleibt dabei stehen
  await lantern.focus();
  await page.keyboard.press('ArrowDown');
  await expect(lantern).toHaveAttribute('data-lantern', '1');
  await page.keyboard.press('ArrowUp');
  await expect(lantern).toHaveAttribute('data-lantern', '2');
  await page.keyboard.press('Enter');
  await expect(lantern).toHaveAttribute('data-lantern', '3');

  for (let i = 0; i < 4; i++) await lantern.click({ button: 'right' });
  await expect(lantern).toHaveAttribute('data-lantern', '0');
  await expect(page.getByRole('status')).toHaveCount(0);
  // Stand bleibt nach dem Neuladen
  await lantern.click();
  await expect(lantern).toHaveAttribute('data-lantern', '1');
  await ready(page, true);
  await expect(sheet1(page).locator('[data-lantern]')).toHaveAttribute('data-lantern', '1');
});

test('Erlebnislaterne (5zm): Knöpfe erscheinen nur in der Nähe, füllen und leeren; volle Laterne leuchtet', async ({ page }) => {
  await page.keyboard.press('1');
  const lantern = sheet1(page).locator('[data-lantern]');
  const up = sheet1(page).locator('[data-lantern-step=up]');
  const down = sheet1(page).locator('[data-lantern-step=down]');
  const shown = (l: typeof up) => l.evaluate((el) => getComputedStyle(el).opacity !== '0' && getComputedStyle(el).pointerEvents !== 'none');
  await page.mouse.move(10, 10);
  expect(await shown(up)).toBe(false);
  expect(await shown(down)).toBe(false);
  // Zeiger über der Laterne: beide da, ▼ bei leerer Laterne aus
  await lantern.hover();
  await expect.poll(() => shown(up)).toBe(true);
  await expect(down).toBeDisabled();
  // vom Rand der Laterne zum Knopf, ohne dass er verschwindet
  await up.hover();
  expect(await shown(up)).toBe(true);
  for (let i = 0; i < 3; i++) await up.click();
  await expect(lantern).toHaveAttribute('data-lantern', '3');
  await expect(up).toBeDisabled();
  await expect(lantern.locator('.halo')).toHaveClass(/(^|\s)on(\s|$)/);
  await down.click();
  await expect(lantern).toHaveAttribute('data-lantern', '2');
  await expect(lantern.locator('.halo')).not.toHaveClass(/(^|\s)on(\s|$)/);
  // Zeiger weg: Knöpfe weg, auch nach dem Klick (kein Hängenbleiben am Fokus)
  await page.mouse.move(10, 10);
  await expect.poll(() => shown(up)).toBe(false);
  // Tastaturfokus an der Laterne zeigt sie wieder; die Knöpfe selbst sind kein Tab-Ziel
  await lantern.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => shown(down)).toBe(true);
  await expect(up).toHaveAttribute('tabindex', '-1');
});

test('Erlebnislaterne auf Touch (5zm): Antippen füllt und blendet die Knöpfe ein, bis woanders getippt wird', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ hasTouch: true, baseURL: baseURL!, viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await ready(page);
  await page.keyboard.press('1');
  const lantern = sheet1(page).locator('[data-lantern]');
  const down = sheet1(page).locator('[data-lantern-step=down]');
  const wrap = lantern.locator('xpath=..');
  await expect(wrap).not.toHaveClass(/(^|\s)open(\s|$)/);
  await lantern.tap();
  await expect(lantern).toHaveAttribute('data-lantern', '1');
  await expect(wrap).toHaveClass(/(^|\s)open(\s|$)/);
  await down.tap();
  await expect(lantern).toHaveAttribute('data-lantern', '0');
  await expect(wrap).toHaveClass(/(^|\s)open(\s|$)/);
  // woanders tippen schließt
  await sheet1(page).locator('[data-field="experiences.0"]').tap();
  await expect(wrap).not.toHaveClass(/(^|\s)open(\s|$)/);
  await context.close();
});

test('Kästchen, Narbe ohne Zähler (5k), Rüstzeug streichen', async ({ page }) => {
  await page.keyboard.press('1'); // eigener Bogen: kleine Bedienelemente ohne Zoom (5b)
  const mark = sheet1(page).locator('[data-check="weaknessMarks.1"]');
  await mark.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
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
  const easy = await zoneCenter(page, 'EINFACH');
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
  await pickTrump(page, /^Starttrumpf/, /^Verstehen/, /Anatomie/);
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

test('Trumpf per Tastatur: Leertaste wählt, Enter heftet die Großansicht an, Esc schließt nur sie, Wegtabben auch', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.V', '3');
  await sheet1(page).locator('[data-slot="0"]').focus();
  await page.keyboard.press(' ');
  await pickTrump(page, /^Starttrumpf/, /^Verstehen/, /Anatomie/);
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toContainText('Anatomie');
  await page.mouse.move(5, 5);
  const slot = sheet1(page).locator('[data-slot="0"]');
  await slot.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.big .tcard')).toContainText('Anatomie');
  await page.keyboard.press('Escape');
  await expect(page.locator('.big')).toHaveCount(0);
  await expect(page.locator('[data-dock=seat1]')).toHaveClass(/\bon\b/); // Esc galt nur der Großansicht, die Rollenansicht bleibt
  await slot.focus();
  await page.keyboard.press(' ');
  await expect(page.locator('.big .tcard')).toContainText('Anatomie');
  await slot.blur();
  await expect(page.locator('.big')).toHaveCount(0);
});

test('Trumpf per Tastatur: Enter auf ✕ entfernt nur, ohne Großansicht', async ({ page }) => {
  await chooseAnatomie(page);
  await sheet1(page).getByTitle('Trumpf entfernen').focus();
  await page.keyboard.press('Enter');
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toHaveCount(0);
  await expect(page.locator('.big')).toHaveCount(0);
});

test('Trumpf: Starttrumpf wählen, Großansicht, entfernen', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.V', '3');
  await sheet1(page).locator('[data-slot="0"]').click();
  await pickTrump(page, /^Starttrumpf/, /^Verstehen/, /Anatomie/);
  await expect(page.getByRole('status')).toHaveText('Bogen 1: Trumpf „Anatomie“ gewählt');
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toContainText('Anatomie');
  await sheet1(page).locator('[data-slot="0"]').click();
  await expect(page.locator('.big .tcard')).toContainText('Anatomie');
  await page.locator('.panel').click({ position: { x: 40, y: 40 } }); // ein Klick irgendwo schließt die Großansicht
  await expect(page.locator('.big')).toHaveCount(0);
  await sheet1(page).getByTitle('Trumpf entfernen').click();
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toHaveCount(0);
});

test('Leeres Trumpffeld (5zn): Geisterkarte statt gelbem Kasten, nur beim Überfahren; in Ruhe nichts; gesperrt ohne Karte', async ({ page }) => {
  await page.keyboard.press('1');
  const slot = (i: number) => sheet1(page).locator(`[data-slot="${i}"]`);
  const opacity = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).opacity));
  const ghost = (i: number) => slot(i).locator('.ghost');
  const hint = (i: number) => slot(i).locator('.hint');
  await page.mouse.move(10, 10);
  // in Ruhe nur das goldene Plus: keine Karte und keine Zeile, in keinem Feld (auch nicht im ersten freien)
  for (const i of [0, 1, 2, 3]) {
    expect(await opacity(ghost(i))).toBe(0);
    expect(await opacity(hint(i))).toBe(0);
  }
  await expect(slot(0)).toHaveAttribute('aria-label', 'Trumpf wählen');
  await expect(slot(0)).not.toHaveAttribute('title');

  // Überfahren: Karte kräftiger, Zeile lesbar, einzeilig und über dem Plus; kein gelber Kasten
  for (const i of [0, 2]) {
    await slot(i).hover();
    await expect.poll(() => opacity(ghost(i))).toBeGreaterThan(0.3);
    await expect.poll(() => opacity(hint(i))).toBeGreaterThan(0.6);
    await expect(hint(i)).toHaveText('Trumpf wählen');
    await expect(slot(i)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const h = (await hint(i).boundingBox())!;
    const plus = (await slot(i).locator('svg.plus').boundingBox())!;
    expect(h.y + h.height).toBeLessThan(plus.y);
    expect(await hint(i).evaluate((el) => el.scrollWidth <= el.clientWidth && el.getClientRects().length === 1)).toBe(true);
  }
  await page.mouse.move(10, 10);
  await expect.poll(() => opacity(ghost(2))).toBe(0);
  // Tastaturfokus wie Überfahren
  await slot(1).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect.poll(() => opacity(ghost(1))).toBeGreaterThan(0.3);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => opacity(ghost(1))).toBe(0);
  // Auswahl öffnen und mit Esc schließen: der Fokus kehrt ins Feld zurück, die Karte bleibt trotzdem nicht stehen
  await slot(2).click();
  await expect(page.getByRole('dialog', { name: /^Trumpf wählen/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.move(10, 10);
  await expect.poll(() => opacity(ghost(2))).toBe(0);
  expect(await opacity(hint(2))).toBe(0);
  // auch kein Fokusrahmen um das Feld, obwohl es den Fokus hat
  await expect(slot(2)).toBeFocused();
  await expect(slot(2)).toHaveCSS('outline-style', 'none');
  // mit der Tastatur geöffnet und geschlossen: Rahmen und Karte sind wieder da
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(slot(2)).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /^Trumpf wählen/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(slot(2)).toBeFocused();
  await expect(slot(2)).toHaveCSS('outline-style', 'solid');
  await expect.poll(() => opacity(ghost(2))).toBeGreaterThan(0.3);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await slot(0).click();
  await page.keyboard.press('Escape');
  await page.mouse.move(10, 10);
  await expect.poll(() => opacity(ghost(0))).toBe(0);
  expect(await opacity(hint(0))).toBe(0);

  // Starttrumpf nehmen: keine Quelle mehr offen. Kein Feld hat eine Karte, die Zeile steht unter dem Plus
  await slot(0).click();
  await pickTrump(page, /^Starttrumpf/, /^Körper/, /Schnelle Reflexe/);
  await expect(slot(0).locator('.tcard')).toHaveCount(1);
  await expect(slot(0)).not.toHaveAttribute('aria-label');
  await slot(1).hover();
  await expect(slot(1)).toHaveAttribute('aria-label', 'Trumpf (noch nicht freigeschaltet)');
  await expect(hint(1)).toHaveText('noch nicht freigeschaltet');
  await expect.poll(() => opacity(hint(1))).toBeGreaterThan(0.5);
  expect(await opacity(ghost(1))).toBe(0);
  await expect(slot(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const locked = (await hint(1).boundingBox())!;
  const lockedPlus = (await slot(1).locator('svg.plus').boundingBox())!;
  const box = (await slot(1).boundingBox())!;
  expect(locked.y).toBeGreaterThan(lockedPlus.y + lockedPlus.height);
  expect(locked.y + locked.height).toBeLessThan(box.y + box.height);

  // Laterne füllen: das Plus ist wieder gold, in Ruhe weiter keine Karte; beim Überfahren legt sie sich hin
  for (let i = 0; i < 3; i++) await sheet1(page).locator('[data-lantern]').click();
  await page.mouse.move(10, 10);
  await expect(slot(1)).toHaveClass(/(^|\s)go(\s|$)/);
  expect(await opacity(ghost(1))).toBe(0);
  await slot(1).hover();
  await expect.poll(() => opacity(ghost(1))).toBeGreaterThan(0.3);
});

test('Trumpf: Erlebnis mit Verbesserung und neuer Formulierung', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.K', '2');
  await setField(page, 'strengths.text.1', 'Peitsche');
  // erst einen Starttrumpf, dann Lampen markieren
  await sheet1(page).locator('[data-slot="0"]').click();
  await pickTrump(page, /^Starttrumpf/, /^Körper/, /Schnelle Reflexe/);
  for (let i = 0; i < 3; i++) await sheet1(page).locator('[data-lantern]').click();
  await expect(sheet1(page).locator('[data-lantern]')).toHaveAttribute('data-lantern', '3');
  await sheet1(page).locator('[data-slot="1"]').click();
  await page.getByRole('button', { name: /^Erlebnis eingetroffen/ }).click();
  await page.getByRole('button', { name: /^II · Peitsche/ }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('gute Peitsche');
  await page.getByRole('dialog').getByRole('textbox').press('Enter');
  await page.getByRole('tab', { name: /^Körper/ }).click();
  await page.getByRole('button', { name: /Stoiker/ }).click();
  await page.getByRole('button', { name: 'Trumpf nehmen' }).click();
  await expect(sheet1(page).locator('[data-field="strengths.text.1"]')).toHaveValue('gute Peitsche');
  await expect(sheet1(page).locator('[data-check="strengths.improved.1"]')).toHaveAttribute('aria-pressed', 'true');
  // nach dem Trumpf ist die Laterne leer (clear: lamps)
  await expect(sheet1(page).locator('[data-lantern]')).toHaveAttribute('data-lantern', '0');
});

test('Trumpf wählen (5y): Knöpfe in einer Reihe am Ende; „Zurück“ und „Ohne Verbesserung weiter“ schicken die Formulierung nicht ab', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.K', '2');
  await setField(page, 'strengths.text.1', 'Peitsche');
  await sheet1(page).locator('[data-slot="0"]').click();
  await pickTrump(page, /^Starttrumpf/, /^Körper/, /Schnelle Reflexe/);
  for (let i = 0; i < 3; i++) await sheet1(page).locator('[data-lantern]').click();
  await expect(sheet1(page).locator('[data-lantern]')).toHaveAttribute('data-lantern', '3');
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
  await expect(dialog.locator('h2')).toHaveText('Welchen Trumpf?');
  await dialog.getByRole('tab', { name: /^Körper/ }).click();
  await dialog.getByRole('button', { name: /Stoiker/ }).click();
  await page.getByRole('button', { name: 'Trumpf nehmen' }).click();
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
  await pickTrump(page, 'Freie Wahl', /^Verschiedene/, /Kraftakt/);
  await expect(sheet1(page).locator('[data-slot="1"] .tcard')).toContainText('Kraftakt');
});

test('Trumpf-Dialog, Einstieg (5zu): Einleitung, offene Anlässe zuerst, Stand an gesperrten, Unterzeilen', async ({ page }) => {
  await page.keyboard.press('1');
  const dialog = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  const sources = () => dialog.locator('[data-source]').evaluateAll((els) => els.map((e) => `${(e as HTMLButtonElement).disabled ? '-' : '+'}${e.getAttribute('data-source')}`));
  await sheet1(page).locator('[data-slot="0"]').click();
  await expect(dialog.locator('.intro')).toHaveText('Du hast noch keinen Trumpf. Wähle deinen Starttrumpf.');
  expect(await sources()).toEqual(['+start', '-weakness', '-experience', '-scar']);
  await expect(dialog.getByText('Noch nicht möglich')).toBeVisible();
  await expect(dialog.locator('[data-source=experience]')).toContainText('Erlebnislaterne: 0 von 3');
  await expect(dialog.locator('[data-source=experience]')).toContainText('Dafür muss die Erlebnislaterne voll sein.');
  await expect(dialog.locator('[data-source=weakness]')).toContainText('Verbessern: 0 von 3');
  await expect(dialog.locator('[data-source=scar] .dialog-aside')).toHaveCount(0);
  // Unterzeilen erklären die beiden Knöpfe der Reihe am Ende und hängen an ihnen
  await expect(dialog.getByRole('button', { name: 'Zufälliger Trumpf' })).toHaveAccessibleDescription(/nimmt den ersten möglichen Anlass/);
  await expect(dialog.getByRole('button', { name: 'Freie Wahl' })).toHaveAccessibleDescription('Freie Wahl: Wähle einen Trumpf, den du noch nicht hast. Stufe und Attribute sind frei.');
  await dialog.getByRole('button', { name: 'Freie Wahl' }).click();
  await dialog.getByRole('tab', { name: /^Körper/ }).click();
  await dialog.getByRole('button', { name: /Stoiker/ }).click();
  await page.getByRole('button', { name: 'Trumpf nehmen' }).click();
  await page.mouse.move(5, 5);

  // ein Trumpf, Laterne 2 von 3: Erlebnis gesperrt mit Stand; voll: offen und oben
  const lantern = sheet1(page).locator('[data-lantern]');
  await lantern.click({ clickCount: 2, delay: 0 });
  await sheet1(page).locator('[data-slot="1"]').click();
  await expect(dialog.locator('.intro')).toHaveText('Du hast 1 von 4 Trümpfen. Einen neuen bekommst du zu einem dieser Anlässe:');
  expect(await sources()).toEqual(['-start', '-weakness', '-experience', '-scar']);
  await expect(dialog.locator('[data-source=experience]')).toContainText('Erlebnislaterne: 2 von 3');
  await page.keyboard.press('Escape');
  await lantern.click();
  await sheet1(page).locator('[data-slot="1"]').click();
  expect(await sources()).toEqual(['+experience', '-start', '-weakness', '-scar']);
  await expect(dialog.locator('[data-source=experience]')).toContainText('Erlebnislaterne voll: erst eine Stärke verbessern, dann einen Trumpf');
});

test('Trumpf-Dialog, Ablauf (5zv): Wegleiste mit getroffenen Wahlen, Grund je Schritt, Reiter mit der Zahl der wählbaren (5zx)', async ({ page }) => {
  await page.keyboard.press('1');
  await setField(page, 'attributes.K', '3');
  await setField(page, 'attributes.P', '2');
  const dialog = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  const trail = () => dialog.locator('.trail li').evaluateAll((els) => els.map((e) => `${e.className.match(/done|now|todo/)![0]}:${e.textContent!.trim()}`));
  await sheet1(page).locator('[data-slot="0"]').click();
  // im Einstieg gibt es keine Leiste
  await expect(dialog.locator('.trail')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Starttrumpf/ }).click();
  expect(await trail()).toEqual(['done:Starttrumpf', 'now:Trumpf', 'todo:Bestätigen']);
  await expect(dialog.locator('.trail [aria-current=step]')).toHaveText('Trumpf');
  await expect(dialog.locator('h2')).toHaveText('Welchen Trumpf?');
  // Reiter (5zx): vorn „Alle wählbaren“, offen; Zahlen der wählbaren; nur wählbare Karten, keine gesperrten
  const tabs = dialog.getByRole('tab');
  await expect(tabs).toHaveText([/^Alle wählbaren\s*\d+$/, /^Körper\s*\d+$/, /^Verstehen\s*0$/, /^Präsenz\s*0$/, /^Verschiedene\s*\d+$/]);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  const count = async (i: number) => Number((await tabs.nth(i).locator('.dialog-aside').textContent())!);
  expect(await count(0)).toBe((await count(1)) + (await count(4)));
  await expect(dialog.locator('.cards .tc')).toHaveCount(await count(0));
  await expect(dialog.locator('.cards .tc:disabled')).toHaveCount(0);
  // Gruppe: wählbare zuerst, darunter „Nicht wählbar“ mit Grund; die Leiste ändert sich dabei nicht
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.locator('.cards .tc')).toHaveCount(TRUMPS.filter((t) => t.category === 'K').length);
  await expect(dialog.locator('.cards .tc:not(:disabled)')).toHaveCount(await count(1));
  await expect(dialog.getByRole('heading', { name: 'Nicht wählbar' })).toBeVisible();
  expect(await dialog.locator('.cards .tc').evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled).join(''))).toMatch(/^(false)+(true)+$/);
  await expect(dialog.locator('.cards .tc:disabled .why').first()).toHaveText('Starttrumpf: nur Stufe I.');
  expect(await trail()).toEqual(['done:Starttrumpf', 'now:Trumpf', 'todo:Bestätigen']);
  // leere Gruppe sagt es; Pfeiltasten wechseln den Reiter und nehmen den Fokus mit
  await tabs.nth(2).click();
  await expect(dialog.getByText('In dieser Gruppe ist gerade kein Trumpf wählbar.')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(4)).toBeFocused();
  await tabs.nth(1).click();
  // Bestätigen (5zw): Karte, Folgen, Hauptknopf mit Fokus; Zurück führt zur Liste; erst der Hauptknopf schickt ab
  const first = dialog.locator('.cards .tc:not(:disabled)').first();
  const name = (await first.locator('.tn').textContent())!.trim();
  await first.click();
  await expect(dialog.locator('h2')).toHaveText('Diesen Trumpf nehmen?');
  expect(await trail()).toEqual(['done:Starttrumpf', `done:Trumpf: ${name}`, 'now:Bestätigen']);
  await expect(dialog.locator('.chosen .tcard .tn')).toHaveText(name);
  await expect(dialog.locator('.after li')).toHaveText(['Der Trumpf kommt in das 1. Trumpffeld.']);
  await expect(dialog.locator('.changed')).toHaveCount(0);
  await expect(sheet1(page).locator('[data-slot="0"] .tcard')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Trumpf nehmen' })).toBeFocused();
  await dialog.getByRole('button', { name: '← Zurück' }).click();
  // zurück in der Liste: derselbe Reiter ist noch offen
  await expect(dialog.locator('.cards')).toBeVisible();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await first.click();
  await page.keyboard.press('Enter');
  await expect(sheet1(page).locator('[data-slot="0"] .tcard .tn')).toHaveText(name);
  await page.mouse.move(5, 5);

  // Erlebnis: Grund am Schritt, neue Formulierung in der Leiste; ohne Verbesserung fehlt das Glied
  await setField(page, 'strengths.text.1', 'Peitsche');
  await sheet1(page).locator('[data-lantern]').click({ clickCount: 3, delay: 0 });
  await sheet1(page).locator('[data-slot="1"]').click();
  await dialog.getByRole('button', { name: /^Erlebnis eingetroffen/ }).click();
  expect(await trail()).toEqual(['done:Erlebnis eingetroffen', 'now:Stärke', 'todo:Trumpf', 'todo:Bestätigen']);
  await expect(dialog.getByText('Danach wählst du einen Trumpf der Stufe I oder II.')).toBeVisible();
  // Stärken erklärt: was sie sind, und je Zeile die Stelle auf dem Bogen
  await expect(dialog.getByText(/^Stärken sind die fünf Textfelder oben auf dem Bogen/)).toBeVisible();
  await expect(dialog.locator('.dialog-choice .note')).toHaveText(['ist der … des Teams', 'ist ausgestattet mit …', 'und …', 'Als …', 'lebt er nach dem Motto …']);
  await dialog.getByRole('button', { name: 'Ohne Verbesserung weiter' }).click();
  expect(await trail()).toEqual(['done:Erlebnis eingetroffen', 'now:Trumpf', 'todo:Bestätigen']);
  await dialog.getByRole('button', { name: '← Zurück' }).click();
  await dialog.getByRole('button', { name: /^II · Peitsche/ }).click();
  await dialog.getByRole('textbox').fill('gute Peitsche');
  await dialog.getByRole('button', { name: 'Weiter', exact: true }).click();
  expect(await trail()).toEqual(['done:Erlebnis eingetroffen', 'done:Stärke: gute Peitsche', 'now:Trumpf', 'todo:Bestätigen']);
  await dialog.getByRole('tab', { name: /^Verstehen/ }).click();
  await dialog.locator('.cards .tc:not(:disabled)').first().click();
  await expect(dialog.locator('.after li')).toHaveText(['Stärke II heißt jetzt „gute Peitsche“ und wird als verbessert markiert.', 'Die Erlebnislaterne wird geleert.', 'Der Trumpf kommt in das 2. Trumpffeld.']);
  // der Bogen ändert sich, während die Bestätigung offen ist (hier: Laterne von anderswo geleert): gesperrt, mit Grund
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-sheet=seat1] [data-lantern]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await expect(dialog.getByRole('alert')).toHaveText('Dafür muss die Erlebnislaterne voll sein.');
  await expect(dialog.getByRole('button', { name: 'Trumpf nehmen' })).toBeDisabled();
});

test('Trumpf-Dialog bei vollem Bogen (5zu, F8): „Stärke verbessern“ an der Laterne öffnet den Dialog, nur wenn ein Anlass offen ist', async ({ page }) => {
  await page.keyboard.press('1');
  const dialog = page.getByRole('dialog', { name: /^Trumpf wählen/ });
  const mark = sheet1(page).locator('[data-lantern-improve]');
  for (const [i, tab] of [/^Körper/, /^Körper/, /^Verstehen/, /^Präsenz/].entries()) {
    await sheet1(page).locator(`[data-slot="${i}"]`).click();
    await dialog.getByRole('button', { name: 'Freie Wahl' }).click();
    await dialog.getByRole('tab', { name: tab }).click();
    await dialog.locator('.cards .tc:not(:disabled)').first().click();
    await page.getByRole('button', { name: 'Trumpf nehmen' }).click();
    await expect(sheet1(page).locator(`[data-slot="${i}"] .tcard`)).toBeVisible();
    await page.mouse.move(5, 5);
  }
  // voll, aber kein Anlass: keine Marke
  await expect(mark).toHaveCount(0);
  const lantern = sheet1(page).locator('[data-lantern]');
  await lantern.click({ clickCount: 3, delay: 0 });
  await expect(lantern).toHaveAttribute('data-lantern', '3');
  await expect(mark).toHaveText('Stärke verbessern');
  // die Marke liegt im Bogen und verdeckt die Pfeilknöpfe nicht
  const inside = await mark.evaluate((el) => { const s = el.closest('.sheet')!.getBoundingClientRect(), m = el.getBoundingClientRect(); return m.left >= s.left && m.right <= s.right && m.bottom <= s.bottom; });
  expect(inside).toBe(true);
  await mark.click();
  await expect(dialog.locator('.intro')).toHaveText(/^Du hast 4 von 4 Trümpfen, mehr sind nicht möglich\./);
  await expect(dialog.locator('[data-source=experience]')).toBeEnabled();
  await expect(dialog.locator('[data-source=experience]')).toContainText('nur eine Stärke verbessern');
  // die übrigen Wege nennen den vollen Bogen als Grund, ohne Stand
  await expect(dialog.locator('[data-source=weakness]')).toContainText('Es sind höchstens 4 Trümpfe möglich.');
  await expect(dialog.locator('[data-source=weakness] .dialog-aside')).toHaveCount(0);
  await dialog.locator('[data-source=experience]').click();
  await dialog.getByRole('button', { name: /^I · / }).click();
  await dialog.getByRole('textbox').fill('gutes Seil');
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  // Bestätigen ohne Karte: nur die Folgen, Hauptknopf „Stärke verbessern“
  await expect(dialog.locator('h2')).toHaveText('Stärke verbessern?');
  await expect(dialog.locator('.chosen')).toHaveCount(0);
  await expect(dialog.locator('.after li')).toHaveText(['Stärke I heißt jetzt „gutes Seil“ und wird als verbessert markiert.', 'Die Erlebnislaterne wird geleert.']);
  await dialog.getByRole('button', { name: 'Stärke verbessern' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sheet1(page).locator('[data-field="strengths.text.0"]')).toHaveValue('gutes Seil');
  // Laterne geleert, Anlass verbraucht: Marke weg
  await expect(lantern).toHaveAttribute('data-lantern', '0');
  await expect(mark).toHaveCount(0);
});

test('Trumpfkarte im Feld (5zo): Eckmarke und Rahmenbild je Stufe, ein Segment je Attribut, Text nicht unter 9 px und sonst ausgeblendet', async ({ page }) => {
  await page.keyboard.press('1');
  const slot = (i: number) => sheet1(page).locator(`[data-slot="${i}"]`);
  const free = async (i: number, tab: RegExp, name: RegExp) => {
    await slot(i).click();
    await page.getByRole('button', { name: 'Freie Wahl' }).click();
    await page.getByRole('tab', { name: tab }).click();
    // im Auswahlfenster steht der Text immer ganz da, nichts wird ausgeblendet
    const inList = page.getByRole('button', { name }).locator('.tcard .tr');
    expect(await inList.evaluate((el) => !el.classList.contains('cut') && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await page.getByRole('button', { name }).click();
    await page.getByRole('button', { name: 'Trumpf nehmen' }).click();
    await expect(slot(i).locator('.tcard')).toHaveCount(1);
  };
  await free(0, /^Verstehen/, /Schreib das auf!/);
  await free(1, /^Verschiedene/, /Kraftakt/);
  await free(2, /^Verschiedene/, /Sprechende Tote/);
  await free(3, /^Körper/, /Schnelle Reflexe/);
  await page.mouse.move(5, 5);

  // Format 5:7 wie die Spielkarten (F9)
  const b = (await slot(0).boundingBox())!;
  expect(b.width / b.height).toBeCloseTo(126 / 176, 2);

  // Stufe: Eckmarke mit der römischen Zahl; Innenlinie erst ab Stufe II, kräftige Außenlinie und Ecken nur bei Stufe III
  const frame = (i: number) => slot(i).locator('.tcard').evaluate((el) => ({
    outer: parseFloat(getComputedStyle(el).borderTopWidth),
    inner: getComputedStyle(el.querySelector('.in')!).borderTopColor !== 'rgba(0, 0, 0, 0)',
    corners: getComputedStyle(el, '::after').content !== 'none',
  }));
  await expect(slot(0).locator('.tg b')).toHaveText('III');
  await expect(slot(1).locator('.tg b')).toHaveText('II');
  await expect(slot(3).locator('.tg b')).toHaveText('I');
  const [f3, f2, f1] = [await frame(0), await frame(1), await frame(3)];
  expect(f1).toEqual({ outer: f2.outer, inner: false, corners: false });
  expect(f2).toMatchObject({ inner: true, corners: false });
  expect(f3).toMatchObject({ inner: true, corners: true });
  expect(f3.outer).toBeGreaterThan(f2.outer);

  // Kopfband: je Attribut ein Segment in seiner Farbe mit seinem Namen; bei drei Attributen eine Zeile über allen
  const bg = (l: Locator) => l.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  await expect(slot(3).locator('.seg')).toHaveText(['KÖRPER']);
  await expect(slot(2).locator('.seg')).toHaveText(['PRÄSENZ', 'VERSTEHEN']);
  expect(new Set(await bg(slot(2).locator('.seg'))).size).toBe(2);
  await expect(slot(1).locator('.seg')).toHaveText(['', '', '']);
  expect(new Set(await bg(slot(1).locator('.seg'))).size).toBe(3);
  await expect(slot(1).locator('.all')).toHaveText('JEDES ATTRIBUT');
  // die Namen passen in ihr Segment
  expect(await slot(2).locator('.seg').evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);

  // Text: kurzer Text in voller Größe; der längste wird höchstens bis 9 px verkleinert und läuft dann unten aus
  const text = (i: number) => slot(i).locator('.tr').evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), cut: el.classList.contains('cut') }));
  expect(await text(3)).toEqual({ size: 10.5, cut: false });
  expect(await text(0)).toEqual({ size: 9, cut: true });
  await expect(slot(0).locator('.tr')).toContainText('zu verwenden.'); // der ganze Text bleibt im Dokument

  // Kartenkörper (5zp): Papierton als Verlauf, Name und Stufe in Serifenschrift, Regeltext in der Systemschrift
  await expect(slot(3).locator('.tcard')).toHaveCSS('background-image', /^linear-gradient/);
  await expect(slot(3).locator('.tn')).toHaveCSS('font-family', /serif$/);
  await expect(slot(3).locator('.tg b')).toHaveCSS('font-family', /serif$/);
  await expect(slot(3).locator('.tr')).toHaveCSS('font-family', /sans-serif$/);

  // ✕ liegt unter dem Kopfband und verdeckt weder die Eckmarke noch den Namen
  await slot(3).hover();
  const rmv = (await slot(3).locator('.rmv').boundingBox())!;
  const head = (await slot(3).locator('.tg').boundingBox())!;
  const name = await slot(3).locator('.tn').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); const q = r.getBoundingClientRect(); return { right: q.right }; });
  expect(rmv.y).toBeGreaterThanOrEqual(head.y + head.height - 0.5);
  expect(rmv.x).toBeGreaterThanOrEqual(name.right);
});

test('Breiter laufende Schrift (anderer Rechner): Namen im Kopfband und „Trumpf wählen“ werden kleiner statt abgeschnitten', async ({ page }) => {
  // stellt eine breitere Systemschrift nach (DejaVu unter Linux, Georgia unter Windows): Laufweite deutlich erhöht,
  // schon vor dem ersten Aufbau der Seite
  await page.addInitScript(() => {
    const wide = () => {
      const style = document.createElement('style');
      // maßvoll: auf einem Rechner, dessen Schrift schon breit läuft (GitHub), muss es mit der kleinsten Größe noch passen
      style.textContent = '.tcard .tg { letter-spacing: 0.16em !important; } .slot .hint { letter-spacing: 0.15em !important; }';
      document.head.append(style);
    };
    if (document.head) wide();
    else document.addEventListener('DOMContentLoaded', wide);
  });
  await ready(page, true);
  await page.keyboard.press('1');
  const slot = (i: number) => sheet1(page).locator(`[data-slot="${i}"]`);
  // Geisterkarte: einzeilig, passt, sichtbar kleiner als ausgemessen, aber nicht unter 9 px
  const hint = slot(0).locator('.hint');
  await slot(0).hover();
  await expect(hint).toHaveText('Trumpf wählen');
  const h = await hint.evaluate((el) => ({ fits: el.scrollWidth <= el.clientWidth && el.getClientRects().length === 1, size: parseFloat(getComputedStyle(el).fontSize) }));
  expect(h.fits).toBe(true);
  expect(h.size).toBeLessThan(13.5);
  expect(h.size).toBeGreaterThanOrEqual(9);
  // Kopfband: ein, zwei und drei Attribute
  const picks: [RegExp, RegExp][] = [[/^Verstehen/, /Anatomie/], [/^Verschiedene/, /Denkzettel/], [/^Verschiedene/, /Stresstest/]];
  for (const [i, [tab, name]] of picks.entries()) {
    await slot(i).click();
    await pickTrump(page, 'Freie Wahl', tab, name);
    await expect(slot(i).locator('.tcard')).toHaveCount(1);
    expect(await slot(i).locator('.seg, .all').evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth)), `Feld ${i}`).toBe(true);
  }
  // wirklich verkleinert, also war die Probe breit genug
  expect(await slot(1).locator('.seg').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(7.2);
});

test('Trumpf-Großansicht (5zq): festes Format 5:7, passt ins Fenster, auch der längste Text steht ganz da', async ({ page }) => {
  await page.keyboard.press('1');
  const slot = (i: number) => sheet1(page).locator(`[data-slot="${i}"]`);
  // die drei längsten Texte (316, 259, 258 Zeichen) und der längste Name (zweizeilig)
  const picks: [RegExp, RegExp][] = [[/^Verstehen/, /Schreib das auf!/], [/^Verstehen/, /Eine Frage der Logik/], [/^Verschiedene/, /Sprechende Tote/], [/^Verschiedene/, /Historischer Positivismus/]];
  for (const [i, [tab, name]] of picks.entries()) {
    await slot(i).click();
    await pickTrump(page, 'Freie Wahl', tab, name);
    await expect(slot(i).locator('.tcard')).toHaveCount(1);
  }
  const big = page.locator('.big .tcard');
  const sizes: number[] = [];
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(viewport);
    for (const i of [0, 1, 2, 3]) {
      await page.mouse.move(5, 5);
      await slot(i).click(); // heftet die Großansicht an
      await expect(big).toHaveCount(1);
      const b = (await big.boundingBox())!;
      expect(b.width / b.height).toBeCloseTo(5 / 7, 2);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
      const text = await big.locator('.tr').evaluate((el) => ({ fits: el.scrollHeight <= el.clientHeight + 1, size: parseFloat(getComputedStyle(el).fontSize), grown: el.closest('.tcard')!.classList.contains('grow') }));
      expect(text.fits).toBe(true);
      expect(text.grown).toBe(false);
      expect(text.size).toBeGreaterThanOrEqual(19); // nie kleiner als die alte feste Größe
      sizes.push(b.width);
      await page.keyboard.press('Escape');
      await expect(big).toHaveCount(0);
    }
  }
  expect(sizes[0]).toBe(420);
  expect(sizes[4]).toBeLessThan(420); // im kleinen Fenster begrenzt die Höhe die Breite
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
  for (const players of [4, 2]) {
    await setPlayers(page, players);
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
