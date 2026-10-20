// Bogen auswürfeln (ARCHITEKTUR.md 14, Abnahmekriterien Schritt 2).
// Nur der Host würfelt; das Ergebnis geht als Ereignis an alle.

import { pick } from '../../../engine/rng';
import type { Rng, SeatId } from '../../../engine/types';
import type { KlioContent } from '../content/validate';
import type { KlioEventOf } from '../events';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
type TableKey = keyof KlioContent['tables'];

/**
 * Attributspunkte gleichverteilt über alle Aufteilungen von `total` auf drei Attribute
 * (wie bisher: zwei verschiedene Trennstellen aus total + 2 Plätzen).
 */
export function rollAttributes(total: number, rng: Rng): { K: number; V: number; P: number } {
  const slots = total + 2;
  const a = rng.int(slots);
  let b = rng.int(slots - 1);
  if (b >= a) b += 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { K: lo, V: hi - lo - 1, P: total + 1 - hi };
}

export function rollSheet(content: KlioContent, seat: SeatId, rng: Rng): KlioEventOf<'sheetRolled'> {
  const variant = rng.int(2) === 0 ? 'm' : 'w';
  const draws: KlioEventOf<'sheetRolled'>['draws'] = [];

  /** Eine Zeile aus einer Tabelle: Herz oder Pik, dann Kartenwert; Form passend zur Variante. */
  const drawFrom = (table: TableKey): string => {
    const suit = rng.int(2) === 0 ? 'H' : 'S';
    const rank = RANKS[rng.int(13)]!;
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

  const f = content.sheet.fields;
  const tablesOf = (name: string) => (f[name]?.roll ?? []) as TableKey[];
  const first = pick(content.names.first[variant], rng);
  const last = pick(content.names.last, rng);

  return {
    type: 'sheetRolled',
    seat,
    variant,
    name: `${first} ${last}`,
    strengths: tablesOf('strengths.text').map(drawFrom),
    weaknesses: f['weaknesses']?.distinct ? drawDistinct(tablesOf('weaknesses')) : tablesOf('weaknesses').map(drawFrom),
    attributes: rollAttributes(content.sheet.roll.attributeTotal, rng),
    experiences: f['experiences']?.distinct ? drawDistinct(tablesOf('experiences')) : tablesOf('experiences').map(drawFrom),
    draws,
  };
}
