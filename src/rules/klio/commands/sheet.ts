// Bogen bearbeiten: Text, Kästchen, Zahlen, Foto, Auswürfeln.

import { z } from 'zod';
import type { Change } from '../blocks';
import { fieldKind, getField } from '../fields';
import { sheetOf } from '../events';
import { rollSheet } from '../generators/rollSheet';
import { PhotoRef } from '../state';
import { command, reject, Seat, type Deps } from './common';

const MAX_TEXT = 200;

export function sheetCommands(deps: Deps) {
  return {
    'sheet.setText': command(
      z.object({ type: z.literal('sheet.setText'), seat: Seat, field: z.string(), value: z.string().max(MAX_TEXT) }).strict(),
      'sheet.edit',
      (cmd, state) => {
        if (fieldKind(cmd.field) !== 'text') return reject('reject.unknownField');
        if (getField(sheetOf(state, cmd.seat), cmd.field) === cmd.value) return [];
        return [{ type: 'fieldsChanged', seat: cmd.seat, changes: [{ field: cmd.field, value: cmd.value }] }];
      },
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
      (cmd, state) => {
        if (fieldKind(cmd.field) !== 'number') return reject('reject.unknownField');
        if (getField(sheetOf(state, cmd.seat), cmd.field) === cmd.value) return [];
        return [{ type: 'fieldsChanged', seat: cmd.seat, changes: [{ field: cmd.field, value: cmd.value }] }];
      },
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
  };
}
