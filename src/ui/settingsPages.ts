// Seiten des Einstellungsdialogs (Schritt 5f): Reihenfolge, Sichtbarkeit, Seite beim Öffnen.

export const SETTINGS_PAGES = ['table', 'permissions', 'game', 'appearance'] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** „Darstellung“ (nur für einen selbst) sieht jeder (5g); „Rechte“ nur, wer die Einstellungen ändern darf;
 *  „Spielstand“ (Datei, Sicherungen) nur der Host; „Tisch“ (Spielerzahl, Automatik, Meldungen; 5s, 5u) wer eins von
 *  beiden ändern darf, die Abschnitte richten sich nach dem jeweiligen Recht. */
export const visiblePages = (isHost: boolean, canSettings: boolean, canPlayers: boolean): SettingsPage[] =>
  SETTINGS_PAGES.filter((p) => (p === 'appearance' ? true : p === 'game' ? isHost : p === 'table' ? canPlayers || canSettings : canSettings));

/** Zuletzt gewählte Seite, sofern es sie hier gibt; sonst die erste. */
export const openPage = (last: SettingsPage, pages: readonly SettingsPage[]): SettingsPage => (pages.includes(last) ? last : pages[0]!);

// ---------- Gruppen der Rechte (Seite „Rechte der Spieler“) ----------
// Aufbau, keine Übersetzung: die Namen stehen in texts.de.yaml (settings.groups). Ein Recht ohne Gruppe
// steht unter „Weitere“, damit ein neues Recht nie verschwindet.

export const PERMISSION_GROUPS = {
  cards: ['cards.move', 'card.flip', 'zone.shuffle', 'zone.draw'],
  sheet: ['sheet.edit', 'sheet.photo', 'sheet.roll', 'sheet.replace'],
  trumps: ['trump.choose', 'trump.chooseFree', 'trump.remove', 'character.revive'],
  gm: ['table.reset', 'table.setPlayers', 'table.setSeat', 'table.setSettings', 'table.setLamp', 'gm.expedition', 'gm.oracle'],
} as const satisfies Record<string, readonly string[]>;

/** Fest, nicht im Dialog: eigenen Namen und eigene Farbe darf jeder Spieler immer ändern (5f, Nutzer 2026-10-21). */
export const FIXED_PERMISSIONS: readonly string[] = ['seat.edit'];

export type PermissionGroup = { id: keyof typeof PERMISSION_GROUPS | 'other'; keys: string[] };

/** Gruppen in fester Reihenfolge, nur mit vorhandenen Rechten; Übriges unter „Weitere“. */
export function permissionGroups(keys: readonly string[]): PermissionGroup[] {
  const listed = new Set<string>([...FIXED_PERMISSIONS, ...Object.values(PERMISSION_GROUPS).flat()]);
  const groups: PermissionGroup[] = Object.entries(PERMISSION_GROUPS).map(([id, ks]) => ({
    id: id as PermissionGroup['id'],
    keys: ks.filter((k) => keys.includes(k)),
  }));
  groups.push({ id: 'other', keys: keys.filter((k) => !listed.has(k)) });
  return groups.filter((g) => g.keys.length > 0);
}
