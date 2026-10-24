// Lage von Meldung und Kartenvorschau (5v, 10.8): ausweichen nur bei Überdeckung.

import { describe, expect, it } from 'vitest';
import { previewPlace, toastBottom } from '../../src/ui/overlap';

describe('Meldung über der SL-Leiste (F1)', () => {
  const toast = { x: 600, y: 800, w: 400, h: 44 };
  it('ohne Leiste oder ohne waagerechte Überdeckung unten', () => {
    expect(toastBottom(toast, [], 900, 28, 8)).toBe(28);
    expect(toastBottom(toast, [{ x: 1100, y: 820, w: 200, h: 48 }], 900, 28, 8)).toBe(28);
  });
  it('überdeckt sie sich mit der Leiste, steht sie 8 px darüber', () => {
    expect(toastBottom(toast, [{ x: 900, y: 820, w: 300, h: 48 }], 900, 28, 8)).toBe(900 - 820 + 8);
  });
  it('liegt die Leiste ganz unter der Meldung, bleibt sie unten', () => {
    expect(toastBottom(toast, [{ x: 900, y: 880, w: 300, h: 20 }], 900, 28, 8)).toBe(28);
  });
  it('mehrere Rechtecke (5zb): das höchste zählt, eines ganz außerhalb des Fensters nicht', () => {
    const sheet = { x: 500, y: 840, w: 300, h: 400 };
    const box = { x: 950, y: 800, w: 100, h: 300 };
    const off = { x: 600, y: 1000, w: 300, h: 300 };
    expect(toastBottom(toast, [sheet, box, off], 900, 28, 8)).toBe(900 - 800 + 8);
    expect(toastBottom(toast, [off], 900, 28, 8)).toBe(28);
  });
  it('beim Hineinzoomen riesig (5zb): nur der sichtbare Teil zählt, die Meldung bleibt im Fenster', () => {
    const huge = { x: 0, y: -2000, w: 3000, h: 4000 };
    expect(toastBottom(toast, [huge], 900, 28, 8)).toBe(900 - toast.h);
  });
});

describe('Kartenvorschau (F2)', () => {
  const bounds = { x: 16, y: 16, w: 1568, h: 868 };
  const size = { w: 240, h: 336 };
  const bottomRight = { x: 1584 - 240, y: 884 - 336 };
  it('unten rechts, wo auch immer die Karte liegt, solange sie nicht darunter liegt', () => {
    expect(previewPlace(bounds, size, { x: 100, y: 700, w: 80, h: 112 })).toEqual(bottomRight);
    expect(previewPlace(bounds, size, { x: 1400, y: 100, w: 80, h: 112 })).toEqual(bottomRight);
  });
  it('Karte unten rechts: oben rechts', () => {
    expect(previewPlace(bounds, size, { x: 1400, y: 700, w: 80, h: 112 })).toEqual({ x: 1584 - 240, y: 16 });
  });
  it('Karte unter beiden rechten Ecken (kleines Fenster): unten links', () => {
    const small = { x: 16, y: 16, w: 992, h: 608 };
    expect(previewPlace(small, size, { x: 850, y: 260, w: 80, h: 112 })).toEqual({ x: 16, y: 624 - 336 });
  });
});
