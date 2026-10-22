import { describe, expect, it } from 'vitest';
import { hitsOf } from '../../src/rules/klio/reactions/damage';
import { expectRejected, fresh, place, run, sheet, withSheet, type K } from '../helpers';

/** Karten aufs Schadensfeld von Platz 1 legen (aus dem Gefahr-Fächer, dort beliebig greifbar). */
function drop(state: K, cards: string[]) {
  const s = place(state, 'danger', cards, true);
  return run(s, { type: 'cards.move', cards, from: { zone: 'danger' }, to: { zone: 'seat1.damage' } });
}

describe('Treffer erkennen', () => {
  it('leeres Feld: erste Karte trifft nie', () => {
    expect(hitsOf(undefined, ['H2'])).toEqual([]);
  });
  it('nur niedriger trifft, gleich hoch nicht (A2)', () => {
    expect(hitsOf('H7', ['S5'])).toEqual(['S5']);
    expect(hitsOf('H7', ['S7'])).toEqual([]);
    expect(hitsOf('H7', ['SA'])).toEqual([]);
  });
  it('Bildkarten: B=11, D=12, K=13, A=14', () => {
    expect(hitsOf('HA', ['SK'])).toEqual(['SK']);
    expect(hitsOf('HQ', ['SJ'])).toEqual(['SJ']);
    expect(hitsOf('H10', ['SJ'])).toEqual([]);
  });
  it('mehrere Karten: jede gegen die darunterliegende', () => {
    expect(hitsOf('H9', ['S8', 'C10', 'H4'])).toEqual(['S8', 'H4']);
  });
});

describe('Schaden am Bogen', () => {
  const base = place(fresh(), 'seat1.damage', ['C9'], true);

  it('Herz niedriger → Herz-Narbe, Zähler neue Narben +1', () => {
    const { state, events } = drop(base, ['H5']);
    expect(sheet(state, 'seat1').scars.heart).toBe(true);
    expect(sheet(state, 'seat1').newScars).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['cardsMoved', 'damageTaken', 'scarMarked']);
  });

  it('Narbe schon markiert → tot', () => {
    const s = withSheet(base, 'seat1', (x) => (x.scars.heart = true));
    const { state } = drop(s, ['H5']);
    expect(sheet(state, 'seat1').dead).toBe(true);
  });

  it('Kreuz oder Karo als Treffer → sofort tot, auch ohne Narbe (A3)', () => {
    expect(sheet(drop(base, ['C5']).state, 'seat1').dead).toBe(true);
    expect(sheet(drop(base, ['D5']).state, 'seat1').dead).toBe(true);
  });

  it('mehrere Karten: erste Herz-Karte markiert die Narbe, zweite tötet', () => {
    const { state, events } = drop(base, ['H8', 'H4']);
    expect(sheet(state, 'seat1').scars.heart).toBe(true);
    expect(sheet(state, 'seat1').dead).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['cardsMoved', 'damageTaken', 'scarMarked', 'characterDied']);
  });

  it('höhere Karte: nichts passiert', () => {
    const { state, events } = drop(base, ['HK']);
    expect(sheet(state, 'seat1').scars.heart).toBe(false);
    expect(events.map((e) => e.type)).toEqual(['cardsMoved']);
  });

  it('Automatik abgeschaltet: Karten werden nur bewegt', () => {
    const off = run(base, { type: 'table.setSettings', automation: { damage: false } }).state;
    const { state } = drop(off, ['C2']);
    expect(sheet(state, 'seat1').dead).toBe(false);
    expect(state.zones['seat1.damage']).toEqual(['C9', 'C2']);
  });

  it('abgelehnte Bewegung: keine halbe Reaktion', () => {
    const s = place(base, 'danger', ['H5'], true);
    expectRejected(s, { type: 'cards.move', cards: ['H5'], from: { zone: 'deck' }, to: { zone: 'seat1.damage' } }, 'reject.stale');
  });

  it('Wiederbeleben', () => {
    const dead = drop(base, ['C2']).state;
    expect(sheet(run(dead, { type: 'character.revive', seat: 'seat1' }).state, 'seat1').dead).toBe(false);
  });
});
