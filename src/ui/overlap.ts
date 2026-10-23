// Lage von Meldung und Kartenvorschau (Schritt 5v, ARCHITEKTUR.md 10.8): feste Plätze, die nur ausweichen, wenn sie
// sonst etwas verdecken. Reine Funktionen in Bildschirmpunkten.

import type { Rect } from './layout';

const across = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w;
const overlaps = (a: Rect, b: Rect) => across(a, b) && a.y < b.y + b.h && b.y < a.y + a.h;

/** Abstand der Meldung zum unteren Fensterrand (F1): `base`; überdeckt sie sich waagerecht mit der SL-Leiste und reicht
 *  die Leiste so weit herauf, steht sie `gap` über der Leiste. `toast` ist die Meldung an ihrem Grundplatz. */
export function toastBottom(toast: Rect, bar: Rect | null, viewH: number, base: number, gap: number): number {
  if (!bar || !across(toast, bar) || bar.y >= viewH - base) return base;
  return Math.max(base, viewH - bar.y + gap);
}

/** Kartenvorschau (F2): Ecke unten gegenüber der Karte (Mitte der Karte rechts der Mitte von `bounds`: links, sonst
 *  rechts). Liegt dort etwas aus `blocked` (Dock, Menüknopf), rückt sie darüber, mit `gap` Abstand. */
export function previewPlace(bounds: Rect, blocked: Rect[], size: { w: number; h: number }, cardX: number, gap: number): { x: number; y: number } {
  const x = cardX > bounds.x + bounds.w / 2 ? bounds.x : bounds.x + bounds.w - size.w;
  let y = bounds.y + bounds.h - size.h;
  for (let moved = true; moved; ) {
    moved = false;
    for (const b of blocked) {
      if (overlaps({ x, y, ...size }, b)) {
        y = b.y - gap - size.h;
        moved = true;
      }
    }
  }
  return { x, y };
}
