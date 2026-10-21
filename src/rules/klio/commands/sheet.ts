// Bogen bearbeiten: Text, Kästchen, Zahlen, Foto, Auswürfeln; ganzen Bogen leeren oder ersetzen (5j).

import { z } from 'zod';
import type { Change } from '../blocks';
import type { SeatId } from '../../../engine/types';
import { fieldKind, getField, type FieldKind, type FieldValue } from '../fields';
import { sheetOf, type KlioTable } from '../events';
import { rollSheet } from '../generators/rollSheet';
import { KlioSheet, PhotoRef } from '../state';
import { trumpById } from '../trumps';
import { command, reject, Seat, type Deps } from './common';

const MAX_TEXT = 200;

/** Feld einer bestimmten Art auf einen Wert setzen; unverändert → keine Ereignisse. */
const setValue = (kind: FieldKind) => (cmd: { seat: SeatId; field: string; value: FieldValue }, state: KlioTable) => {
  if (fieldKind(cmd.field) !== kind) return reject('reject.unknownField');
  if (getField(sheetOf(state, cmd.seat), cmd.field) === cmd.value) return [];
  return [{ type: 'fieldsChanged', seat: cmd.seat, changes: [{ field: cmd.field, value: cmd.value }] }];
};

/** alle Texte eines Bogens (für die Längenprüfung beim Import, wie bei `sheet.setText`) */
const texts = (b: KlioSheet): string[] => [b.name, ...b.strengths.map((x) => x.text), ...b.weaknesses, ...b.experiences, ...b.gear.map((x) => x.text)];

export function sheetCommands(deps: Deps) {
  return {
    'sheet.setText': command(
      z.object({ type: z.literal('sheet.setText'), seat: Seat, field: z.string(), value: z.string().max(MAX_TEXT) }).strict(),
      'sheet.edit',
      setValue('text'),
    ),

    'sheet.toggle': command(
      z.object({ type: z.literal('sheet.toggle'), seat: Seat, field: z.string() }).strict(),
      'sheet.edit',
      (cmd, state) => {
        if (fieldKind(cmd.field) !== 'check') return reject('reject.unknownField');
        const sheet = sheetOf(state, cmd.seat);
        const on = !getField(sheet, cmd.field);
        const changes: Change[] = [{ field: cmd.field, value: on }];
        // Von Hand markierte Narbe zählt als neue Narbe (A4), abhaken zieht ab (nicht unter 0)
        if (cmd.field.startsWith('scars.')) changes.push({ field: 'newScars', value: Math.max(0, sheet.newScars + (on ? 1 : -1)) });
        return [{ type: 'fieldsChanged', seat: cmd.seat, changes }];
      },
    ),

    'sheet.setNumber': command(
      z.object({ type: z.literal('sheet.setNumber'), seat: Seat, field: z.string(), value: z.number().int().min(0).max(9).nullable() }).strict(),
      'sheet.edit',
      setValue('number'),
    ),

    'sheet.setPhoto': command(
      z.object({ type: z.literal('sheet.setPhoto'), seat: Seat, photo: PhotoRef.nullable() }).strict(),
      'sheet.photo',
      (cmd) => [{ type: 'photoSet', seat: cmd.seat, photo: cmd.photo }],
    ),

    'sheet.roll': command(
      z.object({ type: z.literal('sheet.roll'), seat: Seat }).strict(),
      'sheet.roll',
      (cmd, _state, _actor, rng) => [rollSheet(deps.content, cmd.seat, rng)],
    ),

    // Ganzer Bogen (5j, 10.1): leeren bzw. aus einer Charakterdatei ersetzen. Person, Farbe und Karten bleiben.
    'sheet.reset': command(
      z.object({ type: z.literal('sheet.reset'), seat: Seat }).strict(),
      'sheet.replace',
      (cmd) => [{ type: 'characterReset', seat: cmd.seat }],
    ),

    'sheet.import': command(
      z.object({ type: z.literal('sheet.import'), seat: Seat, sheet: KlioSheet }).strict(),
      'sheet.replace',
      (cmd) => {
        if (texts(cmd.sheet).some((t) => t.length > MAX_TEXT)) return reject('reject.invalid');
        if (cmd.sheet.trumps.some((id) => id !== null && !trumpById(deps.content.trumps, id))) return reject('reject.unknownTrump');
        return [{ type: 'characterImported', seat: cmd.seat, sheet: cmd.sheet }];
      },
    ),
  };
}
