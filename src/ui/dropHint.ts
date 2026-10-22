// Vorschau der Ablegestelle (ARCHITEKTUR.md 11.6, Schritt 5h): wo die gezogenen Karten beim Loslassen landen würden.
// Das Ziel bestimmt dieselbe Funktion wie das Loslassen; die Lage kommt aus einem Probelauf des Befehls durch die
// Engine (`session.predict`), so laufen Vorschau und Ergebnis nicht auseinander.

import type { CardId, CardTarget, TableState } from '../engine/types';
import { cardSize, freePosAt, placeCards, zoneAt, type Layout, type Places } from './layout';

type Drag = { cards: readonly CardId[]; dx: number; dy: number };

/** Mitte der ersten gezogenen Karte in Tischpunkten; null, wenn die Karte keine Lage hat */
export function dropCenter(layout: Layout, places: Places, drag: Drag): [number, number] | null {
  const p = places[drag.cards[0]!];
  if (!p) return null;
  const s = cardSize(layout, p);
  return [p.x + drag.dx + s.w / 2, p.y + drag.dy + s.h / 2];
}

/** Ziel beim Loslassen: die Zone unter der Mitte der ersten Karte, sonst die unter dem Zeiger, sonst der freie Tisch
 *  an der Lage der Karte. `pointer` in Tischpunkten; null, wenn die Karte keine Lage hat. */
export function dropTarget(layout: Layout, places: Places, drag: Drag, pointer: readonly [number, number]): CardTarget | null {
  const p = places[drag.cards[0]!];
  const c = dropCenter(layout, places, drag);
  if (!p || !c) return null;
  const zone = zoneAt(layout, c[0], c[1]) ?? zoneAt(layout, pointer[0], pointer[1]);
  return zone ? { zone: zone.id } : { free: freePosAt(layout, p.x + drag.dx, p.y + drag.dy) };
}

/** Umriss einer Karte an ihrer künftigen Lage (Tischpunkte), `scale` für die Rundung der Ecken */
export type DropHint = { card: CardId; x: number; y: number; w: number; h: number; scale: number };

/** Umrisse der gezogenen Karten im vorhergesagten Stand. Leer, wenn der Zug abgelehnt würde (`predicted` null) oder
 *  die Karten an ihren Platz zurückfielen (die Karte gleitet dann zurück wie heute). */
export function dropHints(layout: Layout, now: Places, predicted: TableState<unknown> | null, cards: readonly CardId[]): DropHint[] {
  if (!predicted) return [];
  const next = placeCards(predicted, layout);
  if (cards.every((c) => next[c]?.slot === now[c]?.slot)) return [];
  return cards.flatMap((card) => {
    const p = next[card];
    if (!p) return [];
    const s = cardSize(layout, p);
    return [{ card, x: p.x, y: p.y, w: s.w, h: s.h, scale: p.scale }];
  });
}
