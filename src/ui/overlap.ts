// Lage von Meldung und Kartenvorschau (Schritt 5v, ARCHITEKTUR.md 10.8): feste Plätze, die nur ausweichen, wenn sie
// sonst etwas verdecken. Reine Funktionen in Bildschirmpunkten.

import type { Rect } from './layout';

const across = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w;
const overlaps = (a: Rect, b: Rect) => across(a, b) && a.y < b.y + b.h && b.y < a.y + a.h;

/** Abstand der Meldung zum unteren Fensterrand (F1): `base`; überdeckt sie sich waagerecht mit etwas, dem sie
 *  ausweicht (SL-Leiste, seit 5zb Blatt und Schachtel am Rand), und reicht es so weit herauf, steht sie `gap` darüber.
 *  `toast` ist die Meldung an ihrem Grundplatz. Nur der sichtbare Teil zählt: Was über den oberen Rand hinausreicht
 *  (beim Hineinzoomen), schiebt die Meldung höchstens bis an den oberen Rand. */
export function toastBottom(toast: Rect, avoid: readonly Rect[], viewH: number, base: number, gap: number): number {
  let bottom = base;
  for (const r of avoid) {
    if (!across(toast, r) || r.y >= viewH - base || r.y + r.h <= 0) continue;
    bottom = Math.max(bottom, viewH - Math.max(0, r.y) + gap);
  }
  return Math.min(bottom, viewH - toast.h);
}

/** Kartenvorschau (F2, geändert 2026-10-23): unten rechts; liegt dort die überfahrene Karte `card`, oben rechts; liegt
 *  sie unter beiden (nur in kleinen Fenstern), unten links. Dock und Menüknopf darf sie verdecken: Wer dorthin will,
 *  verlässt die Karte, und die Vorschau verschwindet. */
export function previewPlace(bounds: Rect, size: { w: number; h: number }, card: Rect): { x: number; y: number } {
  const right = bounds.x + bounds.w - size.w;
  const bottom = bounds.y + bounds.h - size.h;
  const spots = [{ x: right, y: bottom }, { x: right, y: bounds.y }, { x: bounds.x, y: bottom }];
  return spots.find((p) => !overlaps({ ...p, ...size }, card)) ?? spots[0]!;
}
