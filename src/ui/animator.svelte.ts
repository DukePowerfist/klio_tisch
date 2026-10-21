// Kartenbewegungen ausführen (ARCHITEKTUR.md 11.4, Schritt 5g): Web Animations API auf den Ebenen einer Karte.
// Geplant wird in motion.ts; die Endlage steht schon im Element (aus dem Stand), animiert wird nur der Weg dorthin.
// Die zuletzt gezeigte Lage merkt sich jede Karte selbst (Card.svelte); eine laufende Bewegung liefert das DOM.

import type { CardId, TableState } from '../engine/types';
import { arcPoints, cssMs, cues, type Cause, type Cue, type Cut, type Motion, type Timing, type Turn } from './motion';

/** Kennungen der eigenen Animationen (die CSS-Animation beim Rucken bleibt unberührt) */
const MOVE = 'move';
const TURN = 'turn';
/** Abheben und Stoß (aus den Ereignissen, nicht aus der Lage) */
const CUE = 'cue';
/** Stapelung während eines Flugs: über den liegenden Karten, unter gezogenen (400000) und dem Stapelmenü */
const FLYING_Z = 300000;

let cached: Timing | null = null;
/** Dauern und Kurven aus theme.css; neu gelesen, wenn sich die Effektstufe ändert (`resetTiming`) */
export function timing(): Timing {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  cached = {
    glide: cssMs(v('--glide')), glideEase: v('--glide-ease') || 'ease-out', land: cssMs(v('--land')),
    flip: cssMs(v('--flip')), hold: cssMs(v('--hold')), cut: cssMs(v('--cut')), strike: cssMs(v('--strike')),
    fade: cssMs(v('--fade')), flash: cssMs(v('--flash')), shift: cssMs(v('--shift')), shiftEase: v('--shift-ease') || 'ease',
  };
  return cached;
}
/** Effektstufe gewechselt: Werte neu lesen */
export const resetTiming = (): void => {
  cached = null;
};
/** Dauer des Leuchtens nach einem fremden Zug */
const glowMs = () => cssMs(getComputedStyle(document.documentElement).getPropertyValue('--glow'));

// ---------- Ereignisse des aktuellen Stands ----------
// effects.svelte.ts meldet die Ereignisse eines neuen Stands und ob es eigene sind; die Karten lesen das beim
// Neuzeichnen (gleich danach, in derselben Aufgabe). Danach gilt es nicht mehr.
let current: Cause = null;
let currentCues = new Map<CardId, Cue>();
let clear: ReturnType<typeof setTimeout> | undefined;
/** zählt die Stände mit Ereignissen: Karten, deren Lage sich nicht ändert, reagieren darauf (Abheben, Stoß) */
export const events = $state({ seen: 0 });
export function noteEvents(list: readonly { type: string }[], own: boolean, prev: TableState<unknown> | null, next: TableState<unknown>): void {
  current = own ? 'own' : 'foreign';
  currentCues = cues(list, prev, next, timing(), current);
  events.seen++;
  clearTimeout(clear);
  clear = setTimeout(() => {
    current = null;
    currentCues = new Map();
  }, 0);
}
export const cause = (): Cause => current;
export const cue = (card: CardId): Cue | undefined => currentCues.get(card);

// ---------- Aufgedeckt ----------
// Die Meldung nach dem Ziehen nennt die Karte erst, wenn man sie sieht (11.1 „Ziehen“).
const REVEAL_FALLBACK_MS = 2000;
const waiting = new Map<CardId, () => void>();
/** `then` ausführen, sobald die Karte aufgedeckt zu sehen ist (spätestens nach 2 s, etwa wenn sie nicht sichtbar ist) */
export function afterReveal(card: CardId, then: () => void): void {
  waiting.get(card)?.();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    waiting.delete(card);
    then();
  };
  waiting.set(card, run);
  setTimeout(run, REVEAL_FALLBACK_MS);
}
/** von der Karte: jetzt (bzw. nach dieser Animation) aufgedeckt zu sehen */
export function revealed(card: CardId, anim?: Animation): void {
  const run = waiting.get(card);
  if (!run) return;
  if (anim) anim.finished.then(run, run);
  else run();
}

const running = (el: Element, id: string) => el.getAnimations().filter((a) => a.id === id);
const tag = (a: Animation, id: string) => ((a.id = id), a);

/** Lage: von der gezeigten (laufende Bewegung) bzw. zuletzt gezeigten Lage `from` zur Endlage im Element.
 *  `lift` trägt Aufsetzen und Drehung unterwegs, `z` ist die Stapelung am Ziel. */
export function move(el: HTMLElement, lift: HTMLElement, from: string, motion: Motion, z: number): void {
  if (!motion) return;
  const now = [...running(el, MOVE), ...running(lift, MOVE), ...running(el, CUE), ...running(lift, CUE)];
  const start = now.length ? getComputedStyle(el).transform : from;
  for (const a of now) a.cancel();
  if (motion.kind === 'jump') return;
  if (motion.kind === 'fade') {
    fade(el, motion.duration);
    return;
  }
  const opts = { duration: motion.duration, easing: motion.easing };
  if (motion.kind !== 'glide') {
    tag(el.animate([{ transform: start }, { transform: el.style.transform }], opts), MOVE);
    return;
  }
  // gestaffelt: bis zum Start an der alten Lage bleiben (`backwards`)
  const fly: KeyframeAnimationOptions = { ...opts, delay: motion.delay, fill: 'backwards' };
  // über den anderen, solange sie fliegt
  const flyZ = String(FLYING_Z + z);
  tag(el.animate([{ transform: start, zIndex: flyZ }, { transform: el.style.transform, zIndex: flyZ }], fly), MOVE);
  // Bogen nach oben: `translate` liegt vor `transform`, also in Tischpunkten, unabhängig von Größe und Drehung
  if (motion.arc) tag(el.animate(arcPoints(motion.arc).map((p) => ({ offset: p.offset, translate: `0 ${p.y}px` })), fly), MOVE);
  if (motion.sway) {
    const s = motion.sway;
    tag(lift.animate([{ rotate: '0deg' }, { rotate: `${s}deg`, offset: 0.4 }, { rotate: `${-s * 0.3}deg`, offset: 0.8 }, { rotate: '0deg' }], fly), MOVE);
  }
  // Schatten des Flugs: wächst beim Abheben, zieht sich beim Aufsetzen zusammen
  if (motion.land || motion.arc) {
    const rise = motion.lifted ? 1 : 0;
    tag(lift.animate([{ opacity: rise }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { ...opts, delay: motion.delay, pseudoElement: '::before' }), MOVE);
  }
  const t = timing();
  const end = motion.delay + motion.duration;
  if (motion.land) tag(lift.animate([{ scale: 1 }, { scale: 0.98, offset: 0.4 }, { scale: 1 }], { duration: t.land, delay: end, easing: 'ease-out' }), MOVE);
  const glow = glowMs();
  if (motion.glow && glow) tag(lift.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: glow, delay: end, pseudoElement: '::after' }), MOVE);
}

/** Abheben im gemischten Stapel (11.1): Die oberen Karten gleiten eine halbe Kartenbreite zur Seite und schieben sich
 *  unter den Rest, dann wieder heraus und obenauf (zweimal; am Ende liegen sie wie im Stand). `z`: Stapelung im Stand,
 *  `index`: Stelle im Stapel, `width`: Kartenbreite in Tischpunkten. */
export function cut(el: HTMLElement, lift: HTMLElement, c: Cut, z: number, index: number, width: number): void {
  const t = timing();
  // Stufe „Aus“ und einzelne Karte: der Stapel leuchtet nur kurz am Rand auf
  if (!t.cut || c.alone) return flash(lift, 'rgba(255, 255, 255, 0.85)', c.delay);
  const top = String(z);
  // unter die unterste Karte des Stapels, Reihenfolge der abgehobenen bleibt
  const under = String(z - index - c.count + c.rank);
  const side = `${Math.round(width / 2)}px 0`;
  tag(el.animate([
    { offset: 0, translate: '0 0', zIndex: top },
    { offset: 0.25, translate: side, zIndex: top },
    { offset: 0.26, translate: side, zIndex: under },
    { offset: 0.5, translate: '0 0', zIndex: under },
    { offset: 0.75, translate: side, zIndex: under },
    { offset: 0.76, translate: side, zIndex: top },
    { offset: 1, translate: '0 0', zIndex: top },
  ], { duration: t.cut, delay: c.delay, easing: 'ease-in-out' }), CUE);
}

/** Stoß bei Schaden (11.1): einmal nach unten, gedämpft zurück, kurzer roter Schimmer am Rand */
export function strike(el: HTMLElement, lift: HTMLElement, delay: number): void {
  const t = timing();
  const red = getComputedStyle(document.documentElement).getPropertyValue('--strike-c').trim() || 'red';
  // Stufe „Aus“: nur der rote Schimmer
  if (!t.strike) return flash(lift, red, delay);
  const opts = { duration: t.strike, delay, easing: 'ease-out' };
  tag(el.animate([
    { translate: '0 0' }, { translate: '0 8px', offset: 0.15 }, { translate: '0 -2px', offset: 0.45 }, { translate: '0 1px', offset: 0.7 }, { translate: '0 0' },
  ], opts), CUE);
  glowEdge(lift, red, opts);
}

/** Rand leuchtet auf und klingt ab */
function glowEdge(lift: HTMLElement, color: string, opts: KeyframeAnimationOptions): void {
  tag(lift.animate([
    { opacity: 0, boxShadow: `0 0 0 3px ${color}, 0 0 14px 2px ${color}` }, { opacity: 1, offset: 0.2 }, { opacity: 0 },
  ], { ...opts, pseudoElement: '::after' }), CUE);
}

/** Stufe „Aus“: Rückmeldung ohne Bewegung (11.5) */
function flash(lift: HTMLElement, color: string, delay: number): void {
  const t = timing();
  if (t.flash) glowEdge(lift, color, { duration: t.flash, delay, easing: 'ease-out' });
}

/** Stufe „Aus“: an der neuen Lage bzw. mit der neuen Seite einblenden */
export function fade(el: HTMLElement, duration: number): void {
  if (duration > 0) tag(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease-out' }), MOVE);
}

/** Wie weit die Karte gerade (mitten in einer Bewegung) von ihrer Endlage entfernt gezeigt wird, in Tischpunkten.
 *  Greift man sie im Flug, beginnt der Zug dort statt an der Endlage (11.2). */
export function shownOffset(el: HTMLElement): { dx: number; dy: number } {
  if (!running(el, MOVE).length) return { dx: 0, dy: 0 };
  const css = getComputedStyle(el);
  const shown = new DOMMatrix(css.transform);
  const end = new DOMMatrix(el.style.transform);
  const [tx, ty] = css.translate === 'none' ? [0, 0] : css.translate.split(' ').map((v) => parseFloat(v) || 0);
  return { dx: shown.e - end.e + (tx ?? 0), dy: shown.f - end.f + (ty ?? 0) };
}

/** Umklappen: Drehung um die senkrechte Achse, von der gezeigten zur neuen Seite; dabei hebt sich die Karte
 *  (größer, Schatten) und ein schwacher Glanz läuft über die Fläche. Liefert die Drehung (Ende = aufgedeckt). */
export function turn(inner: HTMLElement, lift: HTMLElement, faceUp: boolean, plan: Turn | null): Animation | undefined {
  const now = [...running(inner, TURN), ...running(lift, TURN), ...[...inner.querySelectorAll('.glint')].flatMap((g) => running(g, TURN))];
  const start = running(inner, TURN).length ? getComputedStyle(inner).rotate : faceUp ? 'y 180deg' : 'y 0deg';
  for (const a of now) a.cancel();
  if (!plan) return undefined;
  const opts: KeyframeAnimationOptions = { ...plan };
  // bis zum Start die alte Seite zeigen (`backwards`), etwa während des Flugs; Anheben und Glanz nicht, sonst
  // überdeckten sie bis dahin das Aufsetzen und den Schatten des Flugs
  const spin = tag(inner.animate([{ rotate: start }, { rotate: faceUp ? 'y 0deg' : 'y 180deg' }], { ...opts, fill: 'backwards' }), TURN);
  tag(lift.animate([{ scale: 1 }, { scale: 1.08, offset: 0.5 }, { scale: 1 }], opts), TURN);
  tag(lift.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { ...opts, pseudoElement: '::before' }), TURN);
  for (const g of inner.querySelectorAll('.glint')) {
    tag(g.animate([{ opacity: 0, backgroundPosition: '100% 0' }, { opacity: 1, offset: 0.5 }, { opacity: 0, backgroundPosition: '0% 0' }], opts), TURN);
  }
  return spin;
}

/** Neigung beim Ziehen (11.1 „Greifen“): folgt der Geschwindigkeit des Zeigers, klingt ab, pendelt beim Loslassen zurück. */
const TILT_PER_SPEED = 2; // Grad je Tischpunkt pro ms
const TILT_MAX = 3;
export class Tilt {
  private angle = 0;
  private target = 0;
  private last: { x: number; t: number } | null = null;
  private frame = 0;
  constructor(private lift: () => HTMLElement) {}

  /** neue Lage beim Ziehen (waagerecht, Tischpunkte) */
  track(x: number): void {
    if (timing().glide <= 0) return;
    const now = performance.now();
    if (this.last) {
      const v = (x - this.last.x) / Math.max(8, now - this.last.t);
      this.target = Math.max(-TILT_MAX, Math.min(TILT_MAX, v * TILT_PER_SPEED));
    }
    this.last = { x, t: now };
    if (!this.frame) this.frame = requestAnimationFrame(this.step);
  }

  private step = () => {
    this.target *= 0.85;
    this.angle += (this.target - this.angle) * 0.25;
    const still = Math.abs(this.angle) < 0.05 && Math.abs(this.target) < 0.05;
    if (still) this.angle = 0;
    this.lift().style.rotate = still ? '' : `${this.angle.toFixed(2)}deg`;
    this.frame = still ? 0 : requestAnimationFrame(this.step);
  };

  /** losgelassen: gedämpft zurück */
  release(): void {
    cancelAnimationFrame(this.frame);
    const a = this.angle;
    this.frame = 0;
    this.last = null;
    this.angle = this.target = 0;
    const lift = this.lift();
    lift.style.rotate = '';
    if (Math.abs(a) > 0.1) lift.animate([{ rotate: `${a}deg` }, { rotate: `${-a * 0.3}deg`, offset: 0.55 }, { rotate: '0deg' }], { duration: 200, easing: 'ease-out' });
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }
}

/** Ein- und Ausblenden einer Karte ohne frühere Lage (Bogen ein- oder ausgeblendet), so schnell wie die Bögen */
export function appear(_: Element, { still }: { still: boolean }) {
  const t = timing();
  return { duration: still ? 0 : t.shift, css: (k: number) => `opacity: ${k}` };
}
