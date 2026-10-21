// Farben je Rolle (8.3, 10): SL weiß, Zuschauer grau, Plätze in ihrer Farbe. Die Farbe eines Platzes steht seit
// Schritt 5e im Stand (gewählt oder Voreinstellung) und gilt überall gleich: Dock, Schild, Streifen, Zeiger, Markierung.

import { SEATS, type SeatId } from '../engine/types';
import { seatColor } from '../engine/zones';
import { ruleset, session } from './session.svelte';

/** CSS-Wert einer wählbaren Farbe (theme.css `--who-c-<Kennung>`) */
export const colorVar = (id: string): string => `var(--who-c-${id})`;

export function whoColor(who: string): string {
  const seat = SEATS.find((s) => s === who) as SeatId | undefined;
  if (seat && session.state) return colorVar(seatColor(session.state, seat, ruleset.seatColors));
  return `var(--who-${who})`;
}
