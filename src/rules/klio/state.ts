// Klio-Teil des Spielstands (TableState.game), ARCHITEKTUR.md 6.1.
// Listenlängen kommen aus sheet.yaml und werden beim Build gegen dieses Schema geprüft.

import { z } from 'zod';

export const TrumpId = z.string().regex(/^[a-z0-9-]+$/);

/** Verweis auf ein Foto, benannt nach seinem Hash (8.4). */
export const PhotoRef = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/), type: z.literal('image/jpeg') }).strict();

const Attribute = z.number().int().min(0).max(9).nullable();

export const KlioSheet = z.object({
  variant: z.enum(['m', 'w']),
  name: z.string(),
  photo: PhotoRef.nullable(),
  attributes: z.object({ K: Attribute, V: Attribute, P: Attribute }).strict(),
  strengths: z.array(z.object({ text: z.string(), improved: z.boolean() }).strict()).length(5),
  weaknesses: z.array(z.string()).length(2),
  weaknessMarks: z.array(z.boolean()).length(3),
  scars: z.object({ heart: z.boolean(), spade: z.boolean() }).strict(),
  newScars: z.number().int().min(0),
  lamps: z.array(z.boolean()).length(3),
  experiences: z.array(z.string()).length(3),
  gear: z.array(z.object({ text: z.string(), struck: z.boolean() }).strict()).length(7),
  trumps: z.array(TrumpId.nullable()).length(4),
  dead: z.boolean(),
}).strict();
export type KlioSheet = z.infer<typeof KlioSheet>;

const OracleDraw = z.object({ suit: z.enum(['H', 'S', 'C']), rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) }).strict();

export const KlioState = z.object({
  /** ein Bogen je Sitzplatz, Index 0 = seat1 */
  sheets: z.array(KlioSheet).length(4),
  /** je Expeditionstabelle I–IV der Index des gewürfelten Eintrags */
  expedition: z.array(z.number().int().min(0).max(12)).length(4).nullable(),
  oracle: z.tuple([OracleDraw, OracleDraw]).nullable(),
}).strict();
export type KlioState = z.infer<typeof KlioState>;

export function emptySheet(): KlioSheet {
  return {
    variant: 'm',
    name: '',
    photo: null,
    attributes: { K: null, V: null, P: null },
    strengths: Array.from({ length: 5 }, () => ({ text: '', improved: false })),
    weaknesses: ['', ''],
    weaknessMarks: [false, false, false],
    scars: { heart: false, spade: false },
    newScars: 0,
    lamps: [false, false, false],
    experiences: ['', '', ''],
    gear: Array.from({ length: 7 }, () => ({ text: '', struck: false })),
    trumps: [null, null, null, null],
    dead: false,
  };
}

export function initialKlioState(): KlioState {
  return { sheets: [emptySheet(), emptySheet(), emptySheet(), emptySheet()], expedition: null, oracle: null };
}
