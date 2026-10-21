// Klio-Ereignisse (ARCHITEKTUR.md 6.2): Schema und Anwendung auf den Stand.
// Ereignisse enthalten alle Zufallsergebnisse, damit Clients nie selbst würfeln.

import { z } from 'zod';
import { CardIdSchema, RankSchema, SeatSchema as Seat } from '../../engine/schemas';
import { SEATS, type EventDef, type SeatId, type TableState } from '../../engine/types';
import { setField } from './fields';
import { emptySheet, Expedition, KlioSheet, Oracle, PhotoRef, RolledAttributes, ScarSchema, Slot, TrumpId, type KlioState } from './state';

export type KlioTable = TableState<KlioState>;

const FieldValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const sheetOf = (s: KlioTable, seat: SeatId): KlioSheet => s.game.sheets[SEATS.indexOf(seat)]!;

const E = {
  /** beliebige Feldänderungen an einem Bogen (Eintippen, Kästchen, Folgen einer Trumpfwahl) */
  fieldsChanged: z.object({ type: z.literal('fieldsChanged'), seat: Seat, changes: z.array(z.object({ field: z.string(), value: FieldValue }).strict()).min(1) }).strict(),
  sheetRolled: z.object({
    type: z.literal('sheetRolled'),
    seat: Seat,
    variant: z.enum(['m', 'w']),
    name: z.string(),
    strengths: z.array(z.string()).length(5),
    weaknesses: z.array(z.string()).length(2),
    attributes: RolledAttributes,
    experiences: z.array(z.string()).length(3),
    /** gezogene Karte je Tabellenzeile, für Meldung und Nachvollziehbarkeit */
    draws: z.array(z.object({ table: z.string(), suit: z.enum(['H', 'S']), rank: RankSchema }).strict()),
  }).strict(),
  photoSet: z.object({ type: z.literal('photoSet'), seat: Seat, photo: PhotoRef.nullable() }).strict(),
  /** Trumpf gewählt; bei „Erlebnis“ mit vier Trümpfen ohne Trumpf (nur Verbesserung) */
  trumpChosen: z.object({ type: z.literal('trumpChosen'), seat: Seat, source: z.string(), trump: TrumpId.nullable(), slot: Slot.nullable() }).strict(),
  trumpRemoved: z.object({ type: z.literal('trumpRemoved'), seat: Seat, slot: Slot }).strict(),
  /** Treffer auf dem Schadensfeld (für Rucken/Hervorhebung), danach scarMarked/characterDied */
  damageTaken: z.object({ type: z.literal('damageTaken'), seat: Seat, hits: z.array(CardIdSchema).min(1) }).strict(),
  scarMarked: z.object({ type: z.literal('scarMarked'), seat: Seat, scar: ScarSchema }).strict(),
  characterDied: z.object({ type: z.literal('characterDied'), seat: Seat }).strict(),
  characterRevived: z.object({ type: z.literal('characterRevived'), seat: Seat }).strict(),
  charactersReset: z.object({ type: z.literal('charactersReset') }).strict(),
  /** ein Bogen geleert bzw. aus einer Charakterdatei ersetzt (5j) */
  characterReset: z.object({ type: z.literal('characterReset'), seat: Seat }).strict(),
  characterImported: z.object({ type: z.literal('characterImported'), seat: Seat, sheet: KlioSheet }).strict(),
  expeditionRolled: z.object({ type: z.literal('expeditionRolled'), expedition: Expedition }).strict(),
  oracleDrawn: z.object({ type: z.literal('oracleDrawn'), oracle: Oracle }).strict(),
};

export type KlioEvent = { [K in keyof typeof E]: z.infer<(typeof E)[K]> }[keyof typeof E];
export type KlioEventOf<T extends KlioEvent['type']> = Extract<KlioEvent, { type: T }>;

function def<T extends keyof typeof E>(type: T, apply: (s: KlioTable, e: KlioEventOf<T>) => void): EventDef<KlioState, KlioEventOf<T>> {
  return {
    parse: (x) => E[type].parse(x) as KlioEventOf<T>,
    apply: (s, e) => {
      apply(s, e);
      return s;
    },
  };
}

export const klioEvents = {
  fieldsChanged: def('fieldsChanged', (s, e) => {
    const sheet = sheetOf(s, e.seat);
    for (const c of e.changes) setField(sheet, c.field, c.value);
  }),
  sheetRolled: def('sheetRolled', (s, e) => {
    const sheet = sheetOf(s, e.seat);
    sheet.variant = e.variant;
    sheet.name = e.name;
    e.strengths.forEach((t, i) => (sheet.strengths[i]!.text = t));
    sheet.weaknesses = [...e.weaknesses];
    sheet.attributes = { ...e.attributes };
    sheet.experiences = [...e.experiences];
  }),
  photoSet: def('photoSet', (s, e) => {
    sheetOf(s, e.seat).photo = e.photo;
  }),
  trumpChosen: def('trumpChosen', (s, e) => {
    if (e.trump !== null && e.slot !== null) sheetOf(s, e.seat).trumps[e.slot] = e.trump;
  }),
  trumpRemoved: def('trumpRemoved', (s, e) => {
    sheetOf(s, e.seat).trumps[e.slot] = null;
  }),
  damageTaken: def('damageTaken', () => {}),
  scarMarked: def('scarMarked', (s, e) => {
    const sheet = sheetOf(s, e.seat);
    sheet.scars[e.scar] = true;
    sheet.newScars += 1;
  }),
  characterDied: def('characterDied', (s, e) => {
    sheetOf(s, e.seat).dead = true;
  }),
  characterRevived: def('characterRevived', (s, e) => {
    sheetOf(s, e.seat).dead = false;
  }),
  charactersReset: def('charactersReset', (s) => {
    s.game.sheets = s.game.sheets.map(() => emptySheet());
  }),
  characterReset: def('characterReset', (s, e) => {
    s.game.sheets[SEATS.indexOf(e.seat)] = emptySheet();
  }),
  characterImported: def('characterImported', (s, e) => {
    s.game.sheets[SEATS.indexOf(e.seat)] = structuredClone(e.sheet);
  }),
  expeditionRolled: def('expeditionRolled', (s, e) => {
    s.game.expedition = [...e.expedition];
  }),
  oracleDrawn: def('oracleDrawn', (s, e) => {
    s.game.oracle = [{ ...e.oracle[0] }, { ...e.oracle[1] }];
  }),
} satisfies { [K in keyof typeof E]: EventDef<KlioState, KlioEventOf<K>> };
