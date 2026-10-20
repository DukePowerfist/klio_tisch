import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateContent, type KlioContent, type RawContent } from '../../src/rules/klio/content/validate';
import { readContent } from './read';

const RAW = readContent();
const result = validateContent(RAW);
const content = (): KlioContent => {
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.content;
};

/** Kopie der echten Inhalte, an einer Stelle verändert. */
function mutated(change: (raw: any) => void): RawContent {
  const raw = structuredClone(RAW);
  change(raw);
  return raw;
}

describe('Inhalte', () => {
  it('alle Dateien sind gültig und passen zueinander', () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('Umfang wie in der alten Fassung', () => {
    const c = content();
    expect(c.trumps).toHaveLength(44);
    expect(Object.keys(c.tables).sort()).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VIII']);
    expect(Object.values(c.deck.start).flat()).toHaveLength(52);
    expect(c.deck.start['deck']).toHaveLength(27);
    expect(c.expedition.expedition).toHaveLength(4);
  });

  it('Trümpfe je Kategorie und Stufe wie bisher', () => {
    const count = (cat: string, lvl: number) => content().trumps.filter((t) => t.category === cat && t.level === lvl).length;
    expect([count('K', 1), count('K', 2), count('K', 3)]).toEqual([4, 4, 3]);
    expect([count('P', 1), count('P', 2), count('P', 3)]).toEqual([4, 4, 3]);
    expect([count('V', 1), count('V', 2), count('V', 3)]).toEqual([4, 4, 3]);
    expect([count('X', 1), count('X', 2), count('X', 3)]).toEqual([4, 4, 3]);
  });
});

describe('Prüfungen schlagen an', () => {
  const errorsOf = (raw: RawContent) => {
    const r = validateContent(raw);
    return r.ok ? [] : r.errors;
  };

  it.each<[string, (raw: any) => void, RegExp]>([
    ['vertippter Baustein', (r) => (r.trumpSources.trumpSources[0].requires = ['noTrumpYt']), /trumpSources/],
    ['Karte doppelt', (r) => r.deck.start.deck.push('D2'), /D2 kommt doppelt/],
    ['Karte fehlt', (r) => r.deck.start.clubs.pop(), /CK hat keine Startzone/],
    ['Ziehen in unbekannte Zone', (r) => (r.zones.deck.actions.draw.to = 'ablage'), /unbekannter Zone ablage/],
    ['Trumpf-ID doppelt', (r) => (r.trumps[1].id = r.trumps[0].id), /ID doppelt/],
    ['Kategorie passt nicht', (r) => (r.trumps[0].attributes = ['V']), /passt nicht zu Attributen/],
    ['Haut ohne Feld', (r) => delete r.skinPaper.fields['lamps.2'], /lamps\.2 hat keine Position/],
    ['Haut mit fremdem Feld', (r) => (r.skinPaper.fields['lamps.3'] = { x: 0, y: 0, size: 10 }), /unbekanntes Feld lamps\.3/],
    ['maxTrumps passt nicht', (r) => (r.trumpSources.maxTrumps = 5), /maxTrumps 5/],
    ['Tabelle mit 12 Einträgen', (r) => delete r.tables.VI.H.A, /tables/],
    ['Zonenbeschriftung fehlt', (r) => delete r.texts.zones.clubs, /zones\.clubs fehlt/],
    ['Tischzone ohne Lage', (r) => delete r.layouts.middle.zones.danger, /danger fehlt in der Tischmitte/],
    ['unbekanntes Recht', (r) => (r.permissions.player['cards.move'] = 'maybe'), /permissions/],
  ])('%s', (_, change, expected) => {
    expect(errorsOf(mutated(change)).join('\n')).toMatch(expected);
  });
});

// Gegenprobe mit der alten Datei: Jeder Spieltext steht dort genau so.
// Die alte Datei ist nicht im Repository; ohne sie wird die Prüfung übersprungen.
const LEGACY = resolve(import.meta.dirname, '../../Kartentisch (3).html');

describe.skipIf(!existsSync(LEGACY))('wortgetreu aus der alten Datei', () => {
  const legacy = existsSync(LEGACY)
    ? readFileSync(LEGACY, 'utf8').replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    : '';
  const quoted = (s: string) => legacy.includes(`'${s}'`) || legacy.includes(`'${s.replaceAll("'", "\\'")}'`);

  function texts(): string[] {
    const c = content();
    const gendered = (g: string | { m: string; w: string }) => (typeof g === 'string' ? g : `${g.m}|${g.w}`);
    return [
      ...c.trumps.flatMap((t) => [t.name, t.text]),
      ...Object.values(c.tables).flatMap((t) => [...Object.values(t.H), ...Object.values(t.S)].map(gendered)),
      ...c.expedition.expedition.flatMap((e) => [e.prompt, ...e.entries]),
      ...Object.values(c.expedition.oracle).flatMap((o) => Object.values(o)),
      ...c.names.first.m, ...c.names.first.w, ...c.names.last,
      ...c.trumpSources.trumpSources.flatMap((s) => [s.text.name, s.text.desc, s.text.why]),
    ];
  }

  it('jeder Text kommt in der alten Datei als Zeichenkette vor', () => {
    const missing = texts().filter((t) => !quoted(t));
    expect(missing).toEqual([]);
  });

  it('Tabellen stehen in derselben Reihenfolge wie bisher', () => {
    const c = content();
    for (const [key, t] of Object.entries(c.tables)) {
      const g = (x: string | { m: string; w: string }) => `'${typeof x === 'string' ? x : `${x.m}|${x.w}`}'`;
      const row = (side: typeof t.H) => `[${Object.values(side).map(g).join(',')}]`;
      expect(legacy, `Tabelle ${key}`).toContain(`${key}:[${row(t.H)},\n${row(t.S)}]`);
    }
  });
});
