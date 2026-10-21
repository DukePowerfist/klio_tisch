// Charakterdatei (10.1, Schritt 5j): ein Bogen samt Foto als JSON, zum Mitnehmen in eine andere Runde.
// Rein (ohne Sitzung), damit testbar; Speichern, Foto ablegen und `sheet.import` übernimmt sheetActions.ts.

import { z } from 'zod';
import { FORMAT } from '../engine/setup';
import type { TextRef } from '../engine/types';
import { PhotoDataSchema, sha256Hex, toBase64 } from '../net/photos';
import { KlioSheet } from '../rules/klio/state';

export const CHARACTER_KIND = 'klio-charakter';

/** Ältestes Format mit gleichem Bogen: Charakterdateien von dort bis `FORMAT` lassen sich laden (A36; 5n hat nur den
 *  Tisch geändert, nicht den Bogen). Ändert sich der Bogen, steigt dieser Wert, oder es kommt eine Migration dazu. */
export const SHEET_SINCE = 3;

/** Inhalt der Datei; das Foto steht als Base64 daneben, sein Name (Hash) ergibt sich beim Laden */
const CharacterFileSchema = z.object({
  kind: z.literal(CHARACTER_KIND),
  format: z.number().int(),
  sheet: KlioSheet,
  photo: PhotoDataSchema.optional(),
}).strict();

export type ReadCharacter = { ok: true; sheet: KlioSheet; photo: { hash: string; bytes: Uint8Array<ArrayBuffer> } | null } | { ok: false; reason: TextRef };

/** Datei schreiben: Bogen ohne Fotoverweis, Foto (falls vorhanden) als Base64 */
export function writeCharacter(sheet: KlioSheet, photo: Uint8Array | null): string {
  const file = { kind: CHARACTER_KIND, format: FORMAT, sheet: { ...sheet, photo: null }, ...(photo ? { photo: toBase64(photo) } : {}) };
  return JSON.stringify(file, null, 2);
}

/** Datei lesen und prüfen. Nur das aktuelle Format (A36); aus einer neueren Fassung eigener Hinweis. */
export async function readCharacter(text: string): Promise<ReadCharacter> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: { key: 'plate.importInvalid' } };
  }
  const format = (raw as { format?: unknown } | null)?.format;
  if ((raw as { kind?: unknown } | null)?.kind === CHARACTER_KIND && typeof format === 'number' && format > FORMAT) return { ok: false, reason: { key: 'plate.importNewer' } };
  const r = CharacterFileSchema.safeParse(raw);
  if (!r.success || r.data.format < SHEET_SINCE || r.data.format > FORMAT) return { ok: false, reason: { key: 'plate.importInvalid' } };
  if (!r.data.photo) return { ok: true, sheet: { ...r.data.sheet, photo: null }, photo: null };
  const bytes = fromBase64(r.data.photo);
  const hash = await sha256Hex(bytes);
  return { ok: true, sheet: { ...r.data.sheet, photo: { hash, type: 'image/jpeg' } }, photo: { hash, bytes } };
}

/** Dateiname nach dem Charakter, ohne Zeichen, die Dateisysteme stören */
export const characterFileName = (character: string): string => `${character.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Charakter'}.klio-charakter.json`;

function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
