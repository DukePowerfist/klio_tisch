// Seiten des Einstellungsdialogs (Schritt 5f): Reihenfolge, Sichtbarkeit, Seite beim Öffnen.

export const SETTINGS_PAGES = ['automation', 'permissions', 'game'] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** „Spielstand“ (Datei, Sicherungen) gibt es nur beim Host; ein Mitspieler mit dem Recht sieht die übrigen. */
export const visiblePages = (isHost: boolean): SettingsPage[] => SETTINGS_PAGES.filter((p) => isHost || p !== 'game');

/** Zuletzt gewählte Seite, sofern es sie hier gibt; sonst die erste. */
export const openPage = (last: SettingsPage, pages: readonly SettingsPage[]): SettingsPage => (pages.includes(last) ? last : pages[0]!);
