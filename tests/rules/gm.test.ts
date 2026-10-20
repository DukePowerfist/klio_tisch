import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import { drawOracle } from '../../src/rules/klio/generators/expedition';
import { fresh, place, run, sheet, withSheet } from '../helpers';

describe('Spielleitung', () => {
  it('Expedition: alle vier Tabellen, einzeln neu würfelbar', () => {
    const s = run(fresh(), { type: 'gm.expedition' }).state;
    const exp = s.game.expedition!;
    expect(exp).toHaveLength(4);
    for (let seed = 1; seed < 20; seed++) {
      const next = run(s, { type: 'gm.expedition', table: 2 }, undefined, seededRng(seed)).state.game.expedition!;
      expect([next[0], next[1], next[3]]).toEqual([exp[0], exp[1], exp[3]]);
    }
  });

  it('Orakel: zwei Begriffe, nie zweimal dieselbe Karte, nur Herz/Pik/Kreuz', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 500; i++) {
      const [a, b] = drawOracle(rng).oracle;
      expect(a.suit === b.suit && a.rank === b.rank).toBe(false);
      expect(['H', 'S', 'C']).toContain(a.suit);
    }
  });

  it('Spielerzahl ändern blendet nur aus, nichts geht verloren (8.2)', () => {
    let s = place(fresh(), 'seat4.notes', ['H2'], true);
    s = withSheet(s, 'seat4', (b) => (b.name = 'Ida'));
    const two = run(s, { type: 'table.setPlayers', players: 2 }).state;
    const back = run(two, { type: 'table.setPlayers', players: 4 }).state;
    expect(back.zones['seat4.notes']).toEqual(['H2']);
    expect(sheet(back, 'seat4').name).toBe('Ida');
  });

  it('Zurücksetzen: Karten auf Startplätze; Charaktere nur auf Wunsch', () => {
    let s = run(fresh(), { type: 'zone.draw', zone: 'deck' }).state;
    s = withSheet(s, 'seat1', (b) => (b.name = 'Ida'));
    const cards = run(s, { type: 'table.reset', includeCharacters: false }).state;
    expect(cards.zones['discard']).toEqual([]);
    expect(cards.zones['deck']).toHaveLength(27);
    expect(Object.values(cards.faceUp).some(Boolean)).toBe(false);
    expect(sheet(cards, 'seat1').name).toBe('Ida');
    const all = run(s, { type: 'table.reset', includeCharacters: true }).state;
    expect(sheet(all, 'seat1').name).toBe('');
  });
});
