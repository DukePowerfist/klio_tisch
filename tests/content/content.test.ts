import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RANKS } from '../../src/engine/types';
import { validateContent, type RawContent } from '../../src/rules/klio/content/validate';
import { content } from '../helpers';
import { readContent } from './read';

const RAW = readContent();
const result = validateContent(RAW);

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
    const c = content;
    expect(c.trumps).toHaveLength(44);
    expect(Object.keys(c.tables).sort()).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VIII']);
    expect(Object.values(c.deck.start).flat()).toHaveLength(52);
    expect(c.deck.start['deck']).toHaveLength(27);
    expect(c.expedition.expedition).toHaveLength(4);
    // Eintrag i gehört zum Wert RANKS[i] (5zf, 10.13): ändert sich die Zahl, bricht die Zuordnung
    for (const table of c.expedition.expedition) expect(table.entries).toHaveLength(RANKS.length);
  });

  it('Regelbuch (5zk): zu jeder Doppelseite liegt das Bild in public/assets/book', () => {
    expect(content.book.spreads).toHaveLength(8);
    for (const s of content.book.spreads) expect(existsSync(resolve(import.meta.dirname, `../../public/assets/book/${s.id}.webp`)), s.id).toBe(true);
  });

  it('Trümpfe je Kategorie und Stufe wie bisher', () => {
    const count = (cat: string, lvl: number) => content.trumps.filter((t) => t.category === cat && t.level === lvl).length;
    for (const cat of ['K', 'P', 'V', 'X']) expect([1, 2, 3].map((l) => count(cat, l)), cat).toEqual([4, 4, 3]);
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
    ['Regelbuch: Doppelseite doppelt', (r) => (r.book.spreads[2].id = 'p01'), /Doppelseite doppelt: p01/],
    ['Regelbuch: Blatt nicht spiegelbildlich', (r) => (r.layouts.book.pages.right[0] += 4), /nicht spiegelbildlich zur Buchmitte/],
    ['Regelbuch: Seiten ungleich groß', (r) => (r.layouts.book.pages.left[3] -= 10), /nicht gleich groß/],
    ['Karte fehlt', (r) => r.deck.start.clubs.pop(), /CK hat keine Startzone/],
    ['Ziehen in unbekannte Zone', (r) => (r.zones.deck.actions.draw.to = 'ablage'), /unbekannter Zone ablage/],
    ['Trumpf-ID doppelt', (r) => (r.trumps[1].id = r.trumps[0].id), /ID doppelt/],
    ['Kategorie passt nicht', (r) => (r.trumps[0].attributes = ['V']), /passt nicht zu Attributen/],
    ['Haut ohne Feld', (r) => delete r.skinPaper.fields['weaknessMarks.2'], /weaknessMarks\.2 hat keine Position/],
    ['Haut mit fremdem Feld', (r) => (r.skinPaper.fields['weaknessMarks.3'] = { x: 0, y: 0, size: 10 }), /unbekanntes Feld weaknessMarks\.3/],
    ['Laterne: Kästchen mit eigener Position', (r) => (r.skinPaper.fields['lamps.0'] = { x: 0, y: 0, size: 10 }), /lamps\.0 gehört zur Laterne/],
    ['Laterne: Abschnitt fehlt', (r) => r.skinPaper.lantern.segments.pop(), /lantern braucht 3 Abschnitte/],
    ['Laterne: Flammengröße fehlt', (r) => r.skinPaper.lantern.flame.sizes.pop(), /lantern\.flame braucht 3 Größen/],
    ['Laterne: keine Kästchenliste', (r) => (r.skinPaper.lantern.field = 'weaknesses'), /lantern\.field weaknesses ist keine Kästchenliste/],
    ['Laterne: Knöpfe im Feld', (r) => (r.skinPaper.lantern.steps.x = 540), /Knöpfe der Laterne reichen in experiences\.2/],
    ['Laterne: Klickfläche zu groß', (r) => (r.skinPaper.lantern.hit.y = 830), /Klickfläche der Laterne reicht in trumps\.3/],
    ['Hervorhebung ohne Textfeld', (r) => (r.sheet.fields['strengths.improved'].emphasizes = 'strengths.txt'), /strengths\.improved\.0 verweist auf strengths\.txt\.0/],
    ['Klickfläche zu groß', (r) => (r.skinPaper.fields['weaknessMarks.1'].hit = 20), /Klickfläche von weaknessMarks\.1 reicht in weaknessMarks\.(0|2)/],
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
// Ohne die Trümpfe (5zt, ARCHITEKTUR.md 10.22): Ihre Vorlage ist seit e157779 die Klio_Trümpfe_Liste_2.1.docx, 20 Texte
// stehen bewusst anders als in der alten Datei. Geprüft bleiben Tabellen, Expedition, Orakel, Namen und Wege zum Trumpf.
// Die alte Datei ist nicht im Repository; ohne sie wird die Prüfung übersprungen.
const LEGACY = resolve(import.meta.dirname, '../../Kartentisch (3).html');

describe.skipIf(!existsSync(LEGACY))('wortgetreu aus der alten Datei', () => {
  const legacy = existsSync(LEGACY)
    ? readFileSync(LEGACY, 'utf8').replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    : '';
  const quoted = (s: string) => legacy.includes(`'${s}'`) || legacy.includes(`'${s.replaceAll("'", "\\'")}'`);

  function texts(): string[] {
    const c = content;
    const gendered = (g: string | { m: string; w: string }) => (typeof g === 'string' ? g : `${g.m}|${g.w}`);
    return [
      ...Object.values(c.tables).flatMap((t) => [...Object.values(t.H), ...Object.values(t.S)].map(gendered)),
      ...c.expedition.expedition.flatMap((e) => [e.prompt, ...e.entries]),
      ...Object.values(c.expedition.oracle).flatMap((o) => Object.values(o)),
      ...c.names.first.m, ...c.names.first.w, ...c.names.last,
      ...c.trumpSources.trumpSources.flatMap((s) => [s.text.name, s.text.desc, s.text.why]),
    ];
  }

  // Bewusst geändert (5zu, 10.22 F6): Seit der Erlebnislaterne (5zm) gibt es am Bogen keine Lampenfelder mehr
  const updated = new Set([
    'Erlebnislaterne voll: erst eine Stärke verbessern, dann einen Trumpf der Stufe I oder II wählen.',
    'Dafür muss die Erlebnislaterne voll sein.',
  ]);

  it('jeder Text kommt in der alten Datei als Zeichenkette vor', () => {
    const missing = texts().filter((t) => !quoted(t) && !updated.has(t));
    expect(missing).toEqual([]);
  });

  it('Tabellen stehen in derselben Reihenfolge wie bisher', () => {
    const c = content;
    for (const [key, t] of Object.entries(c.tables)) {
      const g = (x: string | { m: string; w: string }) => `'${typeof x === 'string' ? x : `${x.m}|${x.w}`}'`;
      const row = (side: typeof t.H) => `[${Object.values(side).map(g).join(',')}]`;
      expect(legacy, `Tabelle ${key}`).toContain(`${key}:[${row(t.H)},\n${row(t.S)}]`);
    }
  });
});
