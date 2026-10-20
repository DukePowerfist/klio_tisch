// Liest content/klio/*.yaml für Tests (die App selbst bekommt JSON aus dem Build).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { ContentKey, RawContent } from '../../src/rules/klio/content/validate';

export const CONTENT_DIR = resolve(import.meta.dirname, '../../content/klio');

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

export function readContent(): RawContent {
  return Object.fromEntries(
    Object.entries(CONTENT_PATHS).map(([key, file]) => [key, parse(readFileSync(resolve(CONTENT_DIR, file), 'utf8'))]),
  ) as RawContent;
}
