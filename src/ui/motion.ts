// Kartenbewegungen planen (ARCHITEKTUR.md 11.2, Schritt 5g): rein, ohne DOM, testbar. Ausgeführt in animator.svelte.ts.

/** Was eine Karte gerade zeigt: Lage aus dem Stand, wem sie folgt, und ihr Platz im Stand (`CardPlace.slot`) */
export type Frame = {
  x: number;
  y: number;
  scale: number;
  rotated: boolean;
  slot: string;
  /** folgt dem eigenen Zeiger (gezogen oder abgelegt, noch nicht bestätigt) bzw. dem einer anderen Person */
  follow: 'own' | 'remote' | null;
};

/** Dauern in ms und Kurven aus theme.css */
export type Timing = { glide: number; flip: number; shift: number; shiftEase: string };

/** Bewegung von der gezeigten zur neuen Lage: `jump` = sofort dort (laufende Bewegung endet), null = nichts zu tun
 *  (gleiche Lage; eine laufende Bewegung läuft weiter) */
export type Motion = { kind: 'glide' | 'follow' | 'shift'; duration: number; easing: string } | { kind: 'jump' } | null;

/** Nachführen hinter einem fremden Zeiger: glättet die Bündelung der Zeigermeldungen auf 50 ms (8.3) */
export const FOLLOW_MS = 80;

const samePose = (a: Frame, b: Frame) => a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotated === b.rotated;
const JUMP: Motion = { kind: 'jump' };

/** Wie kommt eine Karte von `prev` nach `next`? (Fälle aus 11.2) */
export function planMove(prev: Frame, next: Frame, t: Timing): Motion {
  // folgt dem eigenen Zeiger: ohne Verzögerung
  if (next.follow === 'own') return JUMP;
  if (samePose(prev, next)) return null;
  const motion = (kind: 'glide' | 'follow' | 'shift', duration: number, easing: string): Motion => (duration > 0 ? { kind, duration, easing } : JUMP);
  if (next.follow === 'remote') return motion('follow', FOLLOW_MS, 'linear');
  // losgelassen (bestätigt, abgelehnt, ohne Befehl, Haltefrist abgelaufen) oder im Stand bewegt: gleiten
  if (prev.follow || prev.slot !== next.slot) return motion('glide', t.glide, 'ease-out');
  // gleicher Platz, andere Lage: Ansichtswechsel oder Spielerzahl, so schnell wie Bögen und Zonen
  return motion('shift', t.shift, t.shiftEase);
}

/** Umklappen; null = sofort */
export function planTurn(prevFaceUp: boolean, faceUp: boolean, t: Timing): { duration: number; easing: string } | null {
  return prevFaceUp !== faceUp && t.flip > 0 ? { duration: t.flip, easing: 'ease-in-out' } : null;
}

/** CSS-Zeit („0.3s“, „350ms“) in ms */
export function cssMs(v: string): number {
  const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(v);
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}
