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

/** Dauern in ms und Kurven aus theme.css; `glide` ist die Grunddauer, dazu kommt die Strecke */
export type Timing = { glide: number; glideEase: string; land: number; flip: number; shift: number; shiftEase: string };

/** Wer hat die Bewegung ausgelöst? Eigene Züge laufen kürzer, fremde länger (Zuschauer sollen folgen können) */
export type Cause = 'own' | 'foreign' | null;

/** Gleiten (11.3): Bogen nach oben, leichte Drehung unterwegs, Aufsetzen am Ziel, über den anderen Karten */
export type Glide = {
  kind: 'glide';
  duration: number;
  easing: string;
  /** Höhe des Bogens in Tischpunkten */
  arc: number;
  /** größte Drehung unterwegs in Grad, Vorzeichen nach Richtung */
  sway: number;
  /** am Ziel aufsetzen (Dauer `Timing.land`) */
  land: boolean;
  /** am Ziel in der Farbe der Person aufleuchten, die die Karte gezogen hat */
  glow: boolean;
  /** kommt angehoben vom Zeiger (Schatten schon da) */
  lifted: boolean;
};

/** Bewegung von der gezeigten zur neuen Lage: `jump` = sofort dort (laufende Bewegung endet), null = nichts zu tun
 *  (gleiche Lage; eine laufende Bewegung läuft weiter) */
export type Motion = Glide | { kind: 'follow' | 'shift'; duration: number; easing: string } | { kind: 'jump' } | null;

/** Nachführen hinter einem fremden Zeiger: glättet die Bündelung der Zeigermeldungen auf 50 ms (8.3) */
export const FOLLOW_MS = 80;
/** Dauer nach Strecke (11.3): Grunddauer + je Tischpunkt, gedeckelt; dann je nach Auslöser */
export const GLIDE_PER_PX = 0.4;
export const GLIDE_MAX = 600;
export const OWN_FACTOR = 0.8;
export const FOREIGN_FACTOR = 1.2;
/** Bogen: Anteil der Strecke, höchstens so hoch */
export const ARC_SHARE = 0.08;
export const ARC_MAX = 40;
/** Drehung unterwegs: 1 Grad je 150 Tischpunkte waagerecht, höchstens 3 */
export const SWAY_PER_PX = 1 / 150;
export const SWAY_MAX = 3;
/** Ab dieser Strecke gilt es als Flug (Aufsetzen, Bogen); darunter rückt eine Karte nur nach (Stapel) */
export const FLIGHT_MIN = 20;

const samePose = (a: Frame, b: Frame) => a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotated === b.rotated;
const JUMP: Motion = { kind: 'jump' };

/** Wie kommt eine Karte von `prev` nach `next`? (Fälle aus 11.2) `cause`: Auslöser der Ereignisse dieses Stands */
export function planMove(prev: Frame, next: Frame, t: Timing, cause: Cause = null): Motion {
  // folgt dem eigenen Zeiger: ohne Verzögerung
  if (next.follow === 'own') return JUMP;
  if (samePose(prev, next)) return null;
  if (next.follow === 'remote') return { kind: 'follow', duration: FOLLOW_MS, easing: 'linear' };
  // losgelassen (bestätigt, abgelehnt, ohne Befehl, Haltefrist abgelaufen) oder im Stand bewegt: gleiten
  if (prev.follow || prev.slot !== next.slot) {
    if (t.glide <= 0) return JUMP;
    const by = prev.follow === 'own' ? 'own' : prev.follow === 'remote' ? 'foreign' : cause;
    const dx = next.x - prev.x;
    const dist = Math.hypot(dx, next.y - prev.y);
    const factor = by === 'own' ? OWN_FACTOR : by === 'foreign' ? FOREIGN_FACTOR : 1;
    const flight = dist >= FLIGHT_MIN;
    // zurück an den Ausgangsort (gleicher Platz) setzt nicht auf: die Karte hat ihn nie verlassen
    const moved = prev.slot !== next.slot;
    // vom Zeiger losgelassen: kein Bogen und keine Drehung, die Karte schwebt schon (sie pendelt beim Loslassen)
    const free = !prev.follow;
    return {
      kind: 'glide',
      duration: Math.round(Math.min(GLIDE_MAX, t.glide + dist * GLIDE_PER_PX) * factor),
      easing: t.glideEase,
      arc: free && flight ? Math.min(ARC_MAX, dist * ARC_SHARE) : 0,
      sway: free && flight ? Math.sign(dx) * Math.min(SWAY_MAX, Math.abs(dx) * SWAY_PER_PX) : 0,
      land: moved && flight && t.land > 0,
      glow: prev.follow === 'remote' && moved,
      lifted: !free,
    };
  }
  // gleicher Platz, andere Lage: Ansichtswechsel oder Spielerzahl, so schnell wie Bögen und Zonen
  return t.shift > 0 ? { kind: 'shift', duration: t.shift, easing: t.shiftEase } : JUMP;
}

/** Bogen als Punkte (Anteil 0–1, Höhe): Parabel, Scheitel in der Mitte des Wegs */
export function arcPoints(arc: number, steps = 8): { offset: number; y: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = i / steps;
    return { offset: p, y: -4 * arc * p * (1 - p) };
  });
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
