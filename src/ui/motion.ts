// Kartenbewegungen planen (ARCHITEKTUR.md 11.2, Schritt 5g): rein, ohne DOM, testbar. Ausgeführt in animator.svelte.ts.

import type { CardId, EngineEvent } from '../engine/types';

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
export type Timing = { glide: number; glideEase: string; land: number; flip: number; hold: number; shift: number; shiftEase: string };

/** Was die Ereignisse eines Stands für eine Karte vorsehen: Verzögerung (Staffelung) und ob sie gezogen wurde */
export type Cue = { delay: number; drawn: boolean };

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
  /** Start nach so vielen ms (Staffelung mehrerer Karten) */
  delay: number;
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
/** Staffelung mehrerer Karten ohne Zug: Abstand, insgesamt höchstens */
export const STAGGER = 50;
export const STAGGER_MAX = 500;

/** Staffelung und Ziehen aus den Ereignissen eines Stands (11.1 „Mehrere Karten“, „Ziehen“), in Reihenfolge der Ereignisse.
 *  Mit einem Zeiger gezogene Karten staffelt die Karte selbst nicht (sie kommen gemeinsam vom Zeiger). */
export function cues(events: readonly { type: string }[]): Map<CardId, Cue> {
  const out = new Map<CardId, Cue>();
  const spread = (cards: readonly CardId[]) => {
    const step = cards.length > 1 ? Math.min(STAGGER, STAGGER_MAX / (cards.length - 1)) : 0;
    cards.forEach((c, i) => out.set(c, { delay: Math.round(i * step), drawn: out.get(c)?.drawn ?? false }));
  };
  for (const event of events) {
    const e = event as EngineEvent;
    if (e.type === 'cardsMoved' || e.type === 'cardsTurned') spread(e.cards);
    else if (e.type === 'cardDrawn') out.set(e.card, { delay: out.get(e.card)?.delay ?? 0, drawn: true });
  }
  return out;
}

const samePose = (a: Frame, b: Frame) => a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotated === b.rotated;
const JUMP: Motion = { kind: 'jump' };

/** Wie kommt eine Karte von `prev` nach `next`? (Fälle aus 11.2) `cause`: Auslöser der Ereignisse dieses Stands */
export function planMove(prev: Frame, next: Frame, t: Timing, cause: Cause = null, cue?: Cue): Motion {
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
      delay: free ? (cue?.delay ?? 0) : 0,
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

/** Wann eine Karte am Ziel ist, gerechnet ab dem Start: Verzögerung, Flug, Aufsetzen */
export const arrival = (g: Glide, t: Timing): number => g.delay + g.duration + (g.land ? t.land : 0);

export type Turn = { delay: number; duration: number; easing: string };

/** Umklappen; null = sofort. `arrive`: ms, bis die Karte nach einer gerade begonnenen Bewegung am Ziel ist.
 *  Aufdecken wartet bis dahin (erst landen, dann umklappen), nach dem Ziehen noch etwas länger (Innehalten);
 *  Zudecken geschieht unterwegs. Mehrere Karten klappen gestaffelt um. */
export function planTurn(prevFaceUp: boolean, faceUp: boolean, t: Timing, arrive = 0, cue?: Cue): Turn | null {
  if (prevFaceUp === faceUp || t.flip <= 0) return null;
  const easing = 'ease-in-out';
  if (faceUp && arrive > 0) return { delay: arrive + (cue?.drawn ? t.hold : 0), duration: t.flip, easing };
  return { delay: arrive > 0 ? 0 : (cue?.delay ?? 0), duration: t.flip, easing };
}

/** CSS-Zeit („0.3s“, „350ms“) in ms */
export function cssMs(v: string): number {
  const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(v);
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}
