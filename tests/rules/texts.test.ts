// Jeder Textschlüssel, den der Code als Grund oder Meldung nutzt, steht in texts.de.yaml.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { steps } from '../../src/rules/klio/blocks';
import { content, resolveText } from '../helpers';

const SRC = resolve(import.meta.dirname, '../../src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.ts') ? [join(dir, n)] : []));

describe('Texte', () => {
  it('alle im Code genutzten Schlüssel existieren', () => {
    const keys = new Set<string>();
    for (const f of files(SRC)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'((?:reject|toast|trumpDialog)\.[A-Za-z.]+[A-Za-z])'/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(15);
    expect([...keys].filter((k) => resolveText({ key: k }) === undefined)).toEqual([]);
  });

  it('jede Zone mit Obergrenze hat eine Meldung dazu', () => {
    for (const [id, z] of Object.entries(content.zones)) {
      if (z.capacity !== undefined) expect(resolveText({ key: `reject.capacity.${id}` }), id).toBeTypeOf('string');
    }
  });

  it('jeder Weg mit eingeschränkter Stufe hat einen Grund dazu', () => {
    for (const s of content.trumpSources.trumpSources) {
      if (s.levels.length < 3) expect(s.text.levelWhy, s.id).toBeTypeOf('string');
    }
  });

  it('zusammengesetzte Schlüssel: Schrittüberschriften, Zahlen, Narben, Zonen-Aktionen', () => {
    const keys = [
      ...Object.keys(steps).map((s) => `trumpDialog.steps.${s}`),
      ...[1, 2, 3, 4, 5].map((n) => `numerals.${n}`),
      'scars.heart', 'scars.spade',
      'zones.actions.shuffle', 'zones.actions.flip', 'zones.actions.draw',
    ];
    expect(keys.filter((k) => resolveText({ key: k }) === undefined)).toEqual([]);
  });
});
