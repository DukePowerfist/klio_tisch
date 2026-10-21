// Formate der Inhaltsdateien in content/klio/ (ARCHITEKTUR.md 5, 7).
// Geprüft beim Build; ausgeliefert wird JSON. Beispiele stehen jeweils darüber.

import { z } from 'zod';
import { CardIdSchema, PermissionValueSchema, RankSchema as Rank, SeatColorSchema, SeatSchema, SuitSchema as Suit } from '../../../engine/schemas';
import { AttrSchema as Attr, TrumpId } from '../state';

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
  id: TrumpId,
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
export const DeckFile = z.object({
  start: z.record(z.string(), z.array(CardIdSchema)),
}).strict();

// ---------- zones.yaml ----------
// Format siehe ARCHITEKTUR.md 7 (Stapel-Aktionen). Beschriftungen stehen in texts.de.yaml.
const GatherRule = z.object({ from: z.string(), suit: Suit.exactOptional(), to: z.literal('home').exactOptional() }).strict();
export const ZoneEntry = z.object({
  perSeat: z.boolean().exactOptional(),
  fanned: z.boolean().exactOptional(),
  capacity: z.number().int().positive().exactOptional(),
  onDrop: z.literal('faceUp').exactOptional(),
  actions: z.object({
    shuffle: z.object({ gather: z.array(GatherRule).exactOptional() }).strict().exactOptional(),
    draw: z.object({ to: z.string(), faceUp: z.boolean(), announce: z.boolean() }).strict().exactOptional(),
    flip: z.enum(['top', 'draw']).exactOptional(),
    cardDoubleClick: z.object({ faceDown: z.literal('draw') }).strict().exactOptional(),
  }).strict().exactOptional(),
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
  kind: z.enum(['text', 'number', 'check', 'counter', 'photo', 'trumpSlot', 'overlay']),
  count: z.number().int().positive().optional(),
  keys: z.array(z.string()).min(1).optional(),
  roll: z.array(TableKey).optional(),
  distinct: z.boolean().optional(),
  /** nur bei check: streicht das Textfeld gleicher Nummer durch */
  strikes: z.string().optional(),
}).strict().refine((f) => !(f.count && f.keys), 'count und keys schließen sich aus');
export const SheetFile = z.object({
  fields: z.record(z.string(), SheetField),
  zones: z.array(z.string()),
  roll: z.object({ attributeTotal: z.number().int().nonnegative() }).strict(),
}).strict();

export type SheetFieldKind = z.infer<typeof SheetField>['kind'];
/** Ein Einzelfeld: `id` z. B. `strengths.text.0`; `strikes` = ID des durchgestrichenen Textfelds. */
export type SheetFieldInstance = { id: string; kind: SheetFieldKind; strikes?: string };

/** Alle Einzelfelder eines Bogens samt Art, z. B. `strengths.text.0`, `attributes.K`, `name`. */
export function sheetFields(sheet: z.infer<typeof SheetFile>): SheetFieldInstance[] {
  return Object.entries(sheet.fields).flatMap(([name, f]) => {
    const suffixes = f.keys ?? (f.count ? Array.from({ length: f.count }, (_, i) => String(i)) : [null]);
    return suffixes.map((s) => ({
      id: s === null ? name : `${name}.${s}`,
      kind: f.kind,
      ...(f.strikes && s !== null ? { strikes: `${f.strikes}.${s}` } : {}),
    }));
  });
}

export const sheetFieldInstances = (sheet: z.infer<typeof SheetFile>): string[] => sheetFields(sheet).map((f) => f.id);

// ---------- skins/paper.yaml (WIE der Bogen aussieht, Haut „Papier“) ----------
// size: [662, 936]                       # Bildkoordinaten
// images: { m: sheet/paper-m.jpg, w: sheet/paper-w.jpg }
// fields:
//   name: { x: 146, y: 122, w: 112, h: 25, font: 21 }    # Feld: linke obere Ecke + Größe
//   scars.heart: { x: 551, y: 93, size: 30 }             # Kästchen: Mittelpunkt + Größe
// zones:
//   damage: { x: 519.2, y: 125.4, w: 139.4, h: 195.1 }   # bisher 380er-Koordinaten, umgerechnet
// nameplate: { x: 8, y: 8, w: 232, h: 40, font: 26 }  # Namensschild in der Draufsicht (5b)
// rollButton: { x: 315, y: 8, w: 260, font: 13 }  # „Auswürfeln“: linke obere Ecke, Breite, Schrift (5b)
const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), font: z.number().optional(), align: z.literal('center').optional() }).strict();
const Check = z.object({ x: z.number(), y: z.number(), size: z.number(), font: z.number().optional(), tone: z.literal('danger').optional() }).strict();
const Label = z.object({ x: z.number(), y: z.number(), font: z.number() }).strict();
export type SkinBox = z.infer<typeof Box>;
export type SkinCheck = z.infer<typeof Check>;
export const SkinFile = z.object({
  size: z.tuple([z.number(), z.number()]),
  images: z.object({ m: z.string(), w: z.string() }).strict(),
  fields: z.record(z.string(), z.union([Box, Check, Label])),
  zones: z.record(z.string(), Box),
  nameplate: Box,
  rollButton: Label.extend({ w: z.number() }),
}).strict();

// ---------- layouts.yaml ----------
// Siehe Datei. Sitzplatz-Zonen heißen hier `seat.<zone>`. Tischzonen, festes Menü, Überschrift und SL-Leiste liegen
// relativ zur Tischmitte (`middle`), die beide Ansichten nur verschieben (ARCHITEKTUR.md 10, Schritt 5d).
const Point = z.tuple([z.number(), z.number()]);
const MenuSide = z.enum(['fixed', 'left', 'right', 'below']);
const Shape = z.object({
  w: z.number().optional(),
  h: z.number().optional(),
  scale: z.number().optional(),
  fanX: z.number().optional(),
  fanY: z.number().optional(),
  growOnOpen: z.boolean().optional(),
  menu: MenuSide.optional(),
  label: z.object({ center: z.boolean().optional(), rotated: z.boolean().optional(), x: z.number().optional() }).strict().optional(),
}).strict();
export const LayoutsFile = z.object({
  board: Point,
  seatColors: z.array(SeatColorSchema).min(4).refine((c) => new Set(c).size === c.length, 'Farbe doppelt'),
  card: Point,
  freeCardScale: z.number(),
  shapes: z.record(z.string(), Shape),
  middle: z.object({
    size: Point, zones: z.record(z.string(), Point), menu: Point, resistTitle: Point, gmControlsInset: Point,
  }).strict(),
  overview: z.object({
    middle: Point,
    sheets: z.object({
      margin: z.number(), gap: z.number(), scaleUpTo2Players: z.number(), scaleFrom3Players: z.number(),
      columns: z.tuple([z.array(SeatSchema), z.array(SeatSchema)]),
    }).strict(),
  }).strict(),
  role: z.object({
    middle: Point,
    sheets: z.object({
      own: z.object({ x: z.number(), y: z.number(), scale: z.literal('fit') }).strict(),
      others: z.object({
        x: z.number(), w: z.number(), top: z.number(), gap: z.number(), bottomMargin: z.number(), maxScale: z.number(), opacity: z.number(),
      }).strict(),
    }).strict(),
  }).strict(),
}).strict();

// ---------- trump-sources.yaml ----------
// Format siehe ARCHITEKTUR.md 7. Bausteinnamen sind eine feste Liste (blocks/), Tippfehler fallen beim Build auf.
// Jeder Baustein mit seinen erlaubten Parametern; die TS-Funktionen dazu stehen in blocks/.
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
    text: z.object({ name: z.string(), desc: z.string(), why: z.string(), levelWhy: z.string().optional() }).strict(),
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
export const PermissionsFile = z.object({
  gm: z.literal('all'),
  player: z.record(z.string(), PermissionValueSchema),
  spectator: z.union([z.literal('none'), z.record(z.string(), PermissionValueSchema)]),
}).strict();

// ---------- texts.de.yaml ----------
// Verschachtelte Schlüssel, Platzhalter in geschweiften Klammern:
// toast:
//   drawn: "Aufgedeckt: {card}"
//   scar: "Bogen {seat}: Narbe markiert ({suit})"
export type TextTree = { [key: string]: string | TextTree };
export const TextsFile: z.ZodType<TextTree> = z.lazy(() => z.record(z.string(), z.union([z.string(), TextsFile])));
