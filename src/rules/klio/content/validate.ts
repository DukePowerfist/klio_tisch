// Prüft alle Inhaltsdateien: jede für sich (Zod) und untereinander (Verweise, Anzahlen).
// Bekommt bereits gelesene Daten; das Lesen von YAML passiert nur beim Build und in Tests.

import { z } from 'zod';
import { RANKS, SUITS } from '../../../engine/types';
import { resolveText } from './texts';
import {
  DeckFile, ExpeditionFile, LayoutsFile, NamesFile, PermissionsFile, SheetFile, SkinFile,
  TablesFile, TextsFile, TrumpSourcesFile, TrumpsFile, ZonesFile, sheetFieldInstances, type TextTree,
} from './schema';

export const CONTENT_FILES = {
  trumps: TrumpsFile,
  tables: TablesFile,
  expedition: ExpeditionFile,
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
  for (const f of instances) if (!(f in c.skinPaper.fields)) err(`skins/paper: Feld ${f} hat keine Position`);
  for (const f of Object.keys(c.skinPaper.fields)) if (!instances.has(f)) err(`skins/paper: unbekanntes Feld ${f}`);
  for (const z of c.sheet.zones) if (!(z in c.skinPaper.zones)) err(`skins/paper: Bogenzone ${z} hat keine Position`);

  // Ansichten: jede Tischzone hat Form und Lage in beiden Ansichten
  for (const z of tableZones) {
    if (!(z in c.layouts.shapes)) err(`layouts: Tischzone ${z} hat keine Form`);
    if (!(z in c.layouts.overview.zones)) err(`layouts: Tischzone ${z} fehlt in der Draufsicht`);
    if (!(z in c.layouts.role.zones)) err(`layouts: Tischzone ${z} fehlt in der Rollenansicht`);
  }
  for (const z of seatZones) if (!(`seat.${z}` in c.layouts.shapes)) err(`layouts: Platz-Zone ${z} hat keine Form (seat.${z})`);

  // Texte: Beschriftung je Zone
  const zoneTexts = c.texts['zones'];
  for (const z of Object.keys(c.zones)) {
    if (typeof zoneTexts !== 'object' || typeof (zoneTexts as TextTree)[z] !== 'string') err(`texts: zones.${z} fehlt`);
  }
  // Bezeichnung je Recht für den Rechte-Dialog der SL (9.2)
  for (const k of Object.keys(c.permissions.player)) if (resolveText(c, `permissions.${k}`) === undefined) err(`texts: permissions.${k} fehlt`);
}
