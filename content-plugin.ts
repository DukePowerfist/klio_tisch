// Vite-Plugin: liest content/klio/*.yaml, prüft alles (Zod + Querverweise) und liefert es als JSON-Modul
// `virtual:klio-content` aus. Fehler brechen Build bzw. Entwicklungsserver ab (ARCHITEKTUR.md 7, Versionierung).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { parse } from 'yaml';
import { CONTENT_PATHS } from './src/rules/klio/content/files';
import { validateContent, type RawContent } from './src/rules/klio/content/validate';

const ID = 'virtual:klio-content';
const RESOLVED = `\0${ID}`;

export function klioContent(dir: string): Plugin {
  const files = Object.values(CONTENT_PATHS).map((f) => resolve(dir, f));
  return {
    name: 'klio-content',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return;
      for (const f of files) this.addWatchFile(f);
      const raw = Object.fromEntries(Object.entries(CONTENT_PATHS).map(([k, f]) => [k, parse(readFileSync(resolve(dir, f), 'utf8'))])) as RawContent;
      const result = validateContent(raw);
      if (!result.ok) throw new Error(`Inhalte fehlerhaft:\n${result.errors.join('\n')}`);
      return `export default ${JSON.stringify(result.content)};`;
    },
  };
}
