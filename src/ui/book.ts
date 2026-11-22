// Regelbuch zum Blättern (Schritt 5zk, ARCHITEKTUR.md 10.16): reine Rechnung zu Blättern, Verzeichnis, gemerkter Seite
// und Größe der Leselage. Das Buch ist rein lokal: nichts davon steht im Stand oder geht ins Netz.

import type { KlioContent } from '../rules/klio/content/validate';

export type Book = KlioContent['book'];
export type Spread = Book['spreads'][number];
type BookLayout = KlioContent['layouts']['book'];

/** Eingabe zum Blättern */
export type Turn = 'next' | 'prev' | 'first' | 'last';

/** aufgeschlagene Doppelseite nach einer Eingabe; an den Enden bleibt sie stehen (kein Umlauf) */
export function turned(from: number, turn: Turn, count: number): number {
  const to = turn === 'first' ? 0 : turn === 'last' ? count - 1 : from + (turn === 'next' ? 1 : -1);
  return Math.max(0, Math.min(count - 1, to));
}

/** Taste → Eingabe: Pfeile und Bild auf/ab blättern, Pos1 und Ende springen an die Enden */
export function keyTurn(key: string): Turn | null {
  if (key === 'ArrowRight' || key === 'PageDown') return 'next';
  if (key === 'ArrowLeft' || key === 'PageUp') return 'prev';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return null;
}

/** ab so vielen px zählt eine Bewegung als Wischen */
export const SWIPE = 40;
/** Wischen nach links blättert vor, nach rechts zurück; nur wenn es überwiegend waagerecht war */
export function swipeTurn(dx: number, dy: number): Turn | null {
  if (Math.abs(dx) < SWIPE || Math.abs(dx) < 1.5 * Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** Wechsel der Doppelseite: ein Blatt klappt um die Buchmitte, oder die neue blendet über die alte */
export type TurnPlan = { kind: 'fade' } | { kind: 'turn'; dir: 'next' | 'prev' };
/**
 * Geklappt wird nur zur Nachbarseite. Sprünge (Verzeichnis, Pos1, Ende) blenden über, ebenso die gehaltene Taste
 * (`repeat`) und die Effektstufe „Aus“ (`ms` 0, 11.5).
 */
export function turnPlan(from: number, to: number, ms: number, repeat: boolean): TurnPlan {
  if (ms <= 0 || repeat || Math.abs(to - from) !== 1) return { kind: 'fade' };
  return { kind: 'turn', dir: to > from ? 'next' : 'prev' };
}

export type Chapter = { title: string; page: number | undefined; spread: number };
/** Inhaltsverzeichnis: jede Überschrift in Buchreihenfolge mit ihrer Doppelseite */
export function chapters(book: Book): Chapter[] {
  return book.spreads.flatMap((s, spread) => [s.left, s.right].flatMap((p) => p.titles.map((title) => ({ title, page: p.page, spread }))));
}

/** gemerkte Doppelseite (gespeichert ist die id, damit eine neue Reihenfolge nichts verschiebt); unbekannt: die erste */
export function storedSpread(raw: string | null, book: Book): number {
  const i = book.spreads.findIndex((s) => s.id === raw);
  return i < 0 ? 0 : i;
}

export type BookSize = {
  /** Einband am Bildschirm in px; das Bild ragt mit seinem Rand darüber hinaus */
  w: number; h: number;
  /** Verzeichnis neben dem Buch, sonst darunter */
  toc: 'side' | 'below';
};
/** Rand zum Fenster in px, links und rechts */
const EDGE = 12;
/**
 * Größe der Leselage im Fenster `vw` × `vh`: so hoch wie `read` erlaubt (das ganze Bild mit Bändchen und Figuren bleibt
 * im Fenster), höchstens so breit wie das Fenster. Passt das Verzeichnis links daneben, steht es dort; sonst darunter,
 * und das Buch wird für den Platz etwas kleiner (`readBelow`).
 */
export function bookSize(vw: number, vh: number, B: BookLayout): BookSize {
  const ratio = B.cover[2] / B.cover[3];
  const fit = (read: number, room: number) => {
    const h = Math.max(0, Math.min(read * vh, room / ratio));
    return { w: h * ratio, h };
  };
  const side = fit(B.read, vw - 2 * (B.toc.w + B.toc.gap + EDGE));
  // daneben nur, wenn das Buch dadurch nicht kleiner wird als mit dem Verzeichnis darunter
  const below = fit(B.readBelow, vw - 2 * EDGE);
  return side.h >= below.h ? { ...side, toc: 'side' } : { ...below, toc: 'below' };
}
