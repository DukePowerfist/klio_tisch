// Vorschau der Ablegestelle (ARCHITEKTUR.md 11.6, Schritt 5h): wo die gezogenen Karten beim Loslassen landen würden.
// Das Ziel bestimmt dieselbe Funktion wie das Loslassen; die Lage kommt aus einem Probelauf des Befehls durch die
// Engine (`session.predict`), so laufen Vorschau und Ergebnis nicht auseinander.

import type { CardId, CardTarget, TableState } from '../engine/types';
import { cardSize, freePosAt, placeCards, zoneAt, type CardPlace, type Layout, type Places } from './layout';

/** `card`: die angefasste Karte (11.11), ohne Angabe die erste */
type Drag = { card?: CardId; cards: readonly CardId[]; dx: number; dy: number };

/** Gezeigte Lage einer gezogenen Karte (11.10): in Handgröße (`freeCardScale`), um den Anker (den Zeiger) auf diese
 *  Größe gebracht, die Stelle unter dem Zeiger bleibt also unter ihm; gedreht wie an der Herkunft. `delta`: Versatz
 *  von der Lage an der Herkunft, wie die Karte in ihrer alten Größe gezeigt würde. Für den eigenen Zug, die noch nicht
 *  bestätigten und die Züge der anderen. */
export function inHand(layout: Layout, place: CardPlace, delta: { dx: number; dy: number }, anchor: readonly [number, number]): { x: number; y: number; scale: number; rotated: boolean } {
  const k = layout.freeCardScale / place.scale;
  const [ax, ay] = anchor;
  return { x: ax + (place.x + delta.dx - ax) * k, y: ay + (place.y + delta.dy - ay) * k, scale: layout.freeCardScale, rotated: place.rotated };
}

/** Ziel beim Loslassen (F1): die Zone unter dem Zeiger, sonst der freie Tisch an der linken oberen Ecke der Karte, wie
 *  sie in der Hand gezeigt wird; ob auf einem Bogen oder in der Tischmitte, entscheidet auch dort der Zeiger (F5).
 *  Die Ecke ist die der angefassten Karte (11.11). `pointer` in Tischpunkten; null, wenn die Karte keine Lage hat. */
export function dropTarget(layout: Layout, places: Places, drag: Drag, pointer: readonly [number, number]): CardTarget | null {
  const p = places[drag.card ?? drag.cards[0]!];
  if (!p) return null;
  const zone = zoneAt(layout, pointer[0], pointer[1]);
  if (zone) return { zone: zone.id };
  const at = inHand(layout, p, drag, pointer);
  return { free: freePosAt(layout, at.x, at.y, pointer) };
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
