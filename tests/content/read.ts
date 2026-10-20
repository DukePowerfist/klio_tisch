// Liest content/klio/*.yaml für Tests (die App selbst bekommt JSON aus dem Build).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { CONTENT_PATHS } from '../../src/rules/klio/content/files';
import type { RawContent } from '../../src/rules/klio/content/validate';

export const CONTENT_DIR = resolve(import.meta.dirname, '../../content/klio');

export function readContent(): RawContent {
  return Object.fromEntries(
    Object.entries(CONTENT_PATHS).map(([key, file]) => [key, parse(readFileSync(resolve(CONTENT_DIR, file), 'utf8'))]),
  ) as RawContent;
}
