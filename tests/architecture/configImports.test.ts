// Importe der Vite-Konfiguration mit Dateiendung. Vite 8 warnt beim Start sonst:
//   „Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the
//    default in a future major version of Vite: import "./src/rules/klio/content/files" without a file extension“.
// Der native Lader löst wie Node auf und braucht die Endung in jeder Datei, die die Konfiguration erreicht (über
// content-plugin.ts auch Teile von src/engine und src/rules/klio). tsc und Vitest merken davon nichts, daher dieser Test.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { relativeImports } from './imports';

const ROOT = resolve(import.meta.dirname, '../..');
const ENTRIES = ['vite.config.ts', 'content-plugin.ts'];

/** relative Importe ohne Endung in allem, was von den Einstiegen aus erreichbar ist, als `datei → ziel` */
function missingExtensions(root: string, entries: string[]): string[] {
  const seen = new Set<string>();
  const missing: string[] = [];
  const queue = entries.map((e) => resolve(root, e));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of relativeImports(readFileSync(file, 'utf8'))) {
      const target = resolve(dirname(file), spec);
      if (!/\.[cm]?[jt]s$|\.json$/.test(spec)) missing.push(`${relative(root, file)} → ${spec}`);
      else if (/\.[cm]?[jt]s$/.test(spec) && existsSync(target)) queue.push(target);
    }
  }
  return missing;
}

describe('Importe der Vite-Konfiguration', () => {
  it('jede erreichbare Datei importiert relativ nur mit Dateiendung', () => {
    expect(missingExtensions(ROOT, ENTRIES)).toEqual([]);
  });

  it('die Prüfung folgt den Importen und findet fehlende Endungen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'klio-imports-'));
    writeFileSync(join(dir, 'a.ts'), `import { b } from './b.ts';\nimport type { T } from './t.ts';`);
    writeFileSync(join(dir, 'b.ts'), `export { c } from './c';`);
    writeFileSync(join(dir, 't.ts'), `export type T = 1;`);
    expect(missingExtensions(dir, ['a.ts'])).toEqual(['b.ts → ./c']);
  });
});
