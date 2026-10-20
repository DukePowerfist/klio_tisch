// Schichtgrenzen (ARCHITEKTUR.md 5): wer darf wen importieren.
// Statt ESLint, weil typescript-eslint TypeScript 7 noch nicht unterstützt.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../src');

/** erlaubte Ziele je Schicht; `ui` und `verbindungstest` dürfen alles */
const ALLOWED: Record<string, string[]> = {
  engine: ['engine'],
  'rules/klio': ['rules/klio', 'engine'],
  net: ['net', 'engine'],
};
const LAYERS = ['engine', 'rules/klio', 'net', 'ui', 'verbindungstest'];

function layerOf(path: string): string | null {
  const rel = relative(SRC, path).replaceAll('\\', '/');
  return LAYERS.find((l) => rel === l || rel.startsWith(`${l}/`)) ?? null;
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|svelte)$/.test(name) ? [p] : [];
  });
}

function relativeImports(source: string): string[] {
  const re = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  return [...source.matchAll(re)].map((m) => m[1] ?? m[2]!);
}

describe('Schichtgrenzen', () => {
  const violations: string[] = [];
  for (const file of files(SRC)) {
    const from = layerOf(file);
    const allowed = from ? ALLOWED[from] : undefined;
    if (!allowed) continue;
    for (const spec of relativeImports(readFileSync(file, 'utf8'))) {
      const to = layerOf(resolve(dirname(file), spec));
      if (!to || !allowed.includes(to)) violations.push(`${relative(SRC, file)} → ${spec}`);
    }
  }

  it('engine, rules/klio und net importieren nur, was sie dürfen', () => {
    expect(violations).toEqual([]);
  });

  it('die Prüfung erkennt Importe', () => {
    expect(relativeImports(`import { a } from '../engine/types';\nimport type { B } from "./x";\nconst c = import('../ui/y');`))
      .toEqual(['../engine/types', './x', '../ui/y']);
  });
});
