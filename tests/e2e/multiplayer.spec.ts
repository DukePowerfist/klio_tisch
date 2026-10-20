// Mehrspielerbetrieb über echte WebRTC-Verbindungen (Trystero/Nostr).
// Braucht Internet und öffentliche Vermittlungsdienste; läuft daher nur mit E2E_NETWORK=1.

import { expect, test } from '@playwright/test';
import { expectCount, makePng, nameCharacter, openMenuAndClick, ready, setField } from './helpers';

test.skip(!process.env.E2E_NETWORK, 'nur mit E2E_NETWORK=1 (echte Verbindung)');
test.setTimeout(90_000);

test('SL lädt ein, Spieler nimmt Platz 2, beide sehen dieselben Züge', async ({ browser }) => {
  const gm = await (await browser.newContext()).newPage();
  await ready(gm);
  await gm.getByRole('button', { name: 'Mitspieler einladen' }).click();
  await expect(gm.getByText(/Raum offen/)).toBeVisible();
  const link = gm.url();
  expect(link).toMatch(/#[\w-]{22}\.[\w-]{22}$/);

  const player = await (await browser.newContext()).newPage();
  await player.goto(link);
  const join = player.getByRole('dialog', { name: 'Platz wählen' });
  await expect(join).toBeVisible({ timeout: 60_000 });
  await expect(gm.getByText('Raum offen · 1 verbunden')).toBeVisible();
  await join.getByRole('textbox').fill('Ida');
  await join.getByRole('button', { name: /^Spieler 2/ }).click();
  await expect(player.getByText('Spieler 2', { exact: true })).toBeVisible();
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
  await expect(player.getByText('Spieler 2', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(player.getByRole('dialog', { name: 'Platz wählen' })).toHaveCount(0);
  // Mauszeiger mit Namen (8.3)
  await player.mouse.move(400, 300);
  await player.mouse.move(420, 320, { steps: 5 });
  await expect(gm.locator('.cursor', { hasText: 'Ida' })).toBeVisible();

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
  await gm.getByRole('button', { name: 'Raum …' }).click();
  const room = gm.getByRole('dialog', { name: 'Plätze und Einladungslink' });
  await expect(room.getByText('verbunden', { exact: true })).toBeVisible();
  await room.getByRole('button', { name: 'Freigeben' }).click();
  await expect(player.getByRole('dialog', { name: 'Platz wählen' })).toBeVisible();
  await expect(room.getByText('frei', { exact: true })).toHaveCount(4);

  // Link erneuern: der alte gilt nicht mehr
  await room.getByRole('button', { name: 'Link erneuern' }).click();
  await room.getByRole('button', { name: 'Erneuern' }).click();
  await expect.poll(() => gm.url()).not.toBe(link);
  await expect(player.getByText('Warte auf Spielleitung …')).toBeVisible({ timeout: 30_000 });
});

