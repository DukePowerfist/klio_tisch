// Prüft alle Inhaltsdateien: jede für sich (Zod) und untereinander (Verweise, Anzahlen).
// Bekommt bereits gelesene Daten; das Lesen von YAML passiert nur beim Build und in Tests.

import { z } from 'zod';
import { RANKS, SUITS } from '../../../engine/types.ts';
import { resolveText } from './texts.ts';
import {
  BookFile, DeckFile, ExpeditionFile, LayoutsFile, NamesFile, PermissionsFile, SheetFile, SkinFile,
  TablesFile, TextsFile, TrumpSourcesFile, TrumpsFile, ZonesFile, sheetFieldInstances, sheetFields, type TextTree,
} from './schema.ts';

export const CONTENT_FILES = {
  trumps: TrumpsFile,
  tables: TablesFile,
  expedition: ExpeditionFile,
  book: BookFile,
  names: NamesFile,
  deck: DeckFile,
  zones: ZonesFile,
  sheet: SheetFile,
  layouts: LayoutsFile,
  trumpSources: TrumpSourcesFile,
  permissions: PermissionsFile,
  texts: TextsFile,
  skinPaper: SkinFile,
} as const;

export type ContentKey = keyof typeof CONTENT_FILES;
export type KlioContent = { [K in ContentKey]: z.infer<(typeof CONTENT_FILES)[K]> };
export type RawContent = Record<ContentKey, unknown>;

export type ValidationResult = { ok: true; content: KlioContent } | { ok: false; errors: string[] };


export function validateContent(raw: RawContent): ValidationResult {
  const errors: string[] = [];
  const parsed: Partial<KlioContent> = {};
  for (const key of Object.keys(CONTENT_FILES) as ContentKey[]) {
    const result = CONTENT_FILES[key].safeParse(raw[key]);
    if (result.success) (parsed as Record<string, unknown>)[key] = result.data;
    else for (const issue of result.error.issues) errors.push(`${key}: ${issue.path.join('.') || '(Datei)'}: ${issue.message}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const c = parsed as KlioContent;
  crossCheck(c, errors);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, content: c };
}

function crossCheck(c: KlioContent, errors: string[]): void {
  const err = (msg: string) => errors.push(msg);
  const tableZones = Object.entries(c.zones).filter(([, z]) => !z.perSeat).map(([id]) => id);
  const seatZones = Object.entries(c.zones).filter(([, z]) => z.perSeat).map(([id]) => id);
  const isZone = (id: string) => id in c.zones;

  // Trümpfe
  const trumpIds = new Set<string>();
  for (const t of c.trumps) {
    if (trumpIds.has(t.id)) err(`trumps: ID doppelt: ${t.id}`);
    trumpIds.add(t.id);
    if (t.category === 'X' ? t.attributes.length < 2 : t.attributes.join() !== t.category) {
      err(`trumps: ${t.id}: Kategorie ${t.category} passt nicht zu Attributen ${t.attributes.join('')}`);
    }
    if (new Set(t.attributes).size !== t.attributes.length) err(`trumps: ${t.id}: Attribut doppelt`);
  }

  // Regelbuch (5zk): jede Doppelseite einmal, Buchmitte im Einband
  const spreadIds = c.book.spreads.map((s) => s.id);
  for (const id of spreadIds) if (spreadIds.indexOf(id) !== spreadIds.lastIndexOf(id)) err(`book: Doppelseite doppelt: ${id}`);
  const B = c.layouts.book;
  if (B.spine <= B.cover[0] || B.spine >= B.cover[0] + B.cover[2]) err('layouts: book.spine liegt nicht im Einband');
  // das Blatt klappt um die Buchmitte von einer Seite genau auf die andere
  const [pl, pr] = [B.pages.left, B.pages.right];
  if (pl[2] !== pr[2] || pl[1] !== pr[1] || pl[3] !== pr[3]) err('layouts: book.pages links und rechts sind nicht gleich groß oder gleich hoch');
  if (pl[0] + pl[2] > B.spine || pr[0] < B.spine || B.spine - (pl[0] + pl[2]) !== pr[0] - B.spine) err('layouts: book.pages liegen nicht spiegelbildlich zur Buchmitte');
  if (B.cover[0] + B.cover[2] > B.size[0] || B.cover[1] + B.cover[3] > B.size[1]) err('layouts: book.cover ragt aus dem Bild');

  // Karten: jede der 52 genau einmal, nur in Tischzonen
  const all = SUITS.flatMap((s) => RANKS.map((r) => s + r));
  const seen = new Map<string, string>();
  for (const [zone, cards] of Object.entries(c.deck.start)) {
    if (!tableZones.includes(zone)) err(`deck: Startzone ${zone} ist keine Tischzone in zones.yaml`);
    for (const card of cards) {
      if (seen.has(card)) err(`deck: ${card} kommt doppelt vor (${seen.get(card)}, ${zone})`);
      seen.set(card, zone);
    }
  }
  for (const card of all) if (!seen.has(card)) err(`deck: ${card} hat keine Startzone`);

  // Zonen: Verweise
  for (const [id, z] of Object.entries(c.zones)) {
    const a = z.actions;
    if (a?.draw && !isZone(a.draw.to)) err(`zones: ${id}: Ziehen nach unbekannter Zone ${a.draw.to}`);
    for (const g of a?.shuffle?.gather ?? []) if (!isZone(g.from)) err(`zones: ${id}: Einsammeln aus unbekannter Zone ${g.from}`);
    if (z.perSeat && a) err(`zones: ${id}: Platz-Zonen haben keine Stapel-Aktionen`);
  }

  // Bogen
  for (const z of c.sheet.zones) if (!seatZones.includes(z)) err(`sheet: Bogenzone ${z} fehlt in zones.yaml oder ist nicht perSeat`);
  for (const z of seatZones) if (!c.sheet.zones.includes(z)) err(`sheet: Platz-Zone ${z} fehlt in sheet.zones`);
  for (const [name, f] of Object.entries(c.sheet.fields)) {
    if (f.roll) {
      if (f.roll.length !== (f.count ?? 1)) err(`sheet: ${name}: roll braucht ${f.count ?? 1} Tabellen`);
      for (const t of f.roll) if (!(t in c.tables)) err(`sheet: ${name}: Tabelle ${t} fehlt in tables.yaml`);
    }
  }
  const trumpSlots = c.sheet.fields['trumps']?.count;
  if (trumpSlots !== c.trumpSources.maxTrumps) err(`trump-sources: maxTrumps ${c.trumpSources.maxTrumps} passt nicht zu ${trumpSlots} Trumpf-Plätzen in sheet.yaml`);

  // Haut: zeichnet jedes Feld und jede Bogenzone, nichts darüber hinaus
  const instances = new Set(sheetFieldInstances(c.sheet));
  // Erlebnislaterne (5zm): deckt alle Kästchen ihrer Liste ab; die haben dann keine eigene Position
  const lantern = c.skinPaper.lantern;
  const lanternList = c.sheet.fields[lantern.field];
  const lanternFields = new Set(lanternList?.kind === 'check' && lanternList.count ? Array.from({ length: lanternList.count }, (_, i) => `${lantern.field}.${i}`) : []);
  if (lanternFields.size === 0) err(`skins/paper: lantern.field ${lantern.field} ist keine Kästchenliste in sheet.yaml`);
  else {
    if (lantern.segments.length !== lanternFields.size) err(`skins/paper: lantern braucht ${lanternFields.size} Abschnitte`);
    if (lantern.flame.sizes.length !== lanternFields.size) err(`skins/paper: lantern.flame braucht ${lanternFields.size} Größen`);
  }
  for (const f of lanternFields) if (f in c.skinPaper.fields) err(`skins/paper: Feld ${f} gehört zur Laterne und hat trotzdem eine Position`);
  for (const f of instances) if (!lanternFields.has(f) && !(f in c.skinPaper.fields)) err(`skins/paper: Feld ${f} hat keine Position`);
  for (const f of Object.keys(c.skinPaper.fields)) if (!instances.has(f)) err(`skins/paper: unbekanntes Feld ${f}`);
  for (const z of c.sheet.zones) if (!(z in c.skinPaper.zones)) err(`skins/paper: Bogenzone ${z} hat keine Position`);
  // Kästchen, die ein Textfeld durchstreichen oder hervorheben, zeigen auf ein vorhandenes Textfeld
  const textIds = new Set(sheetFields(c.sheet).filter((f) => f.kind === 'text').map((f) => f.id));
  for (const f of sheetFields(c.sheet)) {
    for (const target of [f.strikes, f.emphasizes]) if (target && !textIds.has(target)) err(`sheet: ${f.id} verweist auf ${target}, das ist kein Textfeld`);
  }
  // Klickflächen (5z): ein Kästchen mit `hit` reicht in kein anderes Kästchen und kein Feld (Rand an Rand ist erlaubt)
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const kinds = new Map(sheetFields(c.sheet).map((f) => [f.id, f.kind]));
  const square = (x: number, y: number, s: number): Rect => ({ x0: x - s / 2, y0: y - s / 2, x1: x + s / 2, y1: y + s / 2 });
  const rects: [string, Rect, boolean][] = Object.entries(c.skinPaper.fields).flatMap(([id, p]): [string, Rect, boolean][] => {
    if ('size' in p) return [[id, square(p.x, p.y, Math.max(p.size, p.hit ?? 0)), p.hit !== undefined]];
    if ('w' in p && kinds.get(id) !== 'overlay') return [[id, { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }, false]];
    return [];
  });
  const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const [id, r, hit] of rects) {
    if (!hit) continue;
    for (const [other, o] of rects) if (other !== id && overlap(r, o)) err(`skins/paper: Klickfläche von ${id} reicht in ${other}`);
  }
  const lanternHit: Rect = { x0: lantern.hit.x, y0: lantern.hit.y, x1: lantern.hit.x + lantern.hit.w, y1: lantern.hit.y + lantern.hit.h };
  for (const [other, o] of rects) if (overlap(lanternHit, o)) err(`skins/paper: Klickfläche der Laterne reicht in ${other}`);
  // Knöpfe der Laterne: zwei übereinander um `steps`, in keinem Feld und keinem Kästchen
  const st = lantern.steps;
  const lanternSteps: Rect = { x0: st.x - st.size / 2, y0: st.y - st.size, x1: st.x + st.size / 2, y1: st.y + st.size };
  for (const [other, o] of rects) if (overlap(lanternSteps, o)) err(`skins/paper: Knöpfe der Laterne reichen in ${other}`);

  // Ansichten: jede Tischzone hat Form und Lage in der Tischmitte
  for (const z of tableZones) {
    if (!(z in c.layouts.shapes)) err(`layouts: Tischzone ${z} hat keine Form`);
    if (!(z in c.layouts.middle.zones)) err(`layouts: Tischzone ${z} fehlt in der Tischmitte`);
  }
  for (const z of seatZones) if (!(`seat.${z}` in c.layouts.shapes)) err(`layouts: Platz-Zone ${z} hat keine Form (seat.${z})`);

  // Texte: Beschriftung je Zone
  const zoneTexts = c.texts['zones'];
  for (const z of Object.keys(c.zones)) {
    if (typeof zoneTexts !== 'object' || typeof (zoneTexts as TextTree)[z] !== 'string') err(`texts: zones.${z} fehlt`);
  }
  // Name je wählbarer Farbe (5e)
  for (const k of c.layouts.seatColors) if (resolveText(c, `colors.${k}`) === undefined) err(`texts: colors.${k} fehlt`);
  // Bezeichnung je Recht für den Rechte-Dialog der SL (9.2)
  for (const k of Object.keys(c.permissions.player)) if (resolveText(c, `permissions.${k}`) === undefined) err(`texts: permissions.${k} fehlt`);
}
