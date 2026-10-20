// Felder des Bogens per Name ansprechen, z. B. `strengths.text.2` oder `scars.heart`.
// Die Namen kommen aus sheet.yaml; ein Test stellt sicher, dass jedes Feld dort hier erreichbar ist.

import { ATTRS, ScarSchema, type KlioSheet } from './state';

/** `counter`: nur durch Regeln geändert (z. B. neue Narben), nicht von Hand */
export type FieldKind = 'text' | 'number' | 'check' | 'counter';
export type FieldValue = string | number | boolean | null;

/** `strengths.text.2` → ['strengths', 2, 'text'] usw.; null bei unbekannten Namen. */
function pathOf(field: string): { path: (string | number)[]; kind: FieldKind } | null {
  const p = field.split('.');
  const idx = (s: string | undefined, max: number) => (s !== undefined && /^\d$/.test(s) && Number(s) < max ? Number(s) : null);
  const [a, b, c] = p;
  switch (a) {
    case 'name':
      return p.length === 1 ? { path: ['name'], kind: 'text' } : null;
    case 'newScars':
      return p.length === 1 ? { path: ['newScars'], kind: 'counter' } : null;
    case 'attributes':
      return p.length === 2 && (ATTRS as readonly string[]).includes(b!) ? { path: ['attributes', b!], kind: 'number' } : null;
    case 'scars':
      return p.length === 2 && ScarSchema.safeParse(b).success ? { path: ['scars', b!], kind: 'check' } : null;
    case 'strengths':
    case 'gear': {
      const max = a === 'strengths' ? 5 : 7;
      const i = idx(c, max);
      if (p.length !== 3 || i === null) return null;
      if (b === 'text') return { path: [a, i, 'text'], kind: 'text' };
      if (a === 'strengths' && b === 'improved') return { path: [a, i, 'improved'], kind: 'check' };
      if (a === 'gear' && b === 'struck') return { path: [a, i, 'struck'], kind: 'check' };
      return null;
    }
    case 'weaknesses':
    case 'experiences':
    case 'weaknessMarks':
    case 'lamps': {
      const max = a === 'weaknesses' ? 2 : 3;
      const i = idx(b, max);
      if (p.length !== 2 || i === null) return null;
      return { path: [a, i], kind: a === 'weaknesses' || a === 'experiences' ? 'text' : 'check' };
    }
  }
  return null;
}

export function fieldKind(field: string): FieldKind | null {
  return pathOf(field)?.kind ?? null;
}

export function getField(sheet: KlioSheet, field: string): FieldValue {
  const p = pathOf(field);
  if (!p) throw new Error(`unbekanntes Feld ${field}`);
  let v: unknown = sheet;
  for (const k of p.path) v = (v as Record<string | number, unknown>)[k];
  return v as FieldValue;
}

export function setField(sheet: KlioSheet, field: string, value: FieldValue): void {
  const p = pathOf(field);
  if (!p) throw new Error(`unbekanntes Feld ${field}`);
  let target: Record<string | number, unknown> = sheet as unknown as Record<string, unknown>;
  for (const k of p.path.slice(0, -1)) target = target[k] as Record<string | number, unknown>;
  target[p.path[p.path.length - 1]!] = value;
}
