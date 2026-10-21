// Kartenbewegungen ausführen (ARCHITEKTUR.md 11.4, Schritt 5g): Web Animations API auf den Ebenen einer Karte.
// Geplant wird in motion.ts; die Endlage steht schon im Element (aus dem Stand), animiert wird nur der Weg dorthin.
// Die zuletzt gezeigte Lage merkt sich jede Karte selbst (Card.svelte); eine laufende Bewegung liefert das DOM.

import { arcPoints, cssMs, type Cause, type Motion, type Timing } from './motion';

/** Kennungen der eigenen Animationen (die CSS-Animation beim Rucken bleibt unberührt) */
const MOVE = 'move';
const TURN = 'turn';
/** Stapelung während eines Flugs: über den liegenden Karten, unter gezogenen (400000) und dem Stapelmenü */
const FLYING_Z = 300000;

let cached: Timing | null = null;
/** Dauern und Kurven aus theme.css; neu gelesen, wenn sich „Bewegung reduzieren“ ändert */
export function timing(): Timing {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  cached = {
    glide: cssMs(v('--glide')), glideEase: v('--glide-ease') || 'ease-out', land: cssMs(v('--land')),
    flip: cssMs(v('--flip')), shift: cssMs(v('--shift')), shiftEase: v('--shift-ease') || 'ease',
  };
  return cached;
}
if (typeof matchMedia !== 'undefined') matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => (cached = null));
/** Dauer des Leuchtens nach einem fremden Zug */
const glowMs = () => cssMs(getComputedStyle(document.documentElement).getPropertyValue('--glow'));

// ---------- Auslöser des aktuellen Stands ----------
// effects.svelte.ts meldet, ob die Ereignisse eines neuen Stands eigene sind; die Karten lesen es beim Neuzeichnen
// (gleich danach, in derselben Aufgabe). Danach gilt es nicht mehr.
let current: Cause = null;
let clear: ReturnType<typeof setTimeout> | undefined;
export function noteCause(own: boolean): void {
  current = own ? 'own' : 'foreign';
  clearTimeout(clear);
  clear = setTimeout(() => (current = null), 0);
}
export const cause = (): Cause => current;

const running = (el: Element, id: string) => el.getAnimations().filter((a) => a.id === id);
const tag = (a: Animation, id: string) => ((a.id = id), a);

/** Lage: von der gezeigten (laufende Bewegung) bzw. zuletzt gezeigten Lage `from` zur Endlage im Element.
 *  `lift` trägt Aufsetzen und Drehung unterwegs, `z` ist die Stapelung am Ziel. */
export function move(el: HTMLElement, lift: HTMLElement, from: string, motion: Motion, z: number): void {
  if (!motion) return;
  const now = [...running(el, MOVE), ...running(lift, MOVE)];
  const start = now.length ? getComputedStyle(el).transform : from;
  for (const a of now) a.cancel();
  if (motion.kind === 'jump') return;
  const opts = { duration: motion.duration, easing: motion.easing };
  if (motion.kind !== 'glide') {
    tag(el.animate([{ transform: start }, { transform: el.style.transform }], opts), MOVE);
    return;
  }
  // über den anderen, solange sie fliegt
  const flyZ = String(FLYING_Z + z);
  tag(el.animate([{ transform: start, zIndex: flyZ }, { transform: el.style.transform, zIndex: flyZ }], opts), MOVE);
  // Bogen nach oben: `translate` liegt vor `transform`, also in Tischpunkten, unabhängig von Größe und Drehung
  if (motion.arc) tag(el.animate(arcPoints(motion.arc).map((p) => ({ offset: p.offset, translate: `0 ${p.y}px` })), opts), MOVE);
  if (motion.sway) {
    const s = motion.sway;
    tag(lift.animate([{ rotate: '0deg' }, { rotate: `${s}deg`, offset: 0.4 }, { rotate: `${-s * 0.3}deg`, offset: 0.8 }, { rotate: '0deg' }], opts), MOVE);
  }
  // Schatten des Flugs: wächst beim Abheben, zieht sich beim Aufsetzen zusammen
  if (motion.land || motion.arc) {
    const rise = motion.lifted ? 1 : 0;
    tag(lift.animate([{ opacity: rise }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { ...opts, pseudoElement: '::before' }), MOVE);
  }
  const t = timing();
  if (motion.land) tag(lift.animate([{ scale: 1 }, { scale: 0.98, offset: 0.4 }, { scale: 1 }], { duration: t.land, delay: motion.duration, easing: 'ease-out' }), MOVE);
  const glow = glowMs();
  if (motion.glow && glow) tag(lift.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: glow, delay: motion.duration, pseudoElement: '::after' }), MOVE);
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

/** Umklappen: Drehung um die senkrechte Achse, von der gezeigten zur neuen Seite. */
export function turn(inner: HTMLElement, faceUp: boolean, plan: { duration: number; easing: string } | null): void {
  const now = running(inner, TURN);
  const start = now.length ? getComputedStyle(inner).rotate : faceUp ? 'y 180deg' : 'y 0deg';
  for (const a of now) a.cancel();
  if (!plan) return;
  tag(inner.animate([{ rotate: start }, { rotate: faceUp ? 'y 0deg' : 'y 180deg' }], plan), TURN);
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
