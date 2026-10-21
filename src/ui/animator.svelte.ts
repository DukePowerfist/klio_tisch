// Kartenbewegungen ausführen (ARCHITEKTUR.md 11.4, Schritt 5g): Web Animations API auf den Ebenen einer Karte.
// Geplant wird in motion.ts; die Endlage steht schon im Element (aus dem Stand), animiert wird nur der Weg dorthin.
// Die zuletzt gezeigte Lage merkt sich jede Karte selbst (Card.svelte); eine laufende Bewegung liefert das DOM.

import { cssMs, type Motion, type Timing } from './motion';

/** Kennung der eigenen Animationen (die CSS-Animation beim Rucken bleibt unberührt) */
const MOVE = 'move';
const TURN = 'turn';

let cached: Timing | null = null;
/** Dauern und Kurven aus theme.css; neu gelesen, wenn sich „Bewegung reduzieren“ ändert */
export function timing(): Timing {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name);
  cached = { glide: cssMs(v('--glide')), flip: cssMs(v('--flip')), shift: cssMs(v('--shift')), shiftEase: v('--shift-ease').trim() || 'ease' };
  return cached;
}
if (typeof matchMedia !== 'undefined') matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => (cached = null));

const running = (el: Element, id: string) => el.getAnimations().filter((a) => a.id === id);

/** Lage: von der gezeigten (laufende Bewegung) bzw. zuletzt gezeigten Lage `from` zur Endlage im Element. */
export function move(el: HTMLElement, from: string, motion: Motion): void {
  if (!motion) return;
  const now = running(el, MOVE);
  const start = now.length ? getComputedStyle(el).transform : from;
  for (const a of now) a.cancel();
  if (motion.kind === 'jump') return;
  const a = el.animate([{ transform: start }, { transform: el.style.transform }], { duration: motion.duration, easing: motion.easing });
  a.id = MOVE;
}

/** Umklappen: Drehung um die senkrechte Achse, von der gezeigten zur neuen Seite. */
export function turn(inner: HTMLElement, faceUp: boolean, plan: { duration: number; easing: string } | null): void {
  const now = running(inner, TURN);
  const start = now.length ? getComputedStyle(inner).rotate : faceUp ? 'y 180deg' : 'y 0deg';
  for (const a of now) a.cancel();
  if (!plan) return;
  const a = inner.animate([{ rotate: start }, { rotate: faceUp ? 'y 0deg' : 'y 180deg' }], plan);
  a.id = TURN;
}

/** Ein- und Ausblenden einer Karte ohne frühere Lage (Bogen ein- oder ausgeblendet), so schnell wie die Bögen */
export function appear(_: Element, { still }: { still: boolean }) {
  const t = timing();
  return { duration: still ? 0 : t.shift, css: (k: number) => `opacity: ${k}` };
}
