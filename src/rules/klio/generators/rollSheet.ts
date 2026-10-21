// Bogen auswürfeln (ARCHITEKTUR.md 14, Abnahmekriterien Schritt 2).
// Nur der Host würfelt; das Ergebnis geht als Ereignis an alle.

import { pick } from '../../../engine/rng';
import { RANKS, type Rng, type SeatId } from '../../../engine/types';
import type { KlioContent } from '../content/validate';
import type { KlioEventOf } from '../events';
import { sheetFieldInstances } from '../content/schema';
import { getField } from '../fields';
import type { KlioSheet, RolledAttributes } from '../state';
type TableKey = keyof KlioContent['tables'];

/**
 * Attributspunkte gleichverteilt über alle Aufteilungen von `total` auf drei Attribute
 * (wie bisher: zwei verschiedene Trennstellen aus total + 2 Plätzen).
 */
export function rollAttributes(total: number, rng: Rng): RolledAttributes {
  const slots = total + 2;
  const a = rng.int(slots);
  let b = rng.int(slots - 1);
  if (b >= a) b += 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { K: lo, V: hi - lo - 1, P: total + 1 - hi };
}

/** Würde Auswürfeln vorhandene Einträge überschreiben? (Rückfrage „Überschreiben?“, A30)
 *  Betroffen sind die Felder mit Zufallstabelle laut sheet.yaml und die Attribute. */
export function rollOverwrites(content: KlioContent, sheet: KlioSheet): boolean {
  const rolled = Object.entries(content.sheet.fields).filter(([, f]) => f.roll).map(([name]) => name);
  const texts = sheetFieldInstances({ ...content.sheet, fields: Object.fromEntries(rolled.map((n) => [n, content.sheet.fields[n]!])) });
  return texts.some((id) => getField(sheet, id) !== '') || Object.values(sheet.attributes).some((a) => a !== null);
}

export function rollSheet(content: KlioContent, seat: SeatId, rng: Rng): KlioEventOf<'sheetRolled'> {
  const variant = pick(['m', 'w'] as const, rng);
  const draws: KlioEventOf<'sheetRolled'>['draws'] = [];

  /** Eine Zeile aus einer Tabelle: Herz oder Pik, dann Kartenwert; Form passend zur Variante. */
  const drawFrom = (table: TableKey): string => {
    const suit = pick(['H', 'S'] as const, rng);
    const rank = pick(RANKS, rng);
    draws.push({ table, suit, rank });
    const entry = content.tables[table]![suit][rank];
    return typeof entry === 'string' ? entry : entry[variant];
  };
  /** Mehrere Zeilen ohne doppelten Text (bisher: neu ziehen, bis es passt). */
  const drawDistinct = (tables: TableKey[]): string[] => {
    const out: string[] = [];
    for (const t of tables) {
      let text: string;
      do text = drawFrom(t);
      while (out.includes(text));
      out.push(text);
    }
    return out;
  };

  /** Ein Feld laut sheet.yaml füllen: je Eintrag eine Tabellenzeile, ggf. ohne doppelte Texte. */
  const rollField = (name: string): string[] => {
    const f = content.sheet.fields[name];
    const tables = (f?.roll ?? []) as TableKey[];
    return f?.distinct ? drawDistinct(tables) : tables.map(drawFrom);
  };
  const first = pick(content.names.first[variant], rng);
  const last = pick(content.names.last, rng);

  return {
    type: 'sheetRolled',
    seat,
    variant,
    name: `${first} ${last}`,
    strengths: rollField('strengths.text'),
    weaknesses: rollField('weaknesses'),
    attributes: rollAttributes(content.sheet.roll.attributeTotal, rng),
    experiences: rollField('experiences'),
    draws,
  };
}
