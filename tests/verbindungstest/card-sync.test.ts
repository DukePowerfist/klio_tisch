import { describe, expect, it } from 'vitest';
import { isCardPos, moveTo, newer, type CardPos } from '../../src/verbindungstest/card-sync';

const start: CardPos = { x: 0.5, y: 0.5, clock: 0, by: '' };

describe('Testkarte', () => {
  it('jede Bewegung zählt hoch und gewinnt gegen ältere', () => {
    const a = moveTo(start, 0.2, 0.3, 'anna');
    const b = moveTo(a, 0.4, 0.4, 'ben');
    expect(b.clock).toBe(2);
    expect(newer(a, b)).toBe(b);
    expect(newer(b, a)).toBe(b);
  });

  it('bei gleichem Zähler entscheidet die Kennung, auf allen Seiten gleich', () => {
    const a = moveTo(start, 0.1, 0.1, 'anna');
    const b = moveTo(start, 0.9, 0.9, 'ben');
    expect(newer(a, b)).toBe(b);
    expect(newer(b, a)).toBe(b);
  });

  it('bleibt auf der Fläche', () => {
    const p = moveTo(start, -0.5, 1.7, 'anna');
    expect([p.x, p.y]).toEqual([0, 1]);
  });

  it('prüft eingehende Nachrichten', () => {
    expect(isCardPos({ x: 0.1, y: 0.2, clock: 3, by: 'x' })).toBe(true);
    expect(isCardPos({ x: 0.1, y: 0.2, clock: 1.5, by: 'x' })).toBe(false);
    expect(isCardPos({ x: Number.NaN, y: 0.2, clock: 1, by: 'x' })).toBe(false);
    expect(isCardPos(null)).toBe(false);
    expect(isCardPos('karte')).toBe(false);
  });
});
