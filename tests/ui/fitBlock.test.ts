// Mehrzeiliger Text in fester Höhe (5zb, 10.12, T2): fitBlock sucht den größten Faktor, bei dem der Inhalt passt.

import { describe, expect, it } from 'vitest';
import { fitBlock } from '../../src/ui/fitText';

/** Ersatz für ein Element: Inhalt `need` Pixel hoch bei Faktor 1, wächst mit dem Faktor; Platz `room` */
function fake(need: number, room: number) {
  let k = 1;
  const el = { get scrollHeight() { return need * k; }, clientHeight: room } as unknown as HTMLElement;
  return { el, apply: (v: number) => (k = v), get k() { return k; } };
}

describe('fitBlock', () => {
  it('kurzer Text: bleibt bei 1', () => {
    const f = fake(50, 90);
    expect(fitBlock(f.el, f.apply, 12 / 14)).toBe(1);
    expect(f.k).toBe(1);
  });

  it('langer Text: der größte Faktor zwischen min und 1, bei dem er passt', () => {
    const f = fake(100, 90);
    const k = fitBlock(f.el, f.apply, 12 / 14);
    expect(k).toBeGreaterThanOrEqual(12 / 14);
    // 0,5 px Spielraum beim Messen: 100 · k ≤ 90,5
    expect(k).toBeLessThanOrEqual(0.905);
    expect(k).toBeGreaterThan(0.89);
    expect(f.k).toBe(k);
  });

  it('zu langer Text: ausnahmsweise unter min, höchstens bis min / 2, statt abzuschneiden', () => {
    const f = fake(150, 90);
    const k = fitBlock(f.el, f.apply, 12 / 14);
    expect(k).toBeLessThan(12 / 14);
    expect(k).toBeGreaterThan(0.59);
    expect(k).toBeLessThanOrEqual(90.5 / 150);
    const g = fake(1000, 90);
    expect(fitBlock(g.el, g.apply, 0.8)).toBe(0.4);
  });
});
