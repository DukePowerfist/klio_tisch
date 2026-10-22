// Liest content/klio/*.yaml für Tests (die App selbst bekommt JSON aus dem Build).

import { resolve } from 'node:path';
import { readContentDir } from '../../content-plugin';
import type { RawContent } from '../../src/rules/klio/content/validate';

const CONTENT_DIR = resolve(import.meta.dirname, '../../content/klio');

export const readContent = (): RawContent => readContentDir(CONTENT_DIR);
