// Schatten von der Flamme der Laterne weg (ARCHITEKTUR.md 11.9). Rein, ohne DOM.
// Versatz wie bei einer Punktlichtquelle: Abstand · h / (Flammenhöhe − h), höchstens MAX_OFFSET.

import type { LampBox, Rect } from './layout';

export type Shadow = { x: number; y: number; blur: number; alpha: number };

/** Höhe über dem Tisch in TP; eine angehobene Karte (`lifted`) 40. Liegende Karten und Stapel werfen keinen Schatten. */
export const HEIGHT = { sheet: 1.5, felt: 2, lifted: 40 } as const;

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

/** Laterne aus (F4): weich nach unten, wie in der Musterseite; länger und weicher, je höher etwas liegt */
export function shadowDown(h: number): Shadow {
  return { x: 0, y: 1 + h * 0.4, blur: 1.5 + h * 0.5, alpha: 0.38 };
}

/** Schatten bei brennender Laterne (`flame`) von ihr weg, bei gelöschter (null) nach unten */
export const shadowFrom = (flame: LampBox['flame'] | null, x: number, y: number, h: number): Shadow =>
  (flame ? shadowAt(flame, x, y, h) : shadowDown(h));

/** Schatten eines Rechtecks (Mitte) in Höhe `h` */
export const shadowOver = (flame: LampBox['flame'] | null, r: Rect, h: number): Shadow => shadowFrom(flame, r.x + r.w / 2, r.y + r.h / 2, h);

/** Als Wert für `box-shadow`; `alpha` ersetzt die Deckkraft (etwa für eine zweite, weichere Lage) */
export function shadowCss(s: Shadow, alpha = s.alpha): string {
  const n = (v: number) => +v.toFixed(2);
  return `${n(s.x)}px ${n(s.y)}px ${n(s.blur)}px rgba(0, 0, 0, ${alpha})`;
}

/** Ins Koordinatensystem einer Karte: Der Schatten liegt dort unter `rotate(90deg) scale(s)` (Card.svelte).
 *  Gedreht zeigt ein Versatz (x, y) der Karte auf dem Bildschirm nach (−y, x); zurück also (y, −x). Nur für Karten:
 *  Bögen und Stapelkanten haben ihre Größe ohne `transform` und liegen schon in Tischkoordinaten. */
export function onCard(s: Shadow, rotated: boolean, scale: number): Shadow {
  const [x, y] = rotated ? [s.y, -s.x] : [s.x, s.y];
  return { x: x / scale, y: y / scale, blur: s.blur / scale, alpha: s.alpha };
}

// ---------- Licht der Laterne (Abdunklung und Schein) ----------
// Farben aus der Musterseite (muster/tisch.html, vom Nutzer abgenommen). Die Abdunklung wird multipliziert: Weiß
// lässt alles, wie es ist; der Rand bekommt das Grundlicht der Ansicht (`ambient`), warm getönt.

type RGB = readonly [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as unknown as RGB;
const rgb = (c: RGB) => `rgb(${c.join(', ')})`;

const DARK: RGB = [40, 30, 24];
const PAPER: RGB = [255, 244, 228];
const NEAR: RGB = [255, 241, 214];
const WARM: RGB = [250, 222, 180];

/** Radialer Verlauf der Abdunklung um die Flamme, in Tischkoordinaten; `reach` in TP, `ambient` 0 bis 1 */
export function lightGradient(flame: { x: number; y: number }, light: { reach: number; ambient: number }): string {
  const { reach: r, ambient } = light;
  const edge = mix(DARK, PAPER, ambient);
  const mid = mix(edge, WARM, 0.55);
  return `radial-gradient(circle at ${flame.x}px ${flame.y}px, ${rgb(NEAR)} 0, ${rgb(NEAR)} ${r * 0.12}px, ${rgb(mix(NEAR, mid, 0.5))} ${r * 0.4}px, ${rgb(mid)} ${r * 0.7}px, ${rgb(edge)} ${r}px)`;
}

/** Stärke des Scheins um die Laterne (Musterseite 0,35); steckt in den Farben, weil die Deckkraft der Ebene beim
 *  Anzünden und Löschen animiert wird */
const HALO = 0.35;

/** Warmer Schein um die Laterne (wird mit `screen` aufgelegt) */
export function haloGradient(flame: { x: number; y: number }, strength = HALO): string {
  const a = (v: number) => +(v * strength).toFixed(3);
  return `radial-gradient(circle at ${flame.x}px ${flame.y}px, rgba(255, 190, 110, ${a(0.55)}) 0, rgba(255, 160, 80, ${a(0.22)}) 90px, rgba(255, 140, 60, ${a(0.06)}) 260px, transparent 480px)`;
}

/** Anzünden: Deckkraft der Lichtebenen mit kurzem Aufflackern, dann ruhig an (Stufe „Ruhig“ und „Voll“) */
export const IGNITE: Keyframe[] = [
  { opacity: 0 }, { opacity: 0.5, offset: 0.1 }, { opacity: 0.2, offset: 0.15 }, { opacity: 0.7, offset: 0.25 },
  { opacity: 0.45, offset: 0.3 }, { opacity: 0.85, offset: 0.45 }, { opacity: 0.75, offset: 0.6 }, { opacity: 1 },
];
