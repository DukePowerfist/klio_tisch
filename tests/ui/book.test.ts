// Regelbuch zum Blättern (5zk, ARCHITEKTUR.md 10.16): Blättern, Verzeichnis, gemerkte Seite, Größe der Leselage.

import { describe, expect, it } from 'vitest';
import { bookSize, chapters, keyTurn, storedSpread, swipeTurn, turned, turnPlan } from '../../src/ui/book';
import { content } from '../helpers';

const book = content.book;
const B = content.layouts.book;
const N = book.spreads.length;

describe('Regelbuch (5zk)', () => {
  it('acht Doppelseiten in Buchreihenfolge: Einleitung, dann Seiten 1 bis 14', () => {
    expect(book.spreads.map((s) => s.id)).toEqual(['intro', 'p01', 'p03', 'p05', 'p07', 'p09', 'p11', 'p13']);
    expect(book.spreads.flatMap((s) => [s.left.page, s.right.page])).toEqual([undefined, undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('Blättern bleibt an den Enden stehen', () => {
    expect(turned(0, 'next', N)).toBe(1);
    expect(turned(3, 'prev', N)).toBe(2);
    expect(turned(0, 'prev', N)).toBe(0);
    expect(turned(N - 1, 'next', N)).toBe(N - 1);
    expect(turned(4, 'first', N)).toBe(0);
    expect(turned(4, 'last', N)).toBe(N - 1);
  });

  it('Tasten: Pfeile und Bild auf/ab blättern, Pos1 und Ende springen', () => {
    expect(['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp', 'Home', 'End'].map(keyTurn)).toEqual(['next', 'next', 'prev', 'prev', 'first', 'last']);
    expect(['ArrowUp', 'ArrowDown', ' ', 'Enter', 'a'].map(keyTurn)).toEqual([null, null, null, null, null]);
  });

  it('Wischen: nach links vor, nach rechts zurück, nur waagerecht und ab 40 px', () => {
    expect(swipeTurn(-60, 5)).toBe('next');
    expect(swipeTurn(60, -5)).toBe('prev');
    expect(swipeTurn(-39, 0)).toBeNull();
    expect(swipeTurn(-60, 50)).toBeNull();
    expect(swipeTurn(0, 200)).toBeNull();
  });

  it('Klappen nur zur Nachbarseite; Sprung, gehaltene Taste und Stufe „Aus“ blenden über', () => {
    expect(turnPlan(2, 3, 400, false)).toEqual({ kind: 'turn', dir: 'next' });
    expect(turnPlan(3, 2, 400, false)).toEqual({ kind: 'turn', dir: 'prev' });
    expect(turnPlan(0, 5, 400, false)).toEqual({ kind: 'fade' });
    expect(turnPlan(7, 0, 400, false)).toEqual({ kind: 'fade' });
    expect(turnPlan(2, 3, 400, true)).toEqual({ kind: 'fade' });
    expect(turnPlan(2, 3, 0, false)).toEqual({ kind: 'fade' });
  });

  it('das Blatt klappt von einer Seite genau auf die andere', () => {
    const { left, right } = B.pages;
    // gespiegelt an der Buchmitte liegt die rechte Seite auf der linken
    expect(2 * B.spine - (right[0] + right[2])).toBe(left[0]);
    expect([right[1], right[2], right[3]]).toEqual([left[1], left[2], left[3]]);
    // im Einband
    expect(left[0]).toBeGreaterThan(B.cover[0]);
    expect(right[0] + right[2]).toBeLessThan(B.cover[0] + B.cover[2]);
    expect(left[1]).toBeGreaterThan(B.cover[1]);
    expect(left[1] + left[3]).toBeLessThan(B.cover[1] + B.cover[3]);
  });

  it('Verzeichnis: jede Überschrift mit Seitenzahl und Doppelseite', () => {
    const list = chapters(book);
    expect(list.map((c) => c.title)).toEqual([
      'Einleitung', 'Vorbereitung', 'Charaktererstellung', 'Aktionen', 'Rüstzeug', 'Forschungsnotizen', 'Impulse', 'Vorteil und Nachteil',
      'Expeditionen und Gefahren', 'Schaden, Narben und Tod', 'Rasten', 'Charakterentwicklung', 'SL-Tipps',
      'Mögliche negative Konsequenzen', 'Mögliche positive Konsequenzen',
    ]);
    expect(list.find((c) => c.title === 'Schaden, Narben und Tod')).toEqual({ title: 'Schaden, Narben und Tod', page: 10, spread: 5 });
    expect(list.filter((c) => c.spread === 7).map((c) => c.page)).toEqual([13, 14, 14]);
    expect(list[0]).toEqual({ title: 'Einleitung', page: undefined, spread: 0 });
  });

  it('gemerkte Doppelseite: nach id; unbekannt oder leer ist die erste', () => {
    expect(storedSpread('p09', book)).toBe(5);
    expect(storedSpread('intro', book)).toBe(0);
    expect(storedSpread(null, book)).toBe(0);
    expect(storedSpread('p99', book)).toBe(0);
    expect(storedSpread('5', book)).toBe(0);
  });

  describe('Größe der Leselage', () => {
    const ratio = B.cover[2] / B.cover[3];
    /** Höhe des ganzen Bilds (mit Rand für Bändchen und Figuren) bei dieser Einbandhöhe */
    const imageHeight = (h: number) => (h * B.size[1]) / B.cover[3];

    it('breites Fenster: Verzeichnis daneben, Höhe aus read, das ganze Bild passt ins Fenster', () => {
      const s = bookSize(1600, 900, B);
      expect(s.toc).toBe('side');
      expect(s.h).toBeCloseTo(B.read * 900);
      expect(s.w / s.h).toBeCloseTo(ratio);
      expect(imageHeight(s.h)).toBeLessThanOrEqual(900);
      expect((1600 - s.w) / 2).toBeGreaterThanOrEqual(B.toc.w + B.toc.gap);
    });

    it('hochkant: Verzeichnis darunter, Buch so breit wie das Fenster erlaubt', () => {
      const s = bookSize(768, 1024, B);
      expect(s.toc).toBe('below');
      expect(s.w).toBeCloseTo(768 - 24);
      expect(s.w / s.h).toBeCloseTo(ratio);
    });

    it('kleines Fenster quer (1024 × 600): das Verzeichnis geht dorthin, wo das Buch größer bleibt', () => {
      const s = bookSize(1024, 600, B);
      expect(s.h).toBeGreaterThanOrEqual(B.readBelow * 600 - 0.01);
      expect(s.w).toBeLessThanOrEqual(1024 - 24);
    });

    it('nie breiter als das Fenster, in keiner Größe', () => {
      for (const [vw, vh] of [[320, 568], [600, 400], [1280, 720], [1920, 1080], [2560, 1440], [3840, 1200]] as const) {
        const s = bookSize(vw, vh, B);
        expect(s.w, `${vw} × ${vh}`).toBeLessThanOrEqual(vw - 24 + 0.01);
        expect(s.h, `${vw} × ${vh}`).toBeLessThanOrEqual(B.read * vh + 0.01);
        if (s.toc === 'side') expect((vw - s.w) / 2, `${vw} × ${vh}`).toBeGreaterThanOrEqual(B.toc.w + B.toc.gap);
      }
    });
  });
});
