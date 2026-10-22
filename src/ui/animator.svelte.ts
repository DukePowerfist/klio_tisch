// Kartenbewegungen ausführen (ARCHITEKTUR.md 11.4, Schritt 5g): Web Animations API auf den Ebenen einer Karte.
// Geplant wird in motion.ts; die Endlage steht schon im Element (aus dem Stand), animiert wird nur der Weg dorthin.
// Die zuletzt gezeigte Lage merkt sich jede Karte selbst (Card.svelte); eine laufende Bewegung liefert das DOM.

import type { CardId, TableState, ZoneId } from '../engine/types';
import { clamp } from './layout';
import { arcPoints, countChanges, cssMs, cues, hitsTurningUp, STRIKE_IMPACT, strikeImpact, type Cause, type Cue, type Cut, type Motion, type Timing, type Turn } from './motion';

/** Kennungen der eigenen Animationen (die CSS-Animation beim Rucken bleibt unberührt) */
const MOVE = 'move';
const TURN = 'turn';
/** Abheben und Stoß (aus den Ereignissen, nicht aus der Lage) */
const CUE = 'cue';
/** Stapelung während eines Flugs: über den liegenden Karten, unter gezogenen (400000) und dem Stapelmenü */
const FLYING_Z = 300000;

/** dazu, was nur hier gebraucht wird: Leuchten nach fremden Zügen, Stoß, Ankommen (11.7) */
type AllTiming = Timing & { glow: number; strikeColor: string; arrive: number; arriveLift: number; arriveEase: string; ping: number; pointerOut: number };
let cached: AllTiming | null = null;
let cachedCut: AllTiming | null = null;
/** Schnitt beim Ansichtswechsel (11.8, view.svelte.ts): `shift` ist dann 0, wie `--shift` unter `[data-cut]` */
let cutting = false;
export const setCutting = (v: boolean): void => {
  cutting = v;
};
/** Dauern und Kurven aus theme.css; neu gelesen, wenn sich die Effektstufe ändert (`resetTiming`) */
export function timing(): AllTiming {
  if (!cached) cached = readTiming();
  return cutting ? (cachedCut ??= { ...cached, shift: 0 }) : cached;
}
function readTiming(): AllTiming {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    glide: cssMs(v('--glide')), glideEase: v('--glide-ease') || 'ease-out', land: cssMs(v('--land')),
    flip: cssMs(v('--flip')), hold: cssMs(v('--hold')), cut: cssMs(v('--cut')), strike: cssMs(v('--strike')),
    fade: cssMs(v('--fade')), flash: cssMs(v('--flash')), shift: cssMs(v('--shift')), shiftEase: v('--shift-ease') || 'ease',
    viewOut: cssMs(v('--view-out')), viewIn: cssMs(v('--view-in')),
    wiggle: cssMs(v('--wiggle')), count: cssMs(v('--count-pop')),
    lampOn: cssMs(v('--lamp-on')), lampOff: cssMs(v('--lamp-off')),
    glow: cssMs(v('--glow')), strikeColor: v('--strike-c') || 'red',
    arrive: cssMs(v('--arrive')), arriveLift: cssMs(v('--arrive-lift')), arriveEase: v('--spring-soft') || 'ease-out',
    ping: cssMs(v('--ping')), pointerOut: cssMs(v('--pointer-out')),
  };
}
/** Effektstufe gewechselt: Werte neu lesen */
export const resetTiming = (): void => {
  cached = cachedCut = null;
};

// ---------- Ereignisse des aktuellen Stands ----------
// effects.svelte.ts meldet die Ereignisse eines neuen Stands und ob es eigene sind; die Karten lesen das beim
// Neuzeichnen (gleich danach, in derselben Aufgabe). Danach gilt es nicht mehr.
let current: Cause = null;
let currentCues = new Map<CardId, Cue>();
/** Stoß dieses Stands: wartet auf das Aufdecken der getroffenen Karten (5k) */
let currentStrike: Promise<void> = Promise.resolve();
let clear: ReturnType<typeof setTimeout> | undefined;
/** zählt die Stände mit Ereignissen: Karten, deren Lage sich nicht ändert, reagieren darauf (Abheben, Stoß) */
export const events = $state({ seen: 0 });
/** Zonen, deren Zahl beim letzten Stand mit Ereignissen springt (11.6) */
let counted: ZoneId[] = [];
export const countChanged = (zone: ZoneId): boolean => counted.includes(zone);
export function noteEvents(list: readonly { type: string }[], own: boolean, prev: TableState<unknown> | null, next: TableState<unknown>): void {
  current = own ? 'own' : 'foreign';
  currentCues = cues(list, prev, next, timing(), current);
  currentStrike = whenRevealed(hitsTurningUp(list));
  counted = countChanges(list, prev, next);
  events.seen++;
  clearTimeout(clear);
  clear = setTimeout(() => {
    current = null;
    currentCues = new Map();
    counted = [];
  }, 0);
}
export const cause = (): Cause => current;
export const cue = (card: CardId): Cue | undefined => currentCues.get(card);
/** erfüllt mit dem Aufprall des Stoßes im letzten Stand: nach dem Aufdecken Verzögerung plus der Weg nach unten (5k) */
export const strikeImpacted = (): Promise<void> =>
  currentStrike.then(() => new Promise((r) => setTimeout(r, strikeImpact(timing()))));

// ---------- Aufgedeckt ----------
// Die Meldung nach dem Ziehen nennt die Karte erst, wenn man sie sieht (11.1 „Ziehen“).
const REVEAL_FALLBACK_MS = 2000;
const waiting = new Map<CardId, Set<() => void>>();
/** `then` einmal ausführen, sobald die Karte aufgedeckt zu sehen ist (spätestens nach 2 s, etwa wenn sie nicht sichtbar ist) */
function onReveal(card: CardId, then: () => void): () => void {
  const run = () => {
    const runs = waiting.get(card);
    if (!runs?.delete(run)) return;
    if (runs.size === 0) waiting.delete(card);
    clearTimeout(fallback);
    then();
  };
  waiting.set(card, (waiting.get(card) ?? new Set()).add(run));
  const fallback = setTimeout(run, REVEAL_FALLBACK_MS);
  return run;
}
/** je Karte die Meldung, die auf sie wartet: eine neue ersetzt die alte (die dann sofort erscheint) */
const told = new Map<CardId, () => void>();
export function afterReveal(card: CardId, then: () => void): void {
  told.get(card)?.();
  told.set(card, onReveal(card, () => {
    told.delete(card);
    then();
  }));
}
// Schaden (5k): Stoß, Narbe und Tod warten, bis die getroffenen Karten aufgedeckt zu sehen sind
/** erfüllt, sobald alle Karten aufgedeckt zu sehen sind (spätestens nach 2 s); ohne Karten sofort */
function whenRevealed(cards: readonly CardId[]): Promise<void> {
  if (cards.length === 0) return Promise.resolve();
  return Promise.all(cards.map((card) => new Promise<void>((open) => onReveal(card, open)))).then(() => undefined);
}
/** von der Karte: jetzt (bzw. nach dieser Animation) aufgedeckt zu sehen */
export function revealed(card: CardId, anim?: Animation): void {
  if (!waiting.has(card)) return;
  const run = () => { for (const r of [...(waiting.get(card) ?? [])]) r(); };
  if (anim) anim.finished.then(run, run);
  else run();
}

const running = (el: Element, ...ids: string[]) => el.getAnimations().filter((a) => ids.includes(a.id));
const tag = (a: Animation, id: string) => ((a.id = id), a);

/** Lage: von der gezeigten (laufende Bewegung) bzw. zuletzt gezeigten Lage `from` zur Endlage im Element.
 *  `lift` trägt Aufsetzen und Drehung unterwegs, `z` ist die Stapelung am Ziel. */
export function move(el: HTMLElement, lift: HTMLElement, from: string, motion: Motion, z: number): void {
  if (!motion) return;
  const now = [...running(el, MOVE, CUE), ...running(lift, MOVE, CUE)];
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
  if (motion.glow && t.glow) tag(lift.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: t.glow, delay: end, pseudoElement: '::after' }), MOVE);
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

/** Wackeln beim Überfahren (11.6): einmal kurz und gedämpft, zur Lage dazu (`composite: 'add'`), nicht im Flug */
const WIGGLE = 'wiggle';
export function wobble(el: HTMLElement, lift: HTMLElement): void {
  const t = timing();
  if (!t.wiggle || running(el, MOVE).length || running(lift, MOVE, WIGGLE).length) return;
  tag(lift.animate([
    { transform: 'rotate(0deg)' }, { transform: 'rotate(1.2deg)', offset: 0.3 }, { transform: 'rotate(-0.6deg)', offset: 0.65 }, { transform: 'rotate(0deg)' },
  ], { duration: t.wiggle, easing: 'ease-out', composite: 'add' }), WIGGLE);
}

/** Zahl am Stapel springt kurz (11.6): größer und federnd zurück */
export function popCount(n: HTMLElement): void {
  const t = timing();
  if (t.count) n.animate([{ scale: 1 }, { scale: 1.25, offset: 0.35 }, { scale: 0.97, offset: 0.75 }, { scale: 1 }], { duration: t.count, easing: 'ease-out' });
}

/** Stoß bei Schaden (11.1): einmal nach unten, gedämpft zurück, kurzer roter Schimmer am Rand; erst wenn die
 *  getroffenen Karten dieses Stands aufgedeckt sind (5k) */
export function strike(el: HTMLElement, lift: HTMLElement, delay: number): void {
  void currentStrike.then(() => strikeNow(el, lift, delay));
}
function strikeNow(el: HTMLElement, lift: HTMLElement, delay: number): void {
  const t = timing();
  const red = t.strikeColor;
  // Stufe „Aus“: nur der rote Schimmer
  if (!t.strike) return flash(lift, red, delay);
  const opts = { duration: t.strike, delay, easing: 'ease-out' };
  tag(el.animate([
    { translate: '0 0' }, { translate: '0 8px', offset: STRIKE_IMPACT }, { translate: '0 -2px', offset: 0.45 }, { translate: '0 1px', offset: 0.7 }, { translate: '0 0' },
  ], opts), CUE);
  glowEdge(lift, red, opts);
}

/** Rand leuchtet auf und klingt ab */
function glowEdge(lift: HTMLElement, color: string, opts: KeyframeAnimationOptions): void {
  tag(lift.animate([
    { opacity: 0, boxShadow: `0 0 0 3px ${color}, 0 0 14px 2px ${color}` }, { opacity: 1, offset: 0.2 }, { opacity: 0 },
  ], { ...opts, pseudoElement: '::after' }), CUE);
}

// ---------- Ankommen (11.7, Schritt 5l) ----------
/** Schatten des Bogens (Sheet.svelte), Ausgang und Ende des Hebens */
const SHEET_SHADOW = '0 2px 10px rgba(0, 0, 0, 0.5)';

/** Bogen beim Ankommen: hebt sich 3 px, Schatten wächst, Rand leuchtet einmal in der Platzfarbe (wie nach fremden
 *  Zügen); in „Aus“ nur das Leuchten am Rand (`--flash`). Über `translate`, `.paper` trägt `transform`. */
export function arriveSheet(sheet: HTMLElement): void {
  const c = getComputedStyle(sheet).getPropertyValue('--c').trim();
  const lit = `0 0 0 3px ${c}, 0 0 14px 2px ${c}`;
  const t = timing();
  const lift = t.arriveLift;
  if (lift) {
    sheet.animate([
      { translate: '0 0', boxShadow: `${SHEET_SHADOW}, 0 0 0 0 transparent, 0 0 0 0 transparent` },
      { translate: '0 -3px', boxShadow: `0 10px 24px rgba(0, 0, 0, 0.45), ${lit}`, offset: 0.3 },
      { translate: '0 0', boxShadow: `${SHEET_SHADOW}, 0 0 0 0 transparent, 0 0 0 0 transparent` },
    ], { duration: lift, easing: 'ease-out' });
    return;
  }
  if (t.flash) sheet.animate([{ boxShadow: `${SHEET_SHADOW}, ${lit}` }, { boxShadow: `${SHEET_SHADOW}, 0 0 0 0 transparent, 0 0 0 0 transparent` }], { duration: t.flash, easing: 'ease-out' });
}

/** Namensschild beim Ankommen und bei „wieder da“: Hintergrund aus durchsichtig in die Platzfarbe, Name blendet ein;
 *  in „Aus“ sofort (nichts). */
export function arrivePlate(plate: HTMLElement): void {
  const t = timing();
  if (!t.arrive) return;
  const css = getComputedStyle(plate);
  plate.animate({ backgroundColor: ['transparent', css.backgroundColor], color: ['transparent', css.color] }, { duration: t.arrive, easing: t.arriveEase });
}

/** Ring am Zeiger (11.7): dehnt sich einmal aus und verblasst; in „Aus“ nichts */
export function pingRing(ring: HTMLElement): void {
  const d = timing().ping;
  if (d) ring.animate([{ scale: 0.3, opacity: 0.9 }, { scale: 2.4, opacity: 0 }], { duration: d, easing: 'ease-out' });
}

/** Zeiger der anderen verschwindet (Tisch verlassen oder weg): ausblenden, in „Aus“ sofort */
export function pointerOut(_: Element) {
  return { duration: timing().pointerOut, css: (k: number) => `opacity: ${k}` };
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
      this.target = clamp(v * TILT_PER_SPEED, -TILT_MAX, TILT_MAX);
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

/** Ein- und Ausblenden einer Karte ohne frühere Lage (Bogen ein- oder ausgeblendet), so schnell wie die Bögen;
 *  im Schnitt beim Ansichtswechsel (`still`) ohne Dauer, die Blende des Tisches übernimmt (11.8) */
export function appear(_: Element, { still }: { still: boolean }) {
  const t = timing();
  return { duration: still ? 0 : t.shift, css: (k: number) => `opacity: ${k}` };
}
