// SL-Funktionen im lokalen Betrieb (Schritt 3c).

import { expect, test } from '@playwright/test';
import { dragFromTo, expectCount, fromMenu, nameCharacter, openMenuAndClick, ready, resetTable, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

test('Expedition: vier Tabellen; „neu“ würfelt nur die eigene Zeile; Esc schließt', async ({ page }) => {
  // Protokoll vorher öffnen: Daran sieht der Test, wann ein Ereignis angekommen ist
  await fromMenu(page, 'Protokoll');
  const logged = page.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: 'Expedition:' });
  await page.getByRole('button', { name: 'Expedition starten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition starten' });
  const rows = dialog.locator('.row b');
  await expect(rows).toHaveCount(4);
  await expect(dialog).toContainText('Diese Expedition führt euch …');
  const before = await rows.allTextContents();
  await expect(logged).toHaveCount(1);
  await dialog.getByRole('button', { name: 'neu', exact: true }).last().click();
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
  await expect(dialog.locator('.word small').first()).toHaveText(/^(Herz|Pik|Kreuz) (\d+|B|D|K|A)$/);
  await dialog.getByRole('button', { name: 'Neu ziehen' }).click();
  await expect(dialog.locator('.word')).toHaveCount(2);
});

test('Spielerzahl blendet Bögen und Dock-Knöpfe aus, nichts geht verloren', async ({ page }) => {
  await nameCharacter(page, 'seat3', 'Ida');
  await page.getByRole('combobox').selectOption('2');
  await expect(page.locator('[data-sheet=seat3]')).toHaveCount(0);
  await expect(page.getByTitle('Ich bin Spieler 3')).toHaveCount(0);
  await page.getByRole('combobox').selectOption('4');
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

test('Einstellungen: Rechte der Spieler und Automatik zur Laufzeit, bleiben nach dem Neuladen', async ({ page }) => {
  await fromMenu(page, 'Einstellungen');
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  const free = dialog.getByRole('combobox', { name: 'Trumpf frei wählen (ohne Regelprüfung)' });
  await expect(free).toHaveValue('deny');
  await free.selectOption('allow');
  await expect(free).toHaveValue('allow');
  const damage = dialog.getByRole('checkbox', { name: /Schaden automatisch/ });
  await expect(damage).toBeChecked();
  await damage.uncheck();
  // Das Kästchen springt sofort um, der Stand erst nach dem Speichern: neu öffnen zeigt den Stand
  await page.keyboard.press('Escape');
  await fromMenu(page, 'Einstellungen');
  await expect(damage).not.toBeChecked();

  await page.reload();
  await ready(page);
  await fromMenu(page, 'Einstellungen');
  await expect(free).toHaveValue('allow');
  await expect(damage).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' }).click();
  await expect(free).toHaveValue('deny');
  await expect(dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' })).toBeDisabled();
});

test('Sicherung: nach versehentlichem Zurücksetzen wiederherstellen (A34)', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await nameCharacter(page, 'seat1', 'Ida');
  await resetTable(page, true);
  await expectCount(page, 'ABLAGE', 0);

  await fromMenu(page, 'Einstellungen');
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
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
  await fromMenu(page, 'Einstellungen');
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
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
  await page.getByRole('button', { name: 'Mischen', exact: true }).click(); // Menü bleibt offen
  await expectCount(page, 'ABLAGE', 0);
  await fromMenu(page, 'Protokoll');
  const log = page.getByRole('list', { name: 'Protokoll' });
  await expect(log.locator('li').first()).toContainText('Gemischt: DECK');
  await expect(log.locator('li').nth(1)).toContainText('Aufgedeckt:');
  // bleibt beim Weiterspielen offen; der Tisch rückt zur Seite
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click(); // Stapelmenü ist noch offen
  await expect(log.locator('li')).toHaveCount(3);
  const column = (await page.locator('aside.log').boundingBox())!;
  await expect.poll(async () => { const b = (await page.locator('.board').boundingBox())!; return b.x + b.width; }).toBeLessThanOrEqual(column.x + 1);
  await ready(page, true);
  await expect(log.locator('li')).toHaveCount(3);
  await page.locator('aside.log').getByRole('button', { name: 'Schließen' }).click();
  await ready(page, true);
  await expect(log).toHaveCount(0);
});

test('Menü oben rechts: nur der Knopf, Einträge der SL, Klick daneben schließt', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const button = page.getByRole('button', { name: 'Menü' });
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
  await expect(page.locator('.items button')).toHaveText(['Mitspieler einladen', 'Einstellungen', 'Protokoll']);
  await page.locator('.panel').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('.items')).toHaveCount(0);
});
