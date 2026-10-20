// Mehrspielerbetrieb über echte WebRTC-Verbindungen (Trystero/Nostr).
// Braucht Internet und öffentliche Vermittlungsdienste; läuft daher nur mit E2E_NETWORK=1.

import { expect, test, type Page } from '@playwright/test';
import { expectCount, fromMenu, makePng, menuEntries, nameCharacter, openMenuAndClick, ready, setField, zoneCenter } from './helpers';

test.skip(!process.env.E2E_NETWORK, 'nur mit E2E_NETWORK=1 (echte Verbindung)');
test.setTimeout(90_000);

/** Punkt innerhalb eines Rechtecks (Bildschirmkoordinaten) */
const inBox = (p: { x: number; y: number } | null, r: { x: number; y: number; width: number; height: number }) =>
  !!p && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Spieler sitzt auf Platz 2: sein Bogen ist beschreibbar (Rechte, 9.3) */
const seated = (page: Page, timeout = 5_000) => expect(page.locator('[data-sheet=seat2] [data-field=name]')).toBeEditable({ timeout });

test('SL lädt ein, Spieler nimmt Platz 2, beide sehen dieselben Züge', async ({ browser }) => {
  const gm = await (await browser.newContext()).newPage();
  await ready(gm);
  await fromMenu(gm, 'Mitspieler einladen');
  await expect(gm.locator('[data-health=ok]')).toBeVisible();
  const link = gm.url();
  expect(link).toMatch(/#[\w-]{22}\.[\w-]{22}$/);

  const player = await (await browser.newContext()).newPage();
  await player.goto(link);
  const join = player.getByRole('dialog', { name: 'Platz wählen' });
  await expect(join).toBeVisible({ timeout: 60_000 });
  await expect(gm.locator('.menu .count')).toHaveText('1');
  await join.getByRole('textbox').fill('Ida');
  await join.getByRole('button', { name: /^Spieler 2/ }).click();
  await seated(player);
  await expect(player.locator('[data-health=ok]')).toBeVisible();
  // Menü je Rolle (10): Spieler nur Protokoll, SL Raum, Einstellungen, Protokoll
  expect(await menuEntries(player)).toEqual(['Protokoll']);
  expect(await menuEntries(gm)).toEqual(['Link kopieren', 'Raum …', 'Einstellungen', 'Protokoll']);
  // Spieler startet in seiner Rollenansicht
  await expect.poll(async () => (await player.locator('[data-sheet=seat2]').boundingBox())!.x).toBeLessThan(50);
  await expect(gm.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('');

  // Spieler zieht eine Karte, SL sieht sie
  await player.keyboard.press('0');
  await openMenuAndClick(player, 'DECK', 'Ziehen');
  await expectCount(gm, 'ABLAGE', 1);
  // SL würfelt Orakel, Spieler sieht das Ergebnis, aber keinen Knopf zum Neuziehen
  await gm.getByRole('button', { name: 'Orakel', exact: true }).click();
  await expect(player.getByRole('dialog', { name: 'Orakel' })).toBeVisible();
  await expect(player.getByRole('dialog', { name: 'Orakel' }).getByRole('button', { name: 'Neu ziehen' })).toHaveCount(0);
  // Spieler hat keine SL-Leiste
  await expect(player.getByRole('button', { name: 'Expedition starten' })).toHaveCount(0);

  // Neu laden: derselbe Platz kommt von selbst zurück
  await player.reload();
  await seated(player, 60_000);
  await expect(player.getByRole('dialog', { name: 'Platz wählen' })).toHaveCount(0);
  // Mauszeiger mit Namen (8.3)
  await player.mouse.move(400, 300);
  await player.mouse.move(420, 320, { steps: 5 });
  await expect(gm.locator('.cursor', { hasText: 'Ida' })).toBeVisible();

  // Gezogene Karte folgt bei der SL dem Zeiger des Spielers, abgelegt liegt sie am Ziel (8.3, 5b)
  await player.keyboard.press('0');
  const deck = await zoneCenter(player, 'DECK');
  const discard = await zoneCenter(player, 'ABLAGE');
  await player.mouse.move(deck.x, deck.y);
  await player.mouse.down();
  await player.mouse.move(deck.x - 60, deck.y - 40, { steps: 6 });
  const ghost = gm.locator('.card.marked');
  await expect(ghost).toHaveCount(1);
  const x1 = (await ghost.boundingBox())!.x;
  await player.mouse.move(deck.x - 160, deck.y - 40, { steps: 6 });
  await expect.poll(async () => (await ghost.boundingBox())!.x).toBeLessThan(x1 - 50);
  // gegriffen in der Mitte: die Mitte der Karte liegt unter dem Zeiger (gleiche Ansicht und Fenstergröße)
  await expect.poll(async () => { const b = (await ghost.boundingBox())!; return Math.abs(b.x + b.width / 2 - (deck.x - 160)); }).toBeLessThan(8);
  await player.mouse.move(discard.x, discard.y, { steps: 6 });
  await player.mouse.up();
  await expectCount(gm, 'ABLAGE', 2);
  await expect(ghost).toHaveCount(0);

  // Andere Ansicht (8.3): Spieler in der Rollenansicht, SL in der Draufsicht; Zeiger und gezogene Karte
  // stehen bei der SL über demselben Stapel, obwohl die Stapel dort woanders liegen
  await player.keyboard.press('2');
  await player.waitForTimeout(500); // Ansicht gleitet
  const rDeck = await zoneCenter(player, 'DECK');
  const rDiscard = await zoneCenter(player, 'ABLAGE');
  const gDeck = (await zoneCenter(gm, 'DECK')).box;
  const gDiscard = (await zoneCenter(gm, 'ABLAGE')).box;
  const cursor = gm.locator('.cursor', { hasText: 'Ida' });
  await player.mouse.move(rDeck.x, rDeck.y, { steps: 3 });
  await expect.poll(async () => inBox(await cursor.boundingBox(), gDeck)).toBe(true);
  await player.mouse.down();
  await player.mouse.move(rDiscard.x, rDiscard.y, { steps: 6 });
  await expect.poll(async () => { const b = await ghost.boundingBox(); return inBox(b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }, gDiscard); }).toBe(true);
  await player.mouse.up();
  await expectCount(gm, 'ABLAGE', 3);
  await player.keyboard.press('0');

  // Angewählter Stapel ist bei der SL in der Farbe des Spielers umrandet, bis das Menü zu ist
  const hard = await zoneCenter(player, 'SCHWIERIG');
  await player.mouse.click(hard.x, hard.y);
  await expect(gm.locator('.zone.marked', { hasText: 'SCHWIERIG' })).toBeVisible();
  await player.mouse.move(5, 5); // Maus weg vom Tisch: Markierung bleibt
  await expect(gm.locator('.zone.marked', { hasText: 'SCHWIERIG' })).toBeVisible();
  // Menü schließen (zweiter Klick, langsamer als ein Doppelklick): Markierung verschwindet
  await player.waitForTimeout(400);
  await player.mouse.click(hard.x, hard.y);
  await expect(gm.locator('.zone.marked')).toHaveCount(0);
  // anderer Stapel: wieder markiert
  await openMenuAndClick(player, 'DECK', 'Ziehen');
  await expect(gm.locator('.zone.marked')).toHaveCount(1);
  await expect(gm.locator('.zone.marked', { hasText: 'DECK' })).toBeVisible();
  // wer sich trennt, dessen Markierung verschwindet
  await player.reload();
  await expect(gm.locator('.zone.marked')).toHaveCount(0, { timeout: 30_000 });
  await seated(player, 60_000);

  // Foto vom Spieler kommt bei der SL an (8.4)
  await player.locator('[data-sheet=seat2] input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(player) });
  await expect(gm.locator('[data-sheet=seat2] .photo')).toHaveAttribute('style', /blob:/);

  await gm.keyboard.press('Escape'); // Orakel schließen

  // Textfeld: Spieler trägt ein, SL überschreibt; der Spieler bekommt einen kurzen Hinweis (8.2)
  await setField(player, 'seat2', 'name', 'Ida');
  await expect(gm.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('Ida');
  await nameCharacter(gm, 'seat2', 'Ida Weber');
  await expect(player.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('Ida Weber');
  await expect(player.getByText(/von jemand anderem geändert/)).toBeVisible();

  // SL gibt den Platz frei: Spieler ist wieder Zuschauer und kann neu wählen
  await fromMenu(gm, 'Raum …');
  const room = gm.getByRole('dialog', { name: 'Plätze und Einladungslink' });
  await expect(room.getByText('verbunden', { exact: true })).toBeVisible();
  await room.getByRole('button', { name: 'Freigeben' }).click();
  await expect(player.getByRole('dialog', { name: 'Platz wählen' })).toBeVisible();
  await expect(room.getByText('frei', { exact: true })).toHaveCount(4);
  await player.getByRole('button', { name: 'Nur zuschauen' }).click();
  expect(await menuEntries(player)).toEqual(['Platz wählen', 'Protokoll']);

  // Link erneuern: der alte gilt nicht mehr
  await room.getByRole('button', { name: 'Link erneuern' }).click();
  await room.getByRole('button', { name: 'Erneuern' }).click();
  await expect.poll(() => gm.url()).not.toBe(link);
  // Störung ohne Öffnen des Menüs sichtbar, Punkt rot (10)
  await expect(player.getByRole('alert').getByText('Warte auf Spielleitung …')).toBeVisible({ timeout: 30_000 });
  await expect(player.locator('.menu [data-health=trouble]')).toBeVisible();
});

