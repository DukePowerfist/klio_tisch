// Schaden (ARCHITEKTUR.md 14): Eine niedrigere Karte auf dem Schadensfeld ist ein Treffer (A2).
// Herz/Pik markiert die passende Narbe; schon markiert oder Kreuz/Karo: tot (A3).
// Bei mehreren Karten wird jede mit der darunterliegenden verglichen, Treffer der Reihe nach.

import { rankValue } from '../../../engine/schemas';
import type { ZoneTable } from '../../../engine/zones';
import type { CardId, EngineEventOf, Event, RankId, Reaction } from '../../../engine/types';
import type { KlioState } from '../state';
import { sheetOf, type KlioEvent, type KlioTable } from '../events';

export const DAMAGE_ZONE = 'damage';

export const cardValue = (card: CardId): number => rankValue(card.slice(1) as RankId);

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

/** Reaktion auf Karten, die auf einem Schadensfeld landen; `zones` = erweiterte Zonentabelle. */
export function damageReaction(zones: ZoneTable): Reaction<KlioState> {
  return {
    id: 'damage',
    react(state, event: Event) {
      if (event.type !== 'cardsMoved') return [];
      const e = event as EngineEventOf<'cardsMoved'>;
      if (!('zone' in e.to)) return [];
      const zc = zones.get(e.to.zone);
      const seat = zc?.owner;
      if (zc?.template !== DAMAGE_ZONE || !seat) return [];

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
}
