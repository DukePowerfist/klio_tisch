// Formate der Inhaltsdateien in content/klio/ (ARCHITEKTUR.md 5, 7).
// Geprüft beim Build; ausgeliefert wird JSON. Beispiele stehen jeweils darüber.

import { z } from 'zod';

const Attr = z.enum(['K', 'V', 'P']); // Körper, Verstehen, Präsenz
const Rank = z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
const Suit = z.enum(['H', 'S', 'C', 'D']);

/** Text mit er/sie-Form oder ein Text für beide. */
const Gendered = z.union([z.string(), z.object({ m: z.string(), w: z.string() }).strict()]);

/** 13 Einträge, je Kartenwert genau einer (2 … A), wie im gedruckten Regelwerk nachprüfbar. */
const byRank = <T extends z.ZodType>(entry: T) =>
  z.object(Object.fromEntries(Rank.options.map((r) => [r, entry])) as Record<z.infer<typeof Rank>, T>).strict();

// ---------- trumps.yaml ----------
// - id: schnelle-reflexe          # fest, ändert sich nie (auch nicht bei Tippfehlerkorrektur im Namen)
//   category: K                   # K, V, P oder X (Verschiedene)
//   attributes: [K]               # Reihenfolge = Farbverlauf auf der Karte
//   level: 1
//   name: Schnelle Reflexe
//   text: Du hast Vorteil auf alle Körper-Reaktionen.
export const Trump = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(['K', 'V', 'P', 'X']),
  attributes: z.array(Attr).min(1).max(3),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  name: z.string().min(1),
  text: z.string().min(1),
}).strict();
export const TrumpsFile = z.array(Trump);

// ---------- tables.yaml (Zufallstabellen für den Bogen) ----------
// I:
//   H:
//     "2": { m: Draufgänger, w: Draufgängerin }
//     "3": …
//     "A": …
//   S:
//     "2": Historiker …
export const RollTable = z.object({ H: byRank(Gendered), S: byRank(Gendered) }).strict();
export const TablesFile = z.record(z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'VIII']), RollTable);

// ---------- expedition.yaml ----------
// expedition:
//   - prompt: Diese Expedition führt euch …
//     entries: [in eine eisige Bergwelt., …]     # 13, Reihenfolge wie in der alten Datei
// oracle:
//   H: { "2": bunt, …, "A": animalisch }
//   S: …
//   C: …
export const ExpeditionFile = z.object({
  expedition: z.array(z.object({ prompt: z.string(), entries: z.array(z.string()).length(13) }).strict()).length(4),
  oracle: z.object({ H: byRank(z.string()), S: byRank(z.string()), C: byRank(z.string()) }).strict(),
}).strict();

// ---------- names.yaml ----------
export const NamesFile = z.object({
  first: z.object({ m: z.array(z.string()).min(1), w: z.array(z.string()).min(1) }).strict(),
  last: z.array(z.string()).min(1),
}).strict();

// ---------- deck.yaml ----------
// start:
//   diamonds_easy:   [D2, D3, D4, D5, D6]
//   diamonds_medium: [D7, D8, D9, D10]
//   diamonds_hard:   [DJ, DQ, DK, DA]
//   clubs:           [C2, …, CK]
//   deck:            [HA, SA, CA, H2, …, HK, S2, …, SK]
// Heimatstapel einer Karte = ihre Startzone (Karo 2–6 → LEICHT usw., wie bisher).
// Karten ohne Startzone sind ein Build-Fehler; jede Karte kommt genau einmal vor.
const CardIdStr = z.string().regex(/^[HSCD](10|[2-9JQKA])$/);
export const DeckFile = z.object({
  start: z.record(z.string(), z.array(CardIdStr)),
}).strict();

// ---------- zones.yaml ----------
// Format siehe ARCHITEKTUR.md 7 (Stapel-Aktionen). Beschriftungen stehen in texts.de.yaml.
const GatherRule = z.object({ from: z.string(), suit: Suit.optional(), to: z.literal('home').optional() }).strict();
export const ZoneEntry = z.object({
  perSeat: z.boolean().optional(),
  fanned: z.boolean().optional(),
  capacity: z.number().int().positive().optional(),
  onDrop: z.literal('faceUp').optional(),
  actions: z.object({
    shuffle: z.object({ gather: z.array(GatherRule).optional() }).strict().optional(),
    draw: z.object({ to: z.string(), faceUp: z.boolean(), announce: z.boolean() }).strict().optional(),
    flip: z.enum(['top', 'draw']).optional(),
    cardDoubleClick: z.object({ faceDown: z.literal('draw') }).strict().optional(),
  }).strict().optional(),
}).strict();
export const ZonesFile = z.record(z.string(), ZoneEntry);

// ---------- sheet.yaml (WAS auf dem Bogen steht) ----------
// fields:
//   name:               { kind: text }
//   attributes:         { kind: number, keys: [K, V, P] }
//   strengths.text:     { kind: text, count: 5, roll: [I, II, III, IV, V] }
//   strengths.improved: { kind: check, count: 5 }
//   …
// zones: [damage, notes, collect]      # Bogenzonen aus zones.yaml (perSeat)
// roll: { attributeTotal: 4 }
const TableKey = z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'VIII']);
export const SheetField = z.object({
  kind: z.enum(['text', 'number', 'check', 'photo', 'trumpSlot', 'overlay']),
  count: z.number().int().positive().optional(),
  keys: z.array(z.string()).min(1).optional(),
  roll: z.array(TableKey).optional(),
  distinct: z.boolean().optional(),
}).strict().refine((f) => !(f.count && f.keys), 'count und keys schließen sich aus');
export const SheetFile = z.object({
  fields: z.record(z.string(), SheetField),
  zones: z.array(z.string()),
  roll: z.object({ attributeTotal: z.number().int().nonnegative() }).strict(),
}).strict();

/** Alle Einzelfelder eines Bogens, z. B. `strengths.text.0`, `attributes.K`, `name`. */
export function sheetFieldInstances(sheet: z.infer<typeof SheetFile>): string[] {
  return Object.entries(sheet.fields).flatMap(([name, f]) =>
    f.keys ? f.keys.map((k) => `${name}.${k}`) : f.count ? Array.from({ length: f.count }, (_, i) => `${name}.${i}`) : [name],
  );
}

// ---------- skins/paper.yaml (WIE der Bogen aussieht, Haut „Papier“) ----------
// size: [662, 936]                       # Bildkoordinaten
// images: { m: sheet/paper-m.jpg, w: sheet/paper-w.jpg }
// fields:
//   name: { x: 146, y: 122, w: 112, h: 25, font: 21 }    # Feld: linke obere Ecke + Größe
//   scars.heart: { x: 551, y: 93, size: 30 }             # Kästchen: Mittelpunkt + Größe
// zones:
//   damage: { x: 519.2, y: 125.4, w: 139.4, h: 195.1 }   # bisher 380er-Koordinaten, umgerechnet
const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), font: z.number().optional() }).strict();
const Check = z.object({ x: z.number(), y: z.number(), size: z.number() }).strict();
export const SkinFile = z.object({
  size: z.tuple([z.number(), z.number()]),
  images: z.object({ m: z.string(), w: z.string() }).strict(),
  fields: z.record(z.string(), z.union([Box, Check])),
  zones: z.record(z.string(), Box),
}).strict();

// ---------- layouts.yaml ----------
// Siehe Datei; Werte aus der alten Datei. Sitzplatz-Zonen heißen hier `seat.<zone>`.
const Point = z.tuple([z.number(), z.number()]);
const Shape = z.object({
  w: z.number().optional(),
  h: z.number().optional(),
  scale: z.number().optional(),
  fanX: z.number().optional(),
  fanY: z.number().optional(),
  growOnOpen: z.boolean().optional(),
}).strict();
const View = <S extends z.ZodType>(sheets: S) =>
  z.object({ zones: z.record(z.string(), Point), menu: Point, resistTitle: Point, sheets }).strict();
export const LayoutsFile = z.object({
  board: Point,
  card: Point,
  freeCardScale: z.number(),
  shapes: z.record(z.string(), Shape),
  overview: View(z.object({ margin: z.number(), gap: z.number(), scaleUpTo2Players: z.number(), scaleFrom3Players: z.number() }).strict()),
  role: View(z.object({
    own: z.object({ x: z.number(), y: z.number(), scale: z.literal('fit') }).strict(),
    others: z.object({ x: z.number(), gap: z.number(), bottomMargin: z.number(), scale: z.number(), opacity: z.number() }).strict(),
    panel: z.object({ x: z.number(), y: z.number() }).strict(),
  }).strict()),
}).strict();

// ---------- trump-sources.yaml ----------
// Format siehe ARCHITEKTUR.md 7. Bausteinnamen sind eine feste Liste (blocks/), Tippfehler fallen beim Build auf.
// Jeder Baustein mit seinen erlaubten Parametern; die TS-Funktionen dazu folgen in Schritt 2.
const CheckList = z.enum(['weaknessMarks', 'lamps']);
const one = <K extends string, T extends z.ZodType>(key: K, value: T) => z.object({ [key]: value } as Record<K, T>).strict();
const Requires = z.union([
  z.literal('noTrumpYet'),
  one('allMarked', CheckList),
  one('atLeast', z.object({ newScars: z.number().int().positive() }).strict()),
]);
const Step = z.union([
  z.literal('chooseWeaknessToRemove'),
  z.literal('moveAttributePoint'),
  one('improveStrength', z.enum(['optional', 'required'])),
]);
const Filter = z.enum(['matchesHighestAttribute', 'needsRaisedAttribute']);
const Afterwards = z.union([one('clear', CheckList), one('decrement', z.literal('newScars'))]);
const Always = z.literal('noDuplicate');

export const TrumpSourcesFile = z.object({
  maxTrumps: z.number().int().positive(),
  always: z.array(Always),
  whenFull: z.enum(['blocked', 'improveOnly']),
  trumpSources: z.array(z.object({
    id: z.string(),
    text: z.object({ name: z.string(), desc: z.string(), why: z.string() }).strict(),
    requires: z.array(Requires),
    steps: z.array(Step).optional(),
    levels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).min(1),
    filters: z.array(Filter).optional(),
    whenFull: z.enum(['blocked', 'improveOnly']).optional(),
    afterwards: z.array(Afterwards).optional(),
  }).strict()),
  freeChoice: z.boolean(),
  randomChoice: z.literal('firstAvailableSource'),
}).strict();

// ---------- permissions.yaml ----------
const Perm = z.enum(['allow', 'deny', 'own']);
export const PermissionsFile = z.object({
  gm: z.literal('all'),
  player: z.record(z.string(), Perm),
  spectator: z.union([z.literal('none'), z.record(z.string(), Perm)]),
}).strict();

// ---------- texts.de.yaml ----------
// Verschachtelte Schlüssel, Platzhalter in geschweiften Klammern:
// toast:
//   drawn: "Aufgedeckt: {card}"
//   scar: "Bogen {seat}: Narbe markiert ({suit})"
export type TextTree = { [key: string]: string | TextTree };
export const TextsFile: z.ZodType<TextTree> = z.lazy(() => z.record(z.string(), z.union([z.string(), TextsFile])));
