import { describe, expect, it } from 'vitest';
import type { Online } from '../../src/net/host';
import { assignable, freeSeats, moveTargets, watchers, withCharacter } from '../../src/ui/seatActions';
import { fresh, run, withSheet, type K } from '../helpers';

/** Platz 1 Ida (Hilda), Platz 2 frei (Gunnar), Platz 3 Bert ohne Charakter, Platz 4 frei */
function table(): K {
  let s = run(fresh(), { type: 'table.setSeat', seat: 'seat1', occupied: true, name: 'Ida' }).state;
  s = run(s, { type: 'table.setSeat', seat: 'seat3', occupied: true, name: 'Bert' }).state;
  s = withSheet(s, 'seat1', (b) => (b.name = 'Hilda'));
  return withSheet(s, 'seat2', (b) => (b.name = 'Gunnar'));
}

const online: Online[] = [
  { role: 'player', seat: 'seat1', peer: 'p1', name: 'Ida' },
  { role: 'spectator', peer: 'p2', name: 'Cora' },
  { role: 'spectator', peer: 'p3', name: '' },
];

describe('Aktionen zu Platz und Person (10.1)', () => {
  it('Charaktername nur, wenn der Bogen einen hat', () => {
    const s = table();
    expect(withCharacter(s, 'Platz 2', 'seat2')).toBe('Platz 2 – Gunnar');
    expect(withCharacter(s, 'Platz 3', 'seat3')).toBe('Platz 3');
  });

  it('Umsetzen: freie Plätze mit „frei“, besetzte als Tausch mit Person', () => {
    expect(moveTargets(table(), 'seat1')).toEqual([
      { seat: 'seat2', label: 'auf Platz 2 – Gunnar (frei)' },
      { seat: 'seat3', label: 'mit Platz 3 tauschen (Bert)' },
      { seat: 'seat4', label: 'auf Platz 4 (frei)' },
    ]);
  });

  it('Umsetzen vom ausgeblendeten Platz: nur freie sichtbare Ziele', () => {
    let s = run(table(), { type: 'table.setSeat', seat: 'seat4', occupied: true, name: 'Dora' }).state;
    s = run(s, { type: 'table.setPlayers', players: 3 }).state;
    expect(moveTargets(s, 'seat4').map((o) => o.seat)).toEqual(['seat2']);
  });

  it('freie Plätze nur sichtbare, mit Charakter beschriftet', () => {
    expect(freeSeats(table())).toEqual([{ seat: 'seat2', label: 'Platz 2 – Gunnar' }, { seat: 'seat4', label: 'Platz 4' }]);
    expect(freeSeats(run(table(), { type: 'table.setPlayers', players: 3 }).state).map((o) => o.seat)).toEqual(['seat2']);
  });

  it('Zuschauer mit Namen, ohne Namen „Zuschauer ohne Namen“; Spieler zählen nicht', () => {
    expect(watchers(online)).toEqual([
      { peer: 'p2', label: 'Cora', named: true },
      { peer: 'p3', label: 'Zuschauer ohne Namen', named: false },
    ]);
  });

  it('zuweisen nur an einen freien sichtbaren Platz', () => {
    const s = table();
    expect(assignable(s, online, 'seat2').map((w) => w.peer)).toEqual(['p2', 'p3']);
    expect(assignable(s, online, 'seat1')).toEqual([]);
    expect(assignable(run(s, { type: 'table.setPlayers', players: 3 }).state, online, 'seat4')).toEqual([]);
  });
});
