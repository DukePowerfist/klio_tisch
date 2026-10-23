// Mehrspielerbetrieb über echte WebRTC-Verbindungen (Trystero/Nostr).
// Braucht Internet und öffentliche Vermittlungsdienste; läuft daher nur mit E2E_NETWORK=1.

import { expect, test, type Page } from '@playwright/test';
import { expectCount, expectInStage, fromMenu, holdOver, makePng, menuButton, menuEntries, nameCharacter, openMenuAndClick, openRoom, openSettings, ready, setField, zoneCenter } from './helpers';

test.skip(!process.env.E2E_NETWORK, 'nur mit E2E_NETWORK=1 (echte Verbindung)');
test.setTimeout(90_000);

/** Punkt innerhalb eines Rechtecks (Bildschirmkoordinaten) */
const inBox = (p: { x: number; y: number } | null, r: { x: number; y: number; width: number; height: number }) =>
  !!p && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Klassen am Schild und im Dock (11.7): ganzes Wort, nicht `away-fade` */
const AWAY = /(^|\s)away(\s|$)/;
const STILL = /(^|\s)still(\s|$)/;

/** Animationen an Bogen und Schild eines Platzes beobachten (alle 10 ms, je Teil und Eigenschaften einmal);
 *  `seen` liefert sie und beginnt neu. */
async function watchArrival(page: Page, seat: string) {
  await page.evaluate((seat) => {
    const w = window as unknown as { arrival: Set<string> };
    w.arrival = new Set();
    setInterval(() => {
      for (const [part, sel] of [['sheet', `[data-sheet=${seat}]`], ['plate', `[data-plate=${seat}]`]] as const) {
        const el = document.querySelector(sel);
        for (const a of el?.getAnimations() ?? []) {
          if (a instanceof CSSTransition) continue;
          const props = [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k));
          w.arrival.add(`${part}:${props.sort().join(',')}`);
        }
      }
    }, 10);
  }, seat);
  return () => page.evaluate(() => {
    const w = window as unknown as { arrival: Set<string> };
    const seen = [...w.arrival].sort();
    w.arrival.clear();
    return seen;
  });
}

/** Spieler sitzt auf Platz 2: sein Bogen ist beschreibbar (Rechte, 9.3) */
const seated = (page: Page, timeout = 5_000) => expect(page.locator('[data-sheet=seat2] [data-field=name]')).toBeEditable({ timeout });

test('SL lädt ein, Spieler nimmt Platz 2, beide sehen dieselben Züge', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  expect(link).toMatch(/#[\w-]{22}\.[\w-]{22}$/);

  const player = await (await browser.newContext()).newPage();
  await player.goto(link);
  const join = player.getByRole('dialog', { name: 'Platz wählen' });
  await expect(join).toBeVisible({ timeout: 60_000 });
  await expect(gm.locator('.menu > .count')).toHaveText('1');
  await expect(join.getByRole('button', { name: /^Spieler 2/ })).toHaveText(/^Spieler 2\s*frei$/);
  await join.getByRole('textbox').fill('Ida');
  await join.getByRole('button', { name: /^Spieler 2/ }).click();
  await seated(player);
  await expect(player.locator('[data-health=ok]')).toBeVisible();
  // Menü je Rolle (10): Spieler nur Protokoll, SL Raum, Einstellungen, Protokoll
  expect(await menuEntries(player)).toEqual(['Einstellungen', 'Name und Farbe …', 'Protokoll']);
  // ohne Recht nur die eigene Darstellung (5g)
  await openSettings(player, 'Darstellung');
  await expect(player.getByRole('dialog', { name: 'Einstellungen' }).getByRole('tab')).toHaveText(['Darstellung']);
  await player.keyboard.press('Escape');
  expect(await menuEntries(gm)).toEqual(['Link kopieren', 'Raum …', 'Einstellungen', 'Protokoll']);
  // Kopf mit dem Verbindungszustand (5p): SL „Raum offen“ mit Zahl, Spieler „Verbunden“
  await menuButton(gm).click();
  await expect(gm.locator('[data-top-menu] .menu-head')).toHaveText('Raum offen1');
  await expect(gm.locator('[data-top-menu] .menu-head .count')).toHaveText('1');
  await gm.keyboard.press('Escape');
  await menuButton(player).click();
  await expect(player.locator('[data-top-menu] .menu-head')).toHaveText('Verbunden');
  await player.keyboard.press('Escape');
  await expect(player.locator('[data-top-menu]')).toHaveCount(0);
  // Name und Farbe ändern (5e): bei der SL sofort an Schild und Dock; Farben anderer Plätze nicht wählbar
  await fromMenu(player, 'Name und Farbe …');
  const profile = player.getByRole('dialog', { name: 'Name und Farbe' });
  await expect(profile.getByRole('radio', { name: 'Koralle' })).toBeDisabled(); // Platz 1
  await expect(profile.getByRole('radio', { name: 'Himmelblau' })).toHaveAttribute('aria-checked', 'true'); // eigene
  await profile.getByRole('textbox').fill('Ida M.');
  await profile.getByRole('radio', { name: 'Türkis' }).click();
  await profile.getByRole('button', { name: 'Speichern' }).click();
  await expect(profile).toHaveCount(0);
  await expect(gm.locator('[data-dock=seat2]')).toHaveAttribute('style', /who-c-teal/);
  // Schild: Name der Person, freie Plätze mit Hinweis „frei“
  await expect(gm.locator('[data-plate=seat2]')).toHaveText('Ida M.');
  await expect(gm.locator('[data-plate=seat3]')).toHaveText('Spieler 3frei');
  // Gibt die SL die Einstellungen frei, sieht der Spieler Automatik und Rechte, aber keinen Spielstand (5f)
  const settings = await openSettings(gm, 'Rechte der Spieler');
  await settings.getByRole('combobox', { name: 'Einstellungen ändern' }).selectOption('allow');
  await gm.keyboard.press('Escape');
  await openSettings(player, 'Automatik');
  await expect(player.getByRole('dialog', { name: 'Einstellungen' }).getByRole('tab')).toHaveText(['Automatik', 'Rechte der Spieler', 'Darstellung']);
  await player.keyboard.press('Escape');
  // Spieler startet in seiner Rollenansicht
  await expect.poll(async () => (await player.locator('[data-sheet=seat2]').boundingBox())!.x).toBeLessThan(50);
  await expect(gm.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('');

  // Laterne (5n), vor dem Orakel (dessen Fenster fängt sonst den Klick ab): Spieler ohne Recht kann sie nicht schalten; die SL löscht sie für alle; mit Recht zündet er sie an
  await expect(player.locator('button[data-lamp]')).toHaveCount(0);
  await gm.getByRole('button', { name: 'Laterne löschen' }).click();
  await expect(player.locator('[data-lamp]')).toHaveAttribute('data-lit', 'false');
  const rights = await openSettings(gm, 'Rechte der Spieler');
  await rights.getByRole('combobox', { name: 'Laterne anzünden und löschen' }).selectOption('allow');
  await gm.keyboard.press('Escape');
  await player.getByRole('button', { name: 'Laterne anzünden' }).click();
  await expect(gm.locator('[data-lamp]')).toHaveAttribute('data-lit', 'true');
  // nach einem fremden Ereignis bleibt die Laterne für die SL bedienbar
  await gm.getByRole('button', { name: 'Laterne löschen' }).click();
  await expect(player.locator('[data-lamp]')).toHaveAttribute('data-lit', 'false');
  await gm.getByRole('button', { name: 'Laterne anzünden' }).click();
  await expect(player.locator('[data-lamp]')).toHaveAttribute('data-lit', 'true');

  // Spieler zieht eine Karte, SL sieht sie
  await player.keyboard.press('0');
  await openMenuAndClick(player, 'DECK', 'Ziehen');
  await expectCount(gm, 'ABLAGE', 1);
  // SL würfelt Orakel, Spieler sieht das Ergebnis, aber keinen Knopf zum Neuziehen: nur das ×, kein Hauptknopf (5t)
  await gm.getByRole('button', { name: 'Orakel', exact: true }).click();
  const oracle = player.getByRole('dialog', { name: 'Orakel' });
  await expect(oracle).toBeVisible();
  await expect(oracle.locator('.word')).toHaveCount(2);
  await expect(oracle.getByRole('button')).toHaveCount(1);
  await expect(oracle.getByRole('button', { name: 'Schließen' })).toBeVisible();
  await expect(oracle.locator('header .menu-main')).toHaveCount(0);
  // Spieler hat keine SL-Leiste
  await expect(player.getByRole('button', { name: 'Expedition', exact: true })).toHaveCount(0);

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
  await holdOver(player, deck, { x: deck.x - 60, y: deck.y - 40 }, 6);
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
  // Esc und Klick daneben schließen das Menü (5o): die Markierung verschwindet ebenso
  await player.waitForTimeout(400);
  await player.mouse.click(hard.x, hard.y);
  await expect(gm.locator('.zone.marked', { hasText: 'SCHWIERIG' })).toBeVisible();
  await player.keyboard.press('Escape');
  await expect(gm.locator('.zone.marked')).toHaveCount(0);
  await player.waitForTimeout(400);
  await player.mouse.click(hard.x, hard.y);
  await expect(gm.locator('.zone.marked', { hasText: 'SCHWIERIG' })).toBeVisible();
  await player.mouse.click(5, hard.y);
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
  // Beitritts- und Raumfenster zeigen den Charakter und wer zuletzt dort saß (8.7)
  const rejoin = player.getByRole('dialog', { name: 'Platz wählen' });
  await expect(rejoin.getByRole('button', { name: /^Ida Weber/ })).toHaveText(/frei · zuletzt Ida M\./);
  await expect(rejoin.getByRole('button', { name: /^Spieler 3/ })).toHaveText(/^Spieler 3\s*frei$/);
  await expect(room.getByText('zuletzt Ida M.', { exact: true })).toBeVisible();
  await expect(room.locator('.who').nth(1)).toHaveText(/^\s*Ida Weber ·\s+frei zuletzt Ida M\.\s*$/);
  await player.getByRole('button', { name: 'Nur zuschauen' }).click();
  expect(await menuEntries(player)).toEqual(['Einstellungen', 'Platz wählen', 'Name …', 'Protokoll']);
  // Zuschauer ändern nur den Namen am Zeiger (5e)
  await fromMenu(player, 'Name …');
  const nameDialog = player.getByRole('dialog', { name: 'Name' });
  await expect(nameDialog.getByRole('radio')).toHaveCount(0);
  await nameDialog.getByRole('textbox').fill('Bo');
  await nameDialog.getByRole('button', { name: 'Speichern' }).click();
  await player.mouse.move(400, 300);
  await player.mouse.move(420, 320, { steps: 5 });
  await expect(gm.locator('.cursor', { hasText: 'Bo' })).toBeVisible();

  // SL setzt den Zuschauer auf Platz 3 (8.7): er sitzt sofort dort und erfährt es
  const watchers = room.locator('.watchers');
  await expect(watchers).toHaveText(/Bo/);
  await watchers.getByRole('combobox', { name: 'Platz zuweisen …' }).selectOption('seat3');
  await expect(player.getByText('Die Spielleitung hat dich auf Platz 3 gesetzt.')).toBeVisible();
  await expect(player.locator('[data-sheet=seat3] [data-field=name]')).toBeEditable();
  await expect(room.getByText('Keine Zuschauer verbunden.')).toBeVisible();
  await expect(gm.locator('[data-plate=seat3]')).toHaveText('Bo');
  // Umsetzen auf den freien Platz 2: Charakter steht in der Auswahl, Bogen und Karten bleiben am Platz
  const move = room.getByRole('combobox', { name: 'Umsetzen …' });
  await expect(move.locator('option[value=seat2]')).toHaveText('auf Platz 2 – Ida Weber (frei)');
  await move.selectOption('seat2');
  await expect(player.getByText('Die Spielleitung hat dich auf Platz 2 gesetzt (Ida Weber).')).toBeVisible();
  await seated(player);
  await expect(gm.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('Ida Weber');
  // Umsetzen ohne Verbindung: beim nächsten Beitritt sitzt er auf dem neuen Platz und erfährt es
  await player.goto('about:blank');
  await expect(room.getByText('nicht verbunden', { exact: true })).toBeVisible({ timeout: 30_000 });
  await room.getByRole('combobox', { name: 'Umsetzen …' }).selectOption('seat4');
  await player.goto(link);
  await expect(player.getByText('Die Spielleitung hat dich auf Platz 4 gesetzt.')).toBeVisible({ timeout: 60_000 });
  await expect(player.locator('[data-sheet=seat4] [data-field=name]')).toBeEditable();
  await expect(player.getByRole('dialog', { name: 'Platz wählen' })).toHaveCount(0);

  // Link erneuern: der alte gilt nicht mehr
  await room.getByRole('button', { name: 'Link erneuern' }).click();
  await room.getByRole('button', { name: 'Erneuern' }).click();
  await expect.poll(() => gm.url()).not.toBe(link);
  // Störung ohne Öffnen des Menüs sichtbar, Punkt rot (10)
  await expect(player.getByRole('alert').getByText('Warte auf Spielleitung …')).toBeVisible({ timeout: 30_000 });
  await expect(player.locator('.menu [data-health=trouble]')).toBeVisible();
});


test('SL-Leiste und Seite „Tisch“ mit Mitspieler (5s): nur mit Recht, ohne überzählige Linie, Einfahren nur im eigenen Browser; Spielerzahl folgt fremder Änderung', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  const player = await (await browser.newContext()).newPage();
  await player.goto(link);
  const join = player.getByRole('dialog', { name: 'Platz wählen' });
  await expect(join).toBeVisible({ timeout: 60_000 });
  await join.getByRole('button', { name: /^Spieler 2/ }).click();
  await seated(player);
  const bar = player.getByRole('group', { name: 'Spielleitung' });
  // ohne Recht keine Leiste und keine Lasche
  await expect(player.locator('.ctl')).toHaveCount(0);
  await expect(player.locator('.toggle')).toHaveCount(0);
  // nur Expedition: eine Gruppe, also keine Linie
  let rights = await openSettings(gm, 'Rechte der Spieler');
  await rights.getByRole('combobox', { name: 'Expedition starten' }).selectOption('allow');
  await gm.keyboard.press('Escape');
  await expect(bar.getByRole('button')).toHaveText(['Expedition']);
  await expect(player.locator('.ctl .group')).toHaveCount(1);
  // Einfahren gilt nur im eigenen Browser: die SL fährt ein, beim Spieler bleibt die Leiste
  await gm.getByRole('button', { name: 'Leiste einfahren' }).click();
  await expect(gm.getByRole('group', { name: 'Spielleitung' })).toHaveCount(0);
  await expect(bar.getByRole('button')).toHaveText(['Expedition']);
  await expect(player.getByRole('button', { name: 'Leiste einfahren' })).toBeVisible();
  await gm.getByRole('button', { name: 'Leiste ausfahren' }).click();
  // Spielerzahl ohne die übrigen Einstellungen: Seiten „Tisch“ und „Darstellung“
  rights = await openSettings(gm, 'Rechte der Spieler');
  await rights.getByRole('combobox', { name: 'Spielerzahl ändern' }).selectOption('allow');
  await gm.keyboard.press('Escape');
  const own = await openSettings(player, 'Tisch');
  await expect(own.getByRole('tab')).toHaveText(['Tisch', 'Darstellung']);
  // die SL hat dieselbe Seite offen; ändert der Spieler die Zahl, folgt ihre Auswahl
  const theirs = await openSettings(gm, 'Tisch');
  await own.getByRole('radio', { name: '3', exact: true }).check();
  await expect(theirs.getByRole('radio', { name: '3', exact: true })).toBeChecked();
  await expect(gm.locator('[data-sheet=seat4]')).toHaveCount(0);
  await theirs.getByRole('radio', { name: '2', exact: true }).check();
  await expect(own.getByRole('radio', { name: '2', exact: true })).toBeChecked();
});

test('Menü am Namensschild mit Mitspieler (5j): eigener Bogen, fremde Schilder, SL setzt um, gibt frei, weist zu', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  const player = await (await browser.newContext()).newPage();
  await joinAs(player, link, 'Ida', 2);
  const items = (page: Page) => page.getByRole('menu').getByRole('menuitem');

  // Spieler in seiner Rollenansicht: Schild auf dem eigenen Bogen, alles zum eigenen Bogen, nichts zu Plätzen
  await player.locator('[data-plate=seat2]').click();
  await expect(items(player)).toHaveText(['Name und Farbe …', 'Charakter auswürfeln', 'Foto ändern …', 'Charakter exportieren', 'Charakter importieren …', 'Charakter zurücksetzen']);
  await player.keyboard.press('Escape');
  // Spieler speichert seinen Charakter mit Foto, setzt zurück und lädt ihn wieder; die SL sieht Bogen und Foto
  await player.locator('[data-plate=seat2]').click();
  await items(player).getByText('Charakter auswürfeln').click();
  await player.locator('[data-plate=seat2]').click();
  let chooser = player.waitForEvent('filechooser');
  await items(player).getByText('Foto ändern …').click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await makePng(player) });
  const name = player.locator('[data-sheet=seat2] [data-field=name]');
  await expect(name).not.toHaveValue('');
  const character = await name.inputValue();
  await player.locator('[data-plate=seat2]').click();
  const download = player.waitForEvent('download');
  await items(player).getByText('Charakter exportieren').click();
  const path = await (await download).path();
  await player.locator('[data-plate=seat2]').click();
  await items(player).getByText('Charakter zurücksetzen').click();
  await items(player).getByText('Wirklich zurücksetzen?').click();
  await expect(gm.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue('');
  await player.locator('[data-plate=seat2]').click();
  chooser = player.waitForEvent('filechooser');
  await items(player).getByText('Charakter importieren …').click();
  await (await chooser).setFiles(path);
  await expect(gm.locator('[data-sheet=seat2] [data-field=name]')).toHaveValue(character);
  await expect(gm.locator('[data-sheet=seat2] .photo')).toHaveCSS('background-image', /^url\(/, { timeout: 15_000 });
  // am fremden Schild nur Rollenansicht und Export
  await player.keyboard.press('0');
  await player.locator('[data-plate=seat1]').click();
  await expect(items(player)).toHaveText(['Zur Rollenansicht', 'Charakter exportieren']);
  await player.keyboard.press('Escape');

  // SL ändert Namen der Person an Platz 2
  await gm.locator('[data-plate=seat2]').click();
  await expect(items(gm)).toHaveText(['Name und Farbe …', 'Zur Rollenansicht', 'Charakter auswürfeln', 'Foto ändern …', 'Charakter exportieren', 'Charakter importieren …', 'Charakter zurücksetzen', 'Umsetzen …', 'Platz freigeben']);
  await items(gm).getByText('Name und Farbe …').click();
  const profile = gm.getByRole('dialog', { name: 'Name und Farbe: Platz 2' });
  await profile.getByRole('textbox').fill('Ida B.');
  await profile.getByRole('button', { name: 'Speichern' }).click();
  await expect(player.locator('[data-plate=seat2]')).toHaveText('Ida B.');

  // Umsetzen auf Platz 3: dieselben Ziele wie im Raumfenster
  await gm.locator('[data-plate=seat2]').click();
  await items(gm).getByText('Umsetzen …').click();
  await items(gm).getByText('auf Platz 3 (frei)').click();
  await expect(player.getByText('Die Spielleitung hat dich auf Platz 3 gesetzt.')).toBeVisible();
  await expect(player.locator('[data-sheet=seat3] [data-field=name]')).toBeEditable();

  // Freigeben, dann vom freien Schild aus wieder zuweisen
  await gm.locator('[data-plate=seat3]').click();
  await items(gm).getByText('Platz freigeben').click();
  await expect(player.getByRole('dialog', { name: 'Platz wählen' })).toBeVisible();
  await player.getByRole('dialog', { name: 'Platz wählen' }).getByRole('button', { name: 'Nur zuschauen' }).click();
  await gm.locator('[data-plate=seat3]').click();
  await expect(items(gm)).toContainText(['Farbe …', 'Platz zuweisen …']);
  await items(gm).getByText('Platz zuweisen …').click();
  // als Zuschauer meldet er seinen eigenen gemerkten Namen, nicht den, den die SL am Platz eingetragen hatte
  await items(gm).getByText('Ida', { exact: true }).click();
  await expect(player.getByText('Die Spielleitung hat dich auf Platz 3 gesetzt.')).toBeVisible();
  await expect(player.locator('[data-sheet=seat3] [data-field=name]')).toBeEditable();
});

test('Kommen und Gehen im Protokoll der SL (5l): belegt, nicht mehr verbunden, wieder da; hinausgeworfener Tab verlässt den Raum', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  await fromMenu(gm, 'Protokoll');
  const entries = (text: string | RegExp) => gm.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: text });
  const arrival = await watchArrival(gm, 'seat2');

  // Tab A nimmt Platz 2
  const browserOfIda = await browser.newContext();
  const a = await browserOfIda.newPage();
  await joinAs(a, link, 'Ida', 2);
  await expect(entries('Ida sitzt an Platz 2.')).toHaveCount(1);
  // Meldung bei der SL, nicht bei Ida selbst
  await expect(gm.getByRole('status')).toHaveText('Ida sitzt an Platz 2.');
  // Ankommen in „Aus“: nur der Rand leuchtet auf (kein Heben, das Schild blendet nicht ein)
  await expect.poll(arrival).toEqual(['sheet:boxShadow']);
  // bis das Leuchten (0,6 s) vorbei ist, sähe der Beobachter es weiter
  await gm.waitForTimeout(800);
  await arrival();
  // sofort gezählt: `toHaveCount(0)` würde warten, bis eine Meldung von selbst verschwindet
  expect(await a.getByRole('status').filter({ hasText: 'sitzt an Platz' }).count()).toBe(0);

  // Tab B mit demselben Schlüssel übernimmt; A verlässt den Raum (sonst meldete A weiter Platz 2)
  const b = await browserOfIda.newPage();
  await b.goto(link);
  await seated(b, 60_000);
  await expect(a.getByText('In einem anderen Tab geöffnet')).toBeVisible();
  // B schließen: Platz 2 ist nicht mehr verbunden (Trystero bemerkt es nach einigen Sekunden, dann 5 s Wartezeit)
  await b.close();
  await expect(entries('Ida ist nicht mehr verbunden.')).toHaveCount(1, { timeout: 30_000 });
  await expect(gm.getByRole('status')).toHaveText('Ida ist nicht mehr verbunden.');
  // Schild und Dock blasser, „nicht da“, mit Übergang (nicht still)
  const plate2 = gm.locator('[data-plate=seat2]');
  await expect(plate2).toHaveText('Idanicht da');
  await expect(plate2).toHaveClass(AWAY);
  await expect(plate2).not.toHaveClass(STILL);
  await expect(gm.locator('[data-dock=seat2]')).toHaveClass(AWAY);
  await expect(gm.locator('[data-plate=seat1]')).not.toHaveClass(AWAY);

  // Meldung abgeschaltet: das Protokoll trägt weiter ein
  const settings = await openSettings(gm, 'Automatik');
  await settings.getByRole('switch', { name: 'Meldung bei Kommen und Gehen' }).uncheck();
  await gm.keyboard.press('Escape');
  await expect(gm.getByRole('status')).toHaveCount(0);

  // derselbe Browser kommt wieder
  const c = await browserOfIda.newPage();
  await c.goto(link);
  await seated(c, 60_000);
  await expect(entries('Ida ist wieder da.')).toHaveCount(1, { timeout: 30_000 });
  expect(await gm.getByRole('status').count()).toBe(0);
  // „wieder da“ nur am Schild, und das in „Aus“ ohne Animation
  expect(await arrival()).toEqual([]);
  await expect(plate2).toHaveText('Ida');
  await expect(gm.locator('[data-dock=seat2]')).not.toHaveClass(AWAY);
  // der Wechsel von A zu B war kein Gehen, das Belegen steht nur einmal da
  await expect(entries(/nicht mehr verbunden/)).toHaveCount(1);
  await expect(entries(/sitzt an Platz/)).toHaveCount(1);

  // SL lädt neu, während Ida fehlt: still „nicht da“ (ohne Meldung, ohne Protokoll, ohne Übergang)
  await c.close();
  await gm.reload();
  await expect(gm.locator('[data-health=ok]')).toBeVisible({ timeout: 60_000 });
  await expect(plate2).toHaveClass(AWAY, { timeout: 30_000 });
  await expect(plate2).toHaveClass(STILL);
  await expect(entries(/nicht mehr verbunden/)).toHaveCount(1);
});

test('Namensschild-Menü (5p): Höhe ändert sich bei offenem Menü; es bleibt auf seiner Seite, ganz sichtbar, Zipfel am Schild', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  const player = await (await browser.newContext()).newPage();
  await joinAs(player, link, 'Ida', 2);
  const menu = player.locator('[data-plate-menu]');
  const inside = (page: Page) => expectInStage(page, page.locator('[data-plate-menu]'));

  // R1: die SL entzieht ein Recht, eine Gruppe wird kürzer, ohne Aufklappen
  await player.locator('[data-plate=seat2]').click();
  await expect(menu.getByRole('menuitem', { name: 'Charakter zurücksetzen' })).toBeVisible();
  const side = await menu.getAttribute('data-side');
  const before = (await menu.boundingBox())!;
  const rights = await openSettings(gm, 'Rechte der Spieler');
  await rights.getByRole('combobox', { name: 'Charakter zurücksetzen und laden' }).selectOption('deny');
  await expect(menu.getByRole('menuitem', { name: 'Charakter zurücksetzen' })).toHaveCount(0);
  await expect.poll(async () => (await menu.boundingBox())!.height).toBeLessThan(before.height);
  await expect(menu).toHaveAttribute('data-side', side!);
  await expect(menu.locator('.menu-tip')).toHaveCount(1);
  await inside(player);
  await rights.getByRole('combobox', { name: 'Charakter zurücksetzen und laden' }).selectOption('allow');
  await gm.keyboard.press('Escape');

  // Aufklappen bei der SL: Liste im Menü, Pfeil offen, langer Name gekürzt mit Tooltip; Menü bleibt auf seiner Seite
  await nameCharacter(gm, 'seat3', 'Wilhelmine Adelheid von Hohenstein-Eberstadt');
  for (const size of [{ width: 1280, height: 720 }, { width: 1280, height: 480 }]) {
    await gm.setViewportSize(size);
    await gm.locator('[data-plate=seat2]').click();
    const gmMenu = gm.locator('[data-plate-menu]');
    await expect(gmMenu).toBeVisible();
    const opened = await gmMenu.getAttribute('data-side');
    const move = gmMenu.getByRole('menuitem', { name: 'Umsetzen …' });
    await move.click();
    await expect(move).toHaveAttribute('aria-expanded', 'true');
    const target = gmMenu.locator('.menu-subs').getByRole('menuitem').filter({ hasText: 'Platz 3' });
    await expect(target).toHaveAttribute('title', 'auf Platz 3 – Wilhelmine Adelheid von Hohenstein-Eberstadt (frei)');
    expect(await target.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(gmMenu).toHaveAttribute('data-side', opened!);
    await inside(gm);
    // stößt es an, rutscht es über das Schild, ohne Zipfel (R2)
    if (size.height === 480) await expect(gmMenu.locator('.menu-tip')).toHaveCount(0);
    await gm.keyboard.press('Escape');
  }
});

test('Stapelmenü (5o): Rechte ändern sich bei offenem Menü; Eintrag wird ausgegraut, ohne jedes Recht schließt es', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  const player = await (await browser.newContext()).newPage();
  await joinAs(player, link, 'Ida', 2);
  await player.keyboard.press('0');
  const deck = await zoneCenter(player, 'DECK');
  await player.mouse.click(deck.x, deck.y);
  const item = (name: string) => player.locator('[data-stack-menu]').getByRole('menuitem', { name, exact: true });
  await expect(item('Mischen')).not.toHaveAttribute('aria-disabled', 'true');

  const rights = await openSettings(gm, 'Rechte der Spieler');
  await rights.getByRole('combobox', { name: 'Stapel mischen' }).selectOption('deny');
  await expect(item('Mischen')).toHaveAttribute('aria-disabled', 'true');
  await expect(item('Mischen')).toHaveAttribute('title', 'Dafür fehlt dir die Berechtigung.');
  await expect(item('Ziehen')).not.toHaveAttribute('aria-disabled', 'true');
  await rights.getByRole('combobox', { name: 'Karten ziehen' }).selectOption('deny');
  await expect(item('Ziehen')).toHaveAttribute('aria-disabled', 'true');
  await rights.getByRole('combobox', { name: 'Karten umdrehen' }).selectOption('deny');
  await expect(player.locator('[data-stack-menu]')).toHaveCount(0);
  // ohne jedes Recht ist der Stapel kein Knopf mehr
  await expect(player.locator('[data-zone=deck]')).not.toHaveAttribute('role', 'button');
});

test('Ergebnisfenster (5t, Q3): öffnet sich hinter offenen Einstellungen, ohne den Fokus zu nehmen; sonst aufs ×', async ({ browser }) => {
  const { gm, link } = await openRoom(browser);
  const player = await (await browser.newContext()).newPage();
  await joinAs(player, link, 'Ida', 2);
  const settings = await openSettings(player, 'Darstellung');
  const tab = settings.getByRole('tab', { name: 'Darstellung' });
  await tab.focus();
  await gm.getByRole('button', { name: 'Orakel', exact: true }).click();
  await expect(player.getByRole('dialog', { name: 'Orakel' })).toHaveCount(1);
  await expect(tab).toBeFocused();
  await player.keyboard.press('Escape'); // schließt beide Fenster (jedes Modal hört auf Esc, hingenommen)
  await expect(settings).toHaveCount(0);
  await expect(player.getByRole('dialog')).toHaveCount(0);
  await gm.keyboard.press('Escape'); // Orakel bei der SL schließen, sonst fängt es den Klick ab
  // ohne anderes Fenster: Fokus aufs ×
  await gm.getByRole('button', { name: 'Expedition', exact: true }).click();
  await expect(player.getByRole('dialog', { name: 'Expedition' }).getByRole('button', { name: 'Schließen' })).toBeFocused();
});

/** Browser tritt über den Link bei und nimmt Platz `n` mit Namen */
async function joinAs(page: Page, link: string, name: string, n: number) {
  await page.goto(link);
  const join = page.getByRole('dialog', { name: 'Platz wählen' });
  await expect(join).toBeVisible({ timeout: 60_000 });
  await join.getByRole('textbox').fill(name);
  await join.getByRole('button', { name: new RegExp(`^Spieler ${n}`) }).click();
  await expect(page.locator(`[data-sheet=seat${n}] [data-field=name]`)).toBeEditable({ timeout: 15_000 });
}

/** Alle Meldungen (Toast) eines Browsers ab jetzt sammeln; `toasts` liefert sie. Übersteht kein Neuladen. */
async function watchToasts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { toasts: string[] };
    w.toasts = [];
    let last = '';
    setInterval(() => {
      const now = document.querySelector('[role=status]')?.textContent ?? '';
      if (now && now !== last) w.toasts.push(now);
      last = now;
    }, 20);
  });
  return () => page.evaluate(() => (window as unknown as { toasts: string[] }).toasts);
}

/** SL mit offenem Raum und Protokoll; liefert Seite, Link und Einträge im Protokoll */
async function openTable(browser: import('@playwright/test').Browser) {
  const { gm, link } = await openRoom(browser);
  await fromMenu(gm, 'Protokoll');
  const log = () => gm.getByRole('list', { name: 'Protokoll' }).locator('li').allTextContents();
  return { gm, link, log };
}

test('Neuladen eines Mitspielers bei drei Browsern (5l): bei den anderen keine Meldung, kein „nicht da“, kein Eintrag', async ({ browser }) => {
  const { gm, link, log } = await openTable(browser);
  const ida = await (await browser.newContext()).newPage();
  await joinAs(ida, link, 'Ida', 2);
  const bo = await (await browser.newContext()).newPage();
  await joinAs(bo, link, 'Bo', 3);
  // alle sehen sich (Zeigermeldungen da), dann ruhig werden lassen
  await expect(gm.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: 'Bo sitzt an Platz 3.' })).toHaveCount(1);
  await gm.waitForTimeout(4000);
  const before = await log();
  const atGm = await watchToasts(gm);
  const atBo = await watchToasts(bo);

  await ida.reload();
  await expect(ida.locator('[data-sheet=seat2] [data-field=name]')).toBeEditable({ timeout: 15_000 });
  // Abgang bemerken (einige Sekunden) und Wartezeit (5 s) abwarten
  await gm.waitForTimeout(12_000);
  expect(await atGm()).toEqual([]);
  expect(await atBo()).toEqual([]);
  expect(await log()).toEqual(before);
  // der Dock-Knopf ist in jeder Ansicht da (Bo sieht in seiner Rollenansicht kein Schild von Platz 2)
  for (const page of [gm, bo]) await expect(page.locator('[data-dock=seat2]')).not.toHaveClass(AWAY);
});

test('Neustart des Hosts (5l): keine Flut von „wieder da“, weder bei der SL noch bei den Spielern', async ({ browser }) => {
  const { gm, link, log } = await openTable(browser);
  const ida = await (await browser.newContext()).newPage();
  await joinAs(ida, link, 'Ida', 2);
  const bo = await (await browser.newContext()).newPage();
  await joinAs(bo, link, 'Bo', 3);
  await gm.waitForTimeout(4000);
  const atIda = await watchToasts(ida);
  const atBo = await watchToasts(bo);

  await gm.reload();
  await expect(gm.locator('[data-health=ok]')).toBeVisible({ timeout: 60_000 });
  const before = await log();
  const atGm = await watchToasts(gm);
  // Spieler finden den neuen Host, ihre Zeiger kommen bei der SL an
  await expect(ida.locator('[data-health=ok]')).toBeVisible({ timeout: 60_000 });
  await expect(bo.locator('[data-health=ok]')).toBeVisible({ timeout: 60_000 });
  await gm.waitForTimeout(12_000);
  expect(await atGm()).toEqual([]);
  const after = await log();
  expect(after.slice(0, after.length - before.length)).toEqual([]);
  expect(await atIda()).toEqual([]);
  expect(await atBo()).toEqual([]);
  // am Ende sind alle da, auch wenn die SL sie zwischendurch still als „nicht da“ gezeigt hat
  for (const seat of ['seat2', 'seat3']) await expect(gm.locator(`[data-plate=${seat}]`)).not.toHaveClass(AWAY, { timeout: 30_000 });
});
