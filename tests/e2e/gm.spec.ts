// SL-Funktionen im lokalen Betrieb (Schritt 3c).

import { expect, test } from '@playwright/test';
import { dragFromTo, expectCount, openMenuAndClick, ready, zoneCenter } from './helpers';

test.beforeEach(async ({ page }) => ready(page));

test('Expedition: vier Tabellen, einzeln neu würfelbar, bleibt nach Neuladen', async ({ page }) => {
  await page.getByRole('button', { name: 'Expedition starten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Expedition starten' });
  await expect(dialog.locator('.row')).toHaveCount(4);
  await expect(dialog).toContainText('Diese Expedition führt euch …');
  const first = await dialog.locator('.row b').first().textContent();
  for (let i = 0; i < 5; i++) await dialog.getByRole('button', { name: 'neu' }).nth(3).click();
  await expect(dialog.locator('.row b').first()).toHaveText(first!);
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  await expect(dialog).toHaveCount(0);
  await ready(page, true);
  await page.getByRole('button', { name: 'Expedition starten' }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition starten' }).locator('.row')).toHaveCount(4);
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
  await page.keyboard.press('3');
  const name = page.locator('[data-sheet=seat3] [data-field=name]');
  await name.fill('Ida');
  await name.press('Enter');
  await page.keyboard.press('0');
  await page.getByRole('combobox').selectOption('2');
  await expect(page.locator('[data-sheet=seat3]')).toHaveCount(0);
  await expect(page.getByTitle('Ich bin Spieler 3')).toHaveCount(0);
  await page.getByRole('combobox').selectOption('4');
  await expect(page.locator('[data-sheet=seat3] [data-field=name]')).toHaveValue('Ida');
});

test('Zurücksetzen: Karten auf Startplätze; Charaktere nur mit Häkchen', async ({ page }) => {
  await openMenuAndClick(page, 'DECK', 'Ziehen');
  await expectCount(page, 'ABLAGE', 1);
  await page.keyboard.press('1');
  const name = page.locator('[data-sheet=seat1] [data-field=name]');
  await name.fill('Ida');
  await name.press('Enter');
  await page.keyboard.press('0');

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
  await expect(page.locator('[data-card][style*="rotate(90deg)"]')).toHaveCount(1); // frei liegende Karten sind gedreht
  await expectCount(page, 'DECK', 26);
  const inside = async () => {
    const s = (await page.locator('[data-sheet=seat2]').boundingBox())!;
    const cards = await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })));
    return cards.some((c) => c.x > s.x && c.x < s.x + s.width && c.y > s.y && c.y < s.y + s.height);
  };
  expect(await inside()).toBe(true);
  await page.keyboard.press('2');
  await expect.poll(inside).toBe(true);
});
