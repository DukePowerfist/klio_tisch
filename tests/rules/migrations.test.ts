// Klio-Migrationen. Format 1 → 2: Spielbereich wird zur Tischmitte (Schritt 5d, ARCHITEKTUR.md 10).

import { describe, expect, it } from 'vitest';
import { computeLayout, placeCards } from '../../src/ui/layout';
import type { FreePos } from '../../src/engine/types';
import { content, engine, fresh, lay, type K } from '../helpers';

/** Stand im alten Format mit S5 frei im Spielbereich bzw. am Bogen */
function old(players: number, pos: FreePos): unknown {
  const s = lay(fresh(), 'S5', pos);
  return { ...s, format: 1, settings: { ...s.settings, players } };
}
const placed = (s: K, players: number) => placeCards(s, computeLayout(content, players, null, null)).S5!;

describe('Format 1 → 2: Tischmitte', () => {
  it.each([[4, 372, 1016], [2, 486, 788]])('%i Spieler: Karte neben dem Deck bleibt neben dem Deck', (players, x0, w0) => {
    // alt: 100 rechts neben dem Deck (760, 440) in der Draufsicht
    const s = engine.parseState(old(players, { anchor: 'center', x: (760 + 100 - x0) / w0, y: (440 - 10) / 970 }));
    expect(s.format).toBe(2);
    const deck = computeLayout(content, players, null, null).zones['deck']!;
    const p = placed(s, players);
    expect(p.x - deck.x).toBeCloseTo(100, 0);
    expect(p.y - deck.y).toBeCloseTo(0, 0);
  });

  it('außerhalb der Tischmitte: ganz hinein an den Rand', () => {
    // alt: ganz links und ganz unten im breiten Spielbereich (4 Spieler)
    const s = engine.parseState(old(4, { anchor: 'center', x: 0, y: 1 }));
    const p = placed(s, 4);
    const m = computeLayout(content, 4, null, null).middle;
    // Anteil auf 4 Stellen gerundet
    expect(p.x).toBeCloseTo(m.x, 1);
    expect(p.y + 80 * 0.6).toBeCloseTo(m.y + m.h, 1);
    const r = engine.parseState(old(4, { anchor: 'center', x: 1, y: 0.5 }));
    expect(placed(r, 4).x + 112 * 0.6).toBeCloseTo(m.x + m.w, 1);
  });

  it('Karten am Bogen bleiben unverändert', () => {
    const s = engine.parseState(old(4, { anchor: 'seat3', x: 0.25, y: 0.5 }));
    expect(s.freePos.S5).toEqual({ anchor: 'seat3', x: 0.25, y: 0.5 });
  });
});
