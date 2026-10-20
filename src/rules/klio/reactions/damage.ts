// Schaden (ARCHITEKTUR.md 14): Eine niedrigere Karte auf dem Schadensfeld ist ein Treffer (A2).
// Herz/Pik markiert die passende Narbe; schon markiert oder Kreuz/Karo: tot (A3).
// Bei mehreren Karten wird jede mit der darunterliegenden verglichen, Treffer der Reihe nach.

import { SEATS, type CardId, type Event, type Reaction, type SeatId } from '../../../engine/types';
import type { KlioState } from '../state';
import { sheetOf, type KlioEvent, type KlioTable } from '../events';

export const DAMAGE_ZONE = 'damage';

const VALUE: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
export const cardValue = (card: CardId): number => VALUE[card.slice(1)] ?? Number(card.slice(1));

/** Treffer unter den abgelegten Karten; `below` = Karte darunter (oder keine: leeres Feld trifft nie). */
export function hitsOf(below: CardId | undefined, placed: readonly CardId[]): CardId[] {
  let top = below ? cardValue(below) : 0;
  const hits: CardId[] = [];
  for (const card of placed) {
    const v = cardValue(card);
    if (v < top) hits.push(card);
    top = v;
  }
  return hits;
}

export const damageReaction: Reaction<KlioState> = {
  id: 'damage',
  react(state, event: Event) {
    if (event.type !== 'cardsMoved') return [];
    const e = event as Extract<import('../../../engine/types').EngineEvent, { type: 'cardsMoved' }>;
    if (!('zone' in e.to)) return [];
    const [seat, zone] = e.to.zone.split('.') as [SeatId, string];
    if (zone !== DAMAGE_ZONE || !SEATS.includes(seat)) return [];

    // Die bewegten Karten liegen jetzt oben; darunter liegt die bisherige oberste Karte.
    const cards = state.zones[e.to.zone] ?? [];
    const below = cards[cards.length - e.cards.length - 1];
    const hits = hitsOf(below, e.cards);
    if (hits.length === 0) return [];

    const out: KlioEvent[] = [{ type: 'damageTaken', seat, hits }];
    const scars = { ...sheetOf(state as KlioTable, seat).scars };
    for (const card of hits) {
      const scar = card[0] === 'H' ? 'heart' : card[0] === 'S' ? 'spade' : null;
      if (scar && !scars[scar]) {
        scars[scar] = true;
        out.push({ type: 'scarMarked', seat, scar });
      } else {
        out.push({ type: 'characterDied', seat });
      }
    }
    return out;
  },
};
