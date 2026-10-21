// Kartenbewegungen planen (ARCHITEKTUR.md 11.2, Schritt 5g): rein, ohne DOM, testbar. Ausgeführt in animator.svelte.ts.

import type { CardId, EngineEvent, TableState, ZoneId } from '../engine/types';
import { locate, seatZoneId } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';

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
export type Timing = {
  glide: number; glideEase: string; land: number; flip: number; hold: number; cut: number; strike: number;
  /** Stufe „Aus“: statt Bewegung einblenden bzw. am Rand aufleuchten (11.5) */
  fade: number; flash: number;
  shift: number; shiftEase: string;
  /** Wackeln beim Überfahren (11.6) */
  wiggle: number;
};

/** Abheben nach dem Mischen (11.1): die Karte gehört zu den oberen `count` ihres Stapels, `rank` 0 = unterste davon.
 *  `alone`: einzige Karte im Stapel, sie leuchtet nur am Rand auf */
export type Cut = { delay: number; rank: number; count: number; alone?: true };

/** Was die Ereignisse eines Stands für eine Karte vorsehen: Verzögerung (Staffelung), ob sie gezogen wurde, Abheben
 *  im gemischten Stapel, Stoß bei Schaden (Verzögerung in ms) */
export type Cue = { delay: number; drawn: boolean; cut?: Cut; strike?: number };

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
export type Motion = Glide | { kind: 'follow' | 'shift'; duration: number; easing: string } | { kind: 'fade'; duration: number } | { kind: 'jump' } | null;

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
/** Staffelung mehrerer Karten ohne Zug: Abstand, insgesamt höchstens (beim Zurücksetzen mehr, es sind alle Karten) */
export const STAGGER = 50;
export const STAGGER_MAX = 500;
export const STAGGER_RESET_MAX = 800;
/** Abheben: halb so viele Karten wie im Stapel, mindestens 3, höchstens 6; mindestens eine bleibt liegen */
export const CUT_MIN = 3;
export const CUT_MAX = 6;
/** Stoß bei Schaden: kurz nach dem Ereignis, wenn die Karte, die ihn auslöst, ankommt */
export const STRIKE_DELAY = 150;

export const cutCount = (n: number): number => Math.max(0, Math.min(n - 1, CUT_MAX, Math.max(CUT_MIN, Math.floor(n / 2))));

/** Was die Ereignisse eines Stands für die Karten vorsehen (11.1): Staffelung in Reihenfolge der Ereignisse, Ziehen,
 *  Abheben in gemischten Stapeln, Stoß bei Schaden. Nur aus Ereignissen und Stand, bei allen gleich (11). Mit einem
 *  Zeiger gezogene Karten staffelt die Karte selbst nicht (sie kommen gemeinsam vom Zeiger). */
export function cues(events: readonly { type: string }[], prev: TableState<unknown> | null, next: TableState<unknown>, t: Timing, cause: Cause = null): Map<CardId, Cue> {
  const out = new Map<CardId, Cue>();
  const get = (c: CardId): Cue => out.get(c) ?? { delay: 0, drawn: false };
  const set = (c: CardId, patch: Partial<Cue>) => out.set(c, { ...get(c), ...patch });
  /** gestaffelt; liefert die letzte Verzögerung */
  const spread = (cards: readonly CardId[], max = STAGGER_MAX) => {
    const step = cards.length > 1 ? Math.min(STAGGER, max / (cards.length - 1)) : 0;
    cards.forEach((c, i) => set(c, { delay: Math.round(i * step) }));
    return Math.round((cards.length - 1) * step);
  };
  /** Karten, die in eine andere Zone (bzw. aus der freien Ablage) kommen */
  const arriving = (zones: Record<ZoneId, CardId[]>) =>
    Object.entries(zones).flatMap(([zone, cards]) => cards.filter((c) => {
      const was = prev && locate(prev, c);
      return !(was && 'zone' in was && was.zone === zone);
    }));
  const factor = cause === 'own' ? OWN_FACTOR : cause === 'foreign' ? FOREIGN_FACTOR : 1;
  /** Einsammeln, dann Abheben in jedem Stapel; offene Karten, die bleiben, klappen vorher um */
  const gatherAndCut = (zones: Record<ZoneId, CardId[]>, cutZones: readonly ZoneId[], max: number) => {
    const moving = arriving(zones);
    const last = moving.length ? spread(moving, max) : 0;
    let start = moving.length ? last + Math.round(GLIDE_MAX * factor) + t.land : 0;
    const turning = cutZones.some((z) => (zones[z] ?? []).some((c) => prev?.faceUp[c] && !moving.includes(c)));
    if (turning) start = Math.max(start, t.flip);
    for (const zone of cutZones) {
      const cards = zones[zone] ?? [];
      if (cards.length === 1) set(cards[0]!, { cut: { delay: start, rank: 0, count: 1, alone: true } });
      const count = cutCount(cards.length);
      if (count) cards.slice(-count).forEach((c, rank) => set(c, { cut: { delay: start, rank, count } }));
    }
  };
  for (const event of events) {
    const e = event as EngineEvent | KlioEvent;
    if (e.type === 'cardsMoved' || e.type === 'cardsTurned') spread(e.cards);
    else if (e.type === 'cardDrawn') set(e.card, { drawn: true });
    else if (e.type === 'zonesShuffled') gatherAndCut(e.zones, e.shuffled, STAGGER_MAX);
    else if (e.type === 'cardsReset') gatherAndCut(e.zones, Object.keys(e.zones), STAGGER_RESET_MAX);
    else if (e.type === 'damageTaken') for (const c of next.zones[seatZoneId(e.seat, 'damage')] ?? []) set(c, { strike: STRIKE_DELAY });
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
    // Stufe „Aus“: keine Bewegung, die Karte erscheint am Ziel und blendet ein (nicht nach einem Zug mit dem Zeiger)
    if (t.glide <= 0) return t.fade > 0 && !prev.follow && prev.slot !== next.slot ? { kind: 'fade', duration: t.fade } : JUMP;
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
/** so schnell klappt eine Karte höchstens um (unterwegs, bei kurzem Flug) */
export const FLIP_MIN = 200;

/** Umklappen; null = sofort. `arrive`: ms, bis die Karte nach einer gerade begonnenen Bewegung am Ziel ist.
 *  Aufdecken wartet bis dahin (erst landen, dann umklappen), nach dem Ziehen noch etwas länger (Innehalten);
 *  Zudecken geschieht unterwegs. Mehrere Karten klappen gestaffelt um. */
export function planTurn(prevFaceUp: boolean, faceUp: boolean, t: Timing, arrive = 0, cue?: Cue): Turn | null {
  if (prevFaceUp === faceUp || t.flip <= 0) return null;
  const easing = 'ease-in-out';
  if (faceUp && arrive > 0) return { delay: arrive + (cue?.drawn ? t.hold : 0), duration: t.flip, easing };
  // zudecken unterwegs: mit dem (gestaffelten) Start der Bewegung, verdeckt angekommen
  const delay = cue?.delay ?? 0;
  const duration = !faceUp && arrive > delay ? Math.max(FLIP_MIN, Math.min(t.flip, arrive - delay)) : t.flip;
  return { delay, duration, easing };
}

/** CSS-Zeit („0.3s“, „350ms“) in ms */
export function cssMs(v: string): number {
  const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(v);
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}
