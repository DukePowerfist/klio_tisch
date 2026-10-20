// SL-Funktionen im lokalen Betrieb (Schritt 3c).

import { expect, test } from '@playwright/test';
import { dragFromTo, expectCount, nameCharacter, openMenuAndClick, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

test('Expedition: vier Tabellen; „neu“ würfelt nur die eigene Zeile; Esc schließt', async ({ page }) => {
  await page.getByRole('button', { name: 'Expedition starten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition starten' });
  const rows = dialog.locator('.row b');
  await expect(rows).toHaveCount(4);
  await expect(dialog).toContainText('Diese Expedition führt euch …');
  const before = await rows.allTextContents();
  await dialog.getByRole('button', { name: 'neu', exact: true }).last().click();
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

  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  await dialog.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expectCount(page, 'ABLAGE', 0);
  await expectCount(page, 'DECK', 27);
  await expect(name).toHaveValue('Ida');

  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Zurücksetzen' }).click();
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
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  const free = dialog.getByRole('combobox', { name: 'Trumpf frei wählen (ohne Regelprüfung)' });
  await expect(free).toHaveValue('deny');
  await free.selectOption('allow');
  await expect(free).toHaveValue('allow');
  const damage = dialog.getByRole('checkbox', { name: /Schaden automatisch/ });
  await expect(damage).toBeChecked();
  await damage.uncheck();
  await expect(damage).not.toBeChecked();

  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(free).toHaveValue('allow');
  await expect(damage).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' }).click();
  await expect(free).toHaveValue('deny');
  await expect(dialog.getByRole('button', { name: 'Voreinstellung wiederherstellen' })).toBeDisabled();
});
