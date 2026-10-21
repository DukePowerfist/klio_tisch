// Schatten von der Flamme der Laterne weg (ARCHITEKTUR.md 11.9). Rein, ohne DOM.
// Versatz wie bei einer Punktlichtquelle: Abstand · h / (Flammenhöhe − h), höchstens MAX_OFFSET.

import type { LampBox } from './layout';

export type Shadow = { x: number; y: number; blur: number; alpha: number };

/** Höhe über dem Tisch in TP; ein Stapel ist 2 + Zahl seiner Kanten hoch, eine angehobene Karte (`lifted`) 40 */
export const HEIGHT = { sheet: 1.5, felt: 2, card: 2.5, lifted: 40 } as const;
export const stackHeight = (edges: number): number => 2 + edges;

export const MAX_OFFSET = 70;

/** Schatten in Tischkoordinaten für etwas mit Mittelpunkt (`x`, `y`) in Höhe `h`. */
export function shadowAt(flame: LampBox['flame'], x: number, y: number, h: number): Shadow {
  const dx = x - flame.x;
  const dy = y - flame.y;
  const d = Math.hypot(dx, dy);
  let k = h / (flame.h - h);
  const len = d * k;
  if (len > MAX_OFFSET) k *= MAX_OFFSET / len;
  return { x: dx * k, y: dy * k, blur: 1.5 + h * 0.5 + d * 0.004, alpha: 0.63 };
}

/** Ins Koordinatensystem einer Karte: Der Schatten liegt dort unter `rotate(90deg) scale(s)` (Card.svelte).
 *  Gedreht zeigt ein Versatz (x, y) der Karte auf dem Bildschirm nach (−y, x); zurück also (y, −x). Nur für Karten:
 *  Bögen und Stapelkanten haben ihre Größe ohne `transform` und liegen schon in Tischkoordinaten. */
export function onCard(s: Shadow, rotated: boolean, scale: number): Shadow {
  const [x, y] = rotated ? [s.y, -s.x] : [s.x, s.y];
  return { x: x / scale, y: y / scale, blur: s.blur / scale, alpha: s.alpha };
}
