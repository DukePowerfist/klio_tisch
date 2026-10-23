// SL-Funktionen im lokalen Betrieb (Schritt 3c).

import { expect, test, type Locator } from '@playwright/test';
import { dragFromTo, expectCount, fixRolls, fromMenu, LONGEST, menuButton, nameCharacter, openMenuAndClick, openSettings, ready, resetTable, setPlayers, shuffleBack, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

test('Expedition: vier Tabellen; „Neu“ würfelt nur die eigene Zeile; Esc schließt', async ({ page }) => {
  // Protokoll vorher öffnen: Daran sieht der Test, wann ein Ereignis angekommen ist
  await fromMenu(page, 'Protokoll');
  const logged = page.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: 'Expedition:' });
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition' });
  const rows = dialog.locator('.row .value');
  await expect(rows).toHaveCount(4);
  await expect(dialog).toContainText('Diese Expedition führt euch …');
  const before = await rows.allTextContents();
  await expect(logged).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Neu würfeln: Doch ihr müsst schnell handeln, denn …' }).click();
  // erst weiter, wenn das Ereignis da ist (es öffnet das Fenster bei allen, also auch nach Esc wieder)
  await expect(logged).toHaveCount(2);
  await expect.poll(async () => (await rows.allTextContents()).slice(0, 3)).toEqual(before.slice(0, 3));
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Orakel: zwei Begriffe mit Karte (Herz, Pik oder Kreuz)', async ({ page }) => {
  await page.getByRole('button', { name: 'Orakel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Orakel' });
  await expect(dialog.locator('.word')).toHaveCount(2);
  await expect(dialog.locator('.word .card').first()).toHaveText(/^(Herz|Pik|Kreuz) (\d+|B|D|K|A)$/);
  await dialog.getByRole('button', { name: 'Neu ziehen' }).click();
  await expect(dialog.locator('.word')).toHaveCount(2);
});

// ---------- Ergebnisfenster im Stil der Einstellungen (5t, 10.6) ----------

test('Ergebnisfenster: Kopf mit Titel, Hauptknopf und ×, vier verschieden benannte „Neu“', async ({ page }) => {
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition' });
  await expect(dialog.locator('h2')).toHaveText('Expedition');
  await expect(dialog.locator('.row button')).toHaveText(['Neu', 'Neu', 'Neu', 'Neu']);
  const names = await dialog.locator('.row button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  expect(new Set(names).size).toBe(4);
  expect(names[1]).toBe('Neu würfeln: Bekannt für …');
  await expect(dialog.locator('header').getByRole('button')).toHaveText(['Alles neu', '']);
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toHaveCount(1);
  // × schließt, Klick daneben auch
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Orakel', exact: true }).click();
  const oracle = page.getByRole('dialog', { name: 'Orakel' });
  await expect(oracle.locator('h2')).toHaveText('Orakel');
  await expect(oracle.locator('header').getByRole('button')).toHaveText(['Neu ziehen', '']);
  await page.mouse.click(5, 5);
  await expect(oracle).toHaveCount(0);
});

test('Ergebnisfenster: etwa 560 px breit; längste Einträge ohne Bildlauf, im kleinen Fenster scrollt nur der Inhalt', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await fixRolls(page, LONGEST);
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition' });
  await expect(dialog.locator('.row .value').nth(2)).toHaveText(/^ihr einen Ort erreichen wollt/);
  const body = dialog.locator('.body');
  const scrolls = () => body.evaluate((b) => b.scrollHeight > b.clientHeight);
  expect((await dialog.boundingBox())!.width).toBeCloseTo(560, -1);
  expect(await scrolls()).toBe(false);
  await page.setViewportSize({ width: 1600, height: 900 });
  expect(await scrolls()).toBe(false);
  // kleines Fenster: nur der Inhalt scrollt, Kopf und Hauptknopf bleiben im Bild
  await page.setViewportSize({ width: 800, height: 360 });
  await expect.poll(scrolls).toBe(true);
  for (const part of [dialog.getByRole('button', { name: 'Schließen' }), dialog.getByRole('button', { name: 'Alles neu' })]) {
    const b = (await part.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(360);
  }
  const box = (await dialog.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(360);
});

test('Ergebnisfenster: öffnet mittig, danach bleibt die Oberkante fest und es wächst nur nach unten', async ({ page }) => {
  await fixRolls(page, [8, 7, 1, 4]);
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition' });
  await expect(dialog.locator('.row .value').first()).toHaveText('auf das offene Meer.');
  const height = page.viewportSize()!.height;
  const open = (await dialog.boundingBox())!;
  expect(Math.abs(open.y - (height - open.y - open.height))).toBeLessThan(2);
  const header = (await dialog.locator('header').boundingBox())!;
  await fixRolls(page, [LONGEST[2]!]);
  await dialog.getByRole('button', { name: 'Neu würfeln: Ihr seid hier, weil …' }).click();
  await expect(dialog.locator('.row .value').nth(2)).toHaveText(/^ihr einen Ort erreichen wollt/);
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBeGreaterThan(open.height + 20);
  expect((await dialog.boundingBox())!.y).toBe(open.y);
  expect((await dialog.locator('header').boundingBox())!).toEqual(header);
  expect(await dialog.locator('.body').evaluate((b) => b.scrollHeight > b.clientHeight)).toBe(false);
});

test('Ergebnisfenster im kleinen Fenster: passt es unten nicht mehr, rückt es nur so weit wie nötig nach oben, ohne Bildlauf', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await fixRolls(page, [8, 7, 1, 4]);
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition' });
  await expect(dialog.locator('.row .value').first()).toHaveText('auf das offene Meer.');
  const open = (await dialog.boundingBox())!;
  await fixRolls(page, LONGEST);
  await dialog.getByRole('button', { name: 'Alles neu' }).click();
  await expect(dialog.locator('.row .value').nth(2)).toHaveText(/^ihr einen Ort erreichen wollt/);
  await expect.poll(async () => (await dialog.boundingBox())!.height).toBeGreaterThan(open.height + 20);
  const grown = (await dialog.boundingBox())!;
  expect(grown.y).toBeLessThanOrEqual(open.y);
  expect(grown.y).toBeGreaterThanOrEqual(12);
  expect(grown.y + grown.height).toBeLessThanOrEqual(600 - 12 + 0.5);
  expect(await dialog.locator('.body').evaluate((b) => b.scrollHeight > b.clientHeight)).toBe(false);
});

test('Ergebnisfenster: Fokus beim Öffnen auf dem ×, Enter schließt ohne zu würfeln; ein weiterer Wurf lässt den Fokus', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  const logged = page.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: 'Expedition:' });
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition' });
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(logged).toHaveCount(1);
  // erneut öffnen, Fokus auf „Neu“ in Zeile 2, würfeln: der Fokus bleibt dort
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  await expect(logged).toHaveCount(2);
  const second = dialog.getByRole('button', { name: 'Neu würfeln: Bekannt für …' });
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(logged).toHaveCount(3);
  await expect(second).toBeFocused();
  // Wechsel zum Orakel: neues Fenster, Fokus wieder aufs ×
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Orakel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Orakel' }).getByRole('button', { name: 'Schließen' })).toBeFocused();
});

test('andere Fenster unverändert (5t, Q1): Knöpfe mit Grund und Rahmen, × der Einstellungen ohne', async ({ page }) => {
  const look = (l: Locator) => l.evaluate((b) => { const c = getComputedStyle(b); return { bg: c.backgroundColor, border: c.borderTopStyle }; });
  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  const reset = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  expect(await look(reset.getByRole('button').first())).toEqual({ bg: 'rgb(44, 90, 71)', border: 'solid' });
  await page.keyboard.press('Escape');
  await openSettings(page, 'Darstellung');
  const settings = page.getByRole('dialog', { name: 'Einstellungen' });
  expect(await look(settings.locator('header .close'))).toEqual({ bg: 'rgba(0, 0, 0, 0)', border: 'none' });
});

test('Spielerzahl blendet Bögen und Dock-Knöpfe aus, nichts geht verloren', async ({ page }) => {
  await nameCharacter(page, 'seat3', 'Ida');
  await setPlayers(page, 2);
  await expect(page.locator('[data-sheet=seat3]')).toHaveCount(0);
  await expect(page.getByTitle('Ich bin Spieler 3')).toHaveCount(0);
  await setPlayers(page, 4);
  await expect(page.locator('[data-sheet=seat3] [data-field=name]')).toHaveValue('Ida');
});

test('Zurücksetzen: Karten auf Startplätze; Charaktere nur mit Häkchen', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expectCount(page, 'ABLAGE', 1);
  await nameCharacter(page, 'seat1', 'Ida');
  const name = page.locator('[data-sheet=seat1] [data-field=name]');

  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expectCount(page, 'ABLAGE', 1);

  await resetTable(page);
  await expectCount(page, 'ABLAGE', 0);
  await expectCount(page, 'DECK', 27);
  await expect(name).toHaveValue('Ida');

  await resetTable(page, true);
  await expect(name).toHaveValue('');
});

test('Frei liegende Karte am Bogen folgt dem Bogen in die Rollenansicht (A32)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const sheet2 = (await page.locator('[data-sheet=seat2]').boundingBox())!;
  // unten am Bogen, außerhalb seiner Zonen: frei, Anker = Bogen 2
  await dragFromTo(page, deck, { x: sheet2.x + sheet2.width * 0.45, y: sheet2.y + sheet2.height * 0.93 });
  await expectCount(page, 'DECK', 26);
  // Mitte der frei liegenden Karte liegt auf Bogen 2
  const free = page.locator('[data-card][style*="rotate(90deg)"]');
  const inside = async () => {
    const s = (await page.locator('[data-sheet=seat2]').boundingBox())!;
    const c = (await free.boundingBox())!; // frei liegende Karten sind gedreht
    const [x, y] = [c.x + c.width / 2, c.y + c.height / 2];
    return x > s.x && x < s.x + s.width && y > s.y && y < s.y + s.height;
  };
  expect(await inside()).toBe(true);
  await page.keyboard.press('2');
  await expect.poll(inside).toBe(true);
});

test('Einstellungen: Meldung bei Kommen und Gehen in eigener Gruppe auf „Tisch“, an, bleibt aus nach dem Neuladen (5l, 5u)', async ({ page }) => {
  const dialog = await openSettings(page, 'Tisch');
  const group = dialog.getByRole('region', { name: 'Meldungen' });
  const notice = group.getByRole('switch', { name: 'Meldung bei Kommen und Gehen' });
  await expect(notice).toBeChecked();
  await expect(group).toContainText('Das Protokoll trägt es immer ein.');
  await notice.uncheck();
  // Das Kästchen springt sofort um, der Stand erst nach dem Speichern (wie im Test darunter): erst neu öffnen,
  // dann neu laden; sonst lädt die Seite manchmal vor dem Speichern neu
  await page.keyboard.press('Escape');
  await fromMenu(page, 'Einstellungen');
  await expect(notice).not.toBeChecked();
  await ready(page, true);
  await openSettings(page, 'Tisch');
  await expect(notice).not.toBeChecked();
  // die Reaktion daneben bleibt unberührt
  await expect(dialog.getByRole('switch', { name: /Schaden automatisch/ })).toBeChecked();
});

test('Einstellungen: Rechte der Spieler und Automatik zur Laufzeit, bleiben nach dem Neuladen', async ({ page }) => {
  const dialog = await openSettings(page, 'Rechte der Spieler');
  const free = dialog.getByRole('combobox', { name: 'Trumpf frei wählen (ohne Regelprüfung)' });
  await expect(free).toHaveValue('deny');
  await free.selectOption('allow');
  await expect(free).toHaveValue('allow');
  await dialog.getByRole('tab', { name: 'Tisch' }).click();
  const damage = dialog.getByRole('switch', { name: /Schaden automatisch/ });
  await expect(damage).toBeChecked();
  await damage.uncheck();
  // Das Kästchen springt sofort um, der Stand erst nach dem Speichern: neu öffnen zeigt den Stand
  // (auf der zuletzt gewählten Seite)
  await page.keyboard.press('Escape');
  await fromMenu(page, 'Einstellungen');
  await expect(damage).not.toBeChecked();

  await ready(page, true);
  await openSettings(page, 'Tisch');
  await expect(damage).not.toBeChecked();
  await dialog.getByRole('tab', { name: 'Rechte der Spieler' }).click();
  await expect(free).toHaveValue('allow');
  await dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' }).click();
  await expect(free).toHaveValue('deny');
  await expect(dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' })).toBeDisabled();
});

test('Einstellungen: Seite „Tisch“ mit Spielerzahl oben, darunter Automatik und Meldungen (5u)', async ({ page }) => {
  const dialog = await openSettings(page, 'Tisch');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Tisch');
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['Automatik', 'Meldungen']);
  await expect(dialog.getByRole('region', { name: 'Automatik' }).getByRole('switch', { name: /Schaden automatisch/ })).toBeVisible();
  // Spielerzahl oben, vor der ersten Überschrift
  const numbers = (await dialog.getByRole('group', { name: 'Spielerzahl' }).boundingBox())!;
  const first = (await dialog.getByRole('heading', { name: 'Automatik' }).boundingBox())!;
  expect(numbers.y).toBeLessThan(first.y);
});

test('Einstellungen: Seitenleiste mit vier Seiten, Kopf mit Seitentitel, × schließt', async ({ page }) => {
  const dialog = await openSettings(page, 'Spielstand');
  await expect(dialog.getByRole('tab')).toHaveText(['Tisch', 'Rechte der Spieler', 'Spielstand', 'Darstellung']);
  await expect(dialog.getByRole('tab', { name: 'Spielstand' })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'Spielstand' })).toBeVisible();
  await expect(dialog.getByRole('tabpanel', { name: 'Spielstand' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Einstellungen: Rechte in Gruppen mit Beschreibung, Schilder zur Reichweite', async ({ page }) => {
  const dialog = await openSettings(page, 'Rechte der Spieler');
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['Karten', 'Bogen', 'Trümpfe und Charakter', 'Spielleitung']);
  await expect(dialog.getByRole('combobox')).toHaveCount(19); // seit 5n mit „Laterne anzünden und löschen“
  await expect(dialog.getByRole('combobox', { name: 'Eigenen Namen und eigene Farbe ändern' })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Karten bewegen' })).toHaveAccessibleDescription(/Bei „nur eigener Bogen“ nichts auf fremde Bögen/);
  await expect(dialog.getByText('gilt für alle', { exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Spielstand' }).click();
  await expect(dialog.getByText('gilt für alle', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('in diesem Browser', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Datei laden …' })).toHaveAccessibleDescription(/Ersetzt den Stand für alle am Tisch/);
});

/** Fokus liegt im Fenster */
const focusInside = (dialog: Locator) => dialog.evaluate((d) => d.contains(document.activeElement));

test('Einstellungen: Größe bleibt beim Seitenwechsel, öffnet auf der zuletzt gewählten Seite', async ({ page }) => {
  const dialog = await openSettings(page, 'Tisch');
  const size = async () => {
    const b = (await dialog.boundingBox())!;
    return [Math.round(b.width), Math.round(b.height)];
  };
  const first = await size();
  for (const tab of ['Rechte der Spieler', 'Spielstand', 'Tisch']) {
    await dialog.getByRole('tab', { name: tab }).click();
    expect(await size()).toEqual(first);
  }
  await dialog.getByRole('tab', { name: 'Rechte der Spieler' }).click();
  await page.keyboard.press('Escape');
  await fromMenu(page, 'Einstellungen');
  await expect(dialog.getByRole('tab', { name: 'Rechte der Spieler' })).toHaveAttribute('aria-selected', 'true');
});

test('Einstellungen per Tastatur: Fokus auf der Seite, Tab bleibt im Fenster, Esc bricht erst die Rückfrage ab', async ({ page }) => {
  await resetTable(page, false);
  const dialog = await openSettings(page, 'Spielstand');
  await page.keyboard.press('Escape');
  await fromMenu(page, 'Einstellungen');
  await expect(dialog.getByRole('tab', { name: 'Spielstand' })).toBeFocused();
  // Tab vorwärts und rückwärts: nie auf den Tisch dahinter
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInside(dialog)).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusInside(dialog)).toBe(true);
  }
  // Seite per Tastatur wählen: Tab bis „Tisch“, Leertaste
  await dialog.getByRole('tab', { name: 'Tisch' }).focus();
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Tisch');
  // Reihenfolge: Seitenleiste, × im Kopf, dann die Zeilen (Spielerzahl ein Tabstopp)
  for (const _ of ['Rechte der Spieler', 'Spielstand', 'Darstellung', 'Schließen', 'Spielerzahl', 'Schalter']) await page.keyboard.press('Tab');
  await expect(dialog.getByRole('switch', { name: /Schaden automatisch/ })).toBeFocused();

  // Rückfrage beim Wiederherstellen: Esc bricht sie ab, das nächste Esc schließt
  await dialog.getByRole('tab', { name: 'Spielstand' }).click();
  await dialog.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await expect(dialog.getByText('Stand für alle ersetzen?')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Stand für alle ersetzen?')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Tab bleibt auch in den übrigen Fenstern (Zurücksetzen)', async ({ page }) => {
  await page.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tisch zurücksetzen?' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInside(dialog)).toBe(true);
  }
});

test('Sicherung: nach versehentlichem Zurücksetzen wiederherstellen (A34)', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await nameCharacter(page, 'seat1', 'Ida');
  await resetTable(page, true);
  await expectCount(page, 'ABLAGE', 0);

  const dialog = await openSettings(page, 'Spielstand');
  await expect(dialog.getByText(/vor dem Zurücksetzen/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Wiederherstellen', exact: true }).click(); // bestätigen
  await expectCount(page, 'ABLAGE', 1);
  await expect(page.locator('[data-sheet=seat1] [data-field=name]')).toHaveValue('Ida');
  await expect(dialog.getByText(/vor dem Wiederherstellen/)).toBeVisible();
});

test('Spielstand als Datei speichern und wieder laden; ungültige Datei wird abgelehnt', async ({ page }) => {
  await nameCharacter(page, 'seat2', 'Ida');
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  const dialog = await openSettings(page, 'Spielstand');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Als Datei speichern' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^klio-tisch-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();

  await page.keyboard.press('Escape');
  await resetTable(page, true);
  await expect(page.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('');

  await fromMenu(page, 'Einstellungen');
  const input = dialog.locator('input[type=file]');
  await input.setInputFiles({ name: 'falsch.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"etwas"}') });
  await expect(dialog.getByText('Diese Datei ist kein gültiger Spielstand des Kartentischs.')).toBeVisible();
  await input.setInputFiles(file);
  await expect(page.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('Ida');
  await expectCount(page, 'ABLAGE', 1);
  await expect(dialog.getByText(/vor dem Laden einer Datei/)).toBeVisible();
  await page.keyboard.press('Escape');
  await fromMenu(page, 'Protokoll');
  await expect(page.getByRole('list', { name: 'Protokoll' }).locator('li').first()).toHaveText(/Spielstand aus einer Datei geladen/);
});

test('Protokoll: Spalte rechts über das Menü, neueste oben, offen oder zu bleibt nach Neuladen', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expectCount(page, 'ABLAGE', 1);
  await shuffleBack(page, 1); // Menü bleibt offen
  await expectCount(page, 'ABLAGE', 0);
  await fromMenu(page, 'Protokoll');
  const log = page.getByRole('list', { name: 'Protokoll' });
  await expect(log.locator('li').first()).toContainText('Gemischt: DECK');
  await expect(log.locator('li').nth(1)).toContainText('Aufgedeckt:');
  // bleibt beim Weiterspielen offen; der Tisch rückt zur Seite (und das Stapelmenü ist dabei zugegangen, 10.2)
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expect(log.locator('li')).toHaveCount(3);
  const column = (await page.locator('aside.log').boundingBox())!;
  await expect.poll(async () => { const b = (await page.locator('.board').boundingBox())!; return b.x + b.width; }).toBeLessThanOrEqual(column.x + 1);
  // der Menüknopf rückt mit und liegt nicht auf der Kopfzeile des Protokolls
  const button = (await menuButton(page).boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(column.x);
  await ready(page, true);
  await expect(log.locator('li')).toHaveCount(3);
  await page.locator('aside.log').getByRole('button', { name: 'Schließen' }).click();
  await ready(page, true);
  await expect(log).toHaveCount(0);
  expect((await menuButton(page).boundingBox())!.x).toBeGreaterThan(column.x);
});

test('Menü oben rechts: nur der Knopf, Einträge der SL, Klick daneben schließt', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const button = menuButton(page);
  await expect(page.locator('.menu [data-health=local]')).toBeVisible();
  // verdeckt weder Namensschild noch Attribute von Spieler 2
  const b = (await button.boundingBox())!;
  for (const target of ['[data-plate=seat2]', '[data-sheet=seat2] [data-field^="attributes."]']) {
    for (const r of await page.locator(target).all()) {
      const o = (await r.boundingBox())!;
      expect(b.x > o.x + o.width || b.x + b.width < o.x || b.y > o.y + o.height || b.y + b.height < o.y, target).toBe(true);
    }
  }
  // Einstellungen nur noch im Menü, nicht in der SL-Leiste
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toHaveCount(0);
  await button.click();
  await expect(page.locator('[data-top-menu] .menu-item')).toHaveText(['Mitspieler einladen', 'Einstellungen', 'Protokoll']);
  await page.locator('.panel').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('[data-top-menu]')).toHaveCount(0);
});

test('SL-Leiste: gleich groß bei jedem Zoom und in großen Fenstern, Knöpfe bis an den Filzrand, Lasche daneben (5s)', async ({ page }) => {
  const bar = page.getByRole('group', { name: 'Spielleitung' });
  /** Größe der Leiste, Abstand der Naht (Ende der Knöpfe) zum rechten Filzrand, Breite der Lasche und Abstand unten, in TP */
  const measure = () =>
    page.evaluate(() => {
      const b = document.querySelector('.ctl')!.getBoundingClientRect();
      const knobs = document.querySelector('#gm-bar')!.getBoundingClientRect();
      const f = document.querySelector('.panel')!.getBoundingClientRect();
      const sc = f.width / 700;
      // Breite nur der Knöpfe: die Lasche ist im Tisch fest breit (der Spalt) und wächst beim Zoomen mit
      return { w: knobs.width, h: b.height, dx: (f.right - knobs.right) / sc, tab: (b.right - f.right) / sc, dy: (f.bottom - b.bottom) / sc };
    });
  await expect(bar).toBeVisible();
  const start = await measure();
  expect(start.h).toBeGreaterThanOrEqual(42);
  expect(Math.abs(start.dx)).toBeLessThan(1);
  expect(start.tab).toBeCloseTo(30, 0);
  expect(start.dy).toBeCloseTo(26, 0);

  const panel = (await page.locator('.panel').boundingBox())!;
  await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
  await page.mouse.wheel(0, -600);
  await expect.poll(async () => Math.abs((await measure()).dx)).toBeLessThan(1);
  const zoomed = await measure();
  expect(zoomed.w).toBeCloseTo(start.w, 0);
  expect(zoomed.h).toBeCloseTo(start.h, 0);
  expect(zoomed.dy).toBeCloseTo(26, 0);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(async () => (await measure()).h).toBeCloseTo(start.h, 0);
});

test('SL-Leiste im kleinen Fenster mit Protokoll: eine Zeile, im Filz, über keinem Stapel (5s)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await fromMenu(page, 'Protokoll');
  await expect(page.locator('aside.log')).toBeVisible();
  const rect = (sel: string) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const bar = await rect('.ctl');
  const knobs = await rect('#gm-bar');
  const felt = await rect('.panel');
  // eine Zeile: Höhe zu Breite wie bei voller Größe (etwa 36 px Knöpfe plus Rand), nicht zwei- oder dreizeilig
  const full = await page.locator('.ctl .menu-item').first().evaluate((e) => (e as HTMLElement).offsetHeight);
  const scaleOf = await page.locator('.ctl').evaluate((e) => e.getBoundingClientRect().width / (e as HTMLElement).offsetWidth);
  expect(bar.b - bar.t).toBeLessThan((full + 20) * scaleOf);
  expect(bar.l).toBeGreaterThanOrEqual(felt.l);
  expect(knobs.r).toBeLessThanOrEqual(felt.r + 1);
  for (const zone of ['progress', 'clubs', 'danger']) {
    const z = await rect(`[data-zone=${zone}]`);
    expect(bar.t >= z.b || bar.r <= z.l || bar.l >= z.r, zone).toBe(true);
  }
});

test('Spielerzahl auf der Seite „Tisch“ (5s): Zahlenreihe mit einem Tabstopp und Pfeiltasten, nicht mehr in der Leiste', async ({ page }) => {
  const bar = page.getByRole('group', { name: 'Spielleitung' });
  await expect(bar.getByRole('button')).toHaveText(['Expedition', 'Orakel', 'Zurücksetzen']);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  const dialog = await openSettings(page, 'Tisch');
  const radios = dialog.getByRole('radio');
  await expect(radios).toHaveCount(4);
  await expect(dialog.getByRole('radio', { name: '4', exact: true })).toBeChecked();
  await expect(dialog.getByRole('group', { name: 'Spielerzahl' })).toBeVisible();
  // Tab vom Knopf „Schließen“ (davor im Fenster) springt auf die gewählte Zahl, Pfeil nach links wählt die nächste
  await dialog.getByRole('button', { name: 'Schließen' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('radio', { name: '4', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('radio', { name: '3', exact: true })).toBeChecked();
  await expect(page.locator('[data-sheet=seat4]')).toHaveCount(0);
  // ein Tabstopp für die ganze Reihe
  await page.keyboard.press('Tab');
  await expect(radios.first()).not.toBeFocused();
  await expect(dialog.getByRole('radio', { name: '2', exact: true })).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-dock^=seat]')).toHaveCount(3);
});

test('SL-Leiste einfahren (5s): nur die Lasche bleibt, außerhalb des Filzes und neben keinem Bogen; bleibt nach dem Neuladen', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Leiste einfahren' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.focus();
  // ohne Bewegung (reduzierte Bewegung) springt sie: sofort weg, keine Animation
  expect(await page.evaluate(() => { (document.activeElement as HTMLElement).click(); return document.querySelector('#gm-bar')?.getAnimations().length ?? 0; })).toBe(0);
  const expand = page.getByRole('button', { name: 'Leiste ausfahren' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(expand).toBeFocused();
  await expect(page.getByRole('group', { name: 'Spielleitung' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expedition', exact: true })).toHaveCount(0);
  await ready(page, true);
  await expect(page.getByRole('group', { name: 'Spielleitung' })).toHaveCount(0);
  /** Lasche rechts außerhalb des Filzes und neben keinem Bogen */
  const outside = async (label: string) => {
    const r = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      const b = box(document.querySelector('.toggle')!);
      const f = box(document.querySelector('.panel')!);
      const sheets = [...document.querySelectorAll('[data-sheet]')].map(box);
      return { left: b.left, right: b.right, felt: f.right, hits: sheets.filter((s) => b.right > s.left && b.left < s.right && b.bottom > s.top && b.top < s.bottom).length };
    });
    expect(r.left, label).toBeGreaterThanOrEqual(r.felt - 1);
    expect(r.hits, label).toBe(0);
  };
  await outside('Draufsicht');
  await page.keyboard.press('1');
  await expect.poll(async () => (await page.locator('[data-sheet=seat1]').boundingBox())!.x).toBeLessThan(50);
  await outside('Rollenansicht');
  await page.keyboard.press('0');
  await page.setViewportSize({ width: 1024, height: 600 });
  await fromMenu(page, 'Protokoll');
  await outside('kleines Fenster mit Protokoll');
  await expand.click();
  await expect(page.getByRole('group', { name: 'Spielleitung' }).getByRole('button')).toHaveText(['Expedition', 'Orakel', 'Zurücksetzen']);
  await ready(page, true);
  await expect(page.getByRole('button', { name: 'Leiste einfahren' })).toBeVisible();
});
