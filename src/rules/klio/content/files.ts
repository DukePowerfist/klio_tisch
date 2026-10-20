// Welche Datei in content/klio/ welchen Inhalt enthält. Gelesen wird nur beim Build und in Tests.

import type { ContentKey } from './validate';

export const CONTENT_PATHS: Record<ContentKey, string> = {
  trumps: 'trumps.yaml',
  tables: 'tables.yaml',
  expedition: 'expedition.yaml',
  names: 'names.yaml',
  deck: 'deck.yaml',
  zones: 'zones.yaml',
  sheet: 'sheet.yaml',
  layouts: 'layouts.yaml',
  trumpSources: 'trump-sources.yaml',
  permissions: 'permissions.yaml',
  texts: 'texts.de.yaml',
  skinPaper: 'skins/paper.yaml',
};
