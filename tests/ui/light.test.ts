// Schatten von der Flamme weg (ARCHITEKTUR.md 11.9).

import { describe, expect, it } from 'vitest';
import { HEIGHT, MAX_OFFSET, onCard, shadowAt, shadowCss, stackHeight } from '../../src/ui/light';

const flame = { x: 880, y: 70, h: 260 };

describe('Schatten der Laterne', () => {
  it('zeigt von der Flamme weg: links nach links, rechts nach rechts, unten nach unten', () => {
    const left = shadowAt(flame, 400, 70, HEIGHT.card);
    expect(left.x).toBeLessThan(0);
    expect(left.y).toBeCloseTo(0);
    expect(shadowAt(flame, 1300, 70, HEIGHT.card).x).toBeGreaterThan(0);
    expect(shadowAt(flame, 880, 600, HEIGHT.card).y).toBeGreaterThan(0);
  });

  it('Länge wie bei einer Punktlichtquelle: Abstand · h / (Flammenhöhe − h)', () => {
    const s = shadowAt(flame, 880 + 500, 70, HEIGHT.card);
    expect(s.x).toBeCloseTo(500 * 2.5 / 257.5);
  });

  it('höher heißt länger und weicher; nie länger als MAX_OFFSET', () => {
    const low = shadowAt(flame, 880 + 300, 70 + 400, HEIGHT.card);
    const high = shadowAt(flame, 880 + 300, 70 + 400, HEIGHT.lifted);
    expect(Math.hypot(high.x, high.y)).toBeGreaterThan(Math.hypot(low.x, low.y));
    expect(high.blur).toBeGreaterThan(low.blur);
    const far = shadowAt(flame, 0, 990, HEIGHT.lifted);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(MAX_OFFSET);
  });

  it('Stapel: 2 + Zahl der Kanten', () => {
    expect(stackHeight(0)).toBe(2);
    expect(stackHeight(3)).toBe(5);
  });

  it('auf der Karte: ungedreht nur durch den Maßstab geteilt', () => {
    const s = { x: 6, y: -3, blur: 3, alpha: 0.63 };
    expect(onCard(s, false, 1)).toEqual(s);
    expect(onCard(s, false, 0.6)).toEqual({ x: 10, y: -5, blur: 5, alpha: 0.63 });
  });

  it('auf einer gedrehten Karte: zurückgedreht, damit der Schatten auf dem Bildschirm in dieselbe Richtung zeigt', () => {
    const s = { x: -6, y: 0, blur: 3, alpha: 0.63 };
    const local = onCard(s, true, 0.6);
    // rotate(90deg): lokales (x, y) erscheint auf dem Bildschirm als (−y, x), dazu der Maßstab
    const screen = { x: -local.y * 0.6, y: local.x * 0.6 };
    expect(screen.x).toBeCloseTo(-6);
    expect(screen.y).toBeCloseTo(0);
    expect(local.blur).toBeCloseTo(5);
  });
});

describe('Schatten als CSS', () => {
  it('Versatz, Weichheit und Deckkraft, auf zwei Stellen gerundet; Deckkraft ersetzbar', () => {
    const s = { x: -3.14159, y: 2, blur: 4.006, alpha: 0.63 };
    expect(shadowCss(s)).toBe('-3.14px 2px 4.01px rgba(0, 0, 0, 0.63)');
    expect(shadowCss(s, 0.3)).toBe('-3.14px 2px 4.01px rgba(0, 0, 0, 0.3)');
  });
});
