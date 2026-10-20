// Mehrspielerbetrieb über echte WebRTC-Verbindungen (Trystero/Nostr).
// Braucht Internet und öffentliche Vermittlungsdienste; läuft daher nur mit E2E_NETWORK=1.

import { expect, test } from '@playwright/test';
import { expectCount, openMenuAndClick, ready } from './helpers';

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
});
