import { describe, expect, it } from 'vitest';
import { GM, SPECTATOR, content, engine, expectRejected, fresh, place, player, run } from '../helpers';

describe('Rechte (9.2)', () => {
  const s = fresh();
  const top = s.zones['deck']!.at(-1)!;

  it('Zuschauer dürfen nichts', () => {
    expectRejected(s, { type: 'zone.draw', zone: 'deck' }, 'reject.notAllowed', SPECTATOR);
    expectRejected(s, { type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'x' }, 'reject.notAllowed', SPECTATOR);
  });

  it('Spieler: Karten frei bewegen, auch auf fremde Schadensfelder', () => {
    run(s, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'seat2.damage' } }, player('seat1'));
  });

  it('Spieler: nur den eigenen Bogen bearbeiten', () => {
    run(s, { type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'Ida' }, player('seat1'));
    expectRejected(s, { type: 'sheet.setText', seat: 'seat2', field: 'name', value: 'Ida' }, 'reject.notAllowed', player('seat1'));
    expectRejected(s, { type: 'trump.remove', seat: 'seat2', slot: 0 }, 'reject.notAllowed', player('seat1'));
  });

  it('Spieler: keine SL-Funktionen und keine freie Wahl', () => {
    for (const cmd of [
      { type: 'gm.oracle' },
      { type: 'gm.expedition' },
      { type: 'table.reset', includeCharacters: false },
      { type: 'table.setPlayers', players: 2 },
      { type: 'character.revive', seat: 'seat1' },
      { type: 'trump.chooseFree', seat: 'seat1', trump: 'schnelle-reflexe' },
    ]) expectRejected(s, cmd, 'reject.notAllowed', player('seat1'));
  });

  it('SL darf alles', () => {
    run(s, { type: 'gm.oracle' }, GM);
    run(s, { type: 'sheet.setText', seat: 'seat3', field: 'name', value: 'Ida' }, GM);
  });

  it('SL kann zur Laufzeit freigeben: freie Wahl für Spieler (ehem. O9)', () => {
    const open = run(s, { type: 'table.setSettings', permissionOverrides: { player: { 'trump.chooseFree': 'own' } } }).state;
    run(open, { type: 'trump.chooseFree', seat: 'seat1', trump: 'schnelle-reflexe' }, player('seat1'));
    expectRejected(open, { type: 'trump.chooseFree', seat: 'seat2', trump: 'schnelle-reflexe' }, 'reject.notAllowed', player('seat1'));
  });

  it('own bei Karten: Quelle und Ziel mit Besitzer müssen eigen sein, Zonen ohne Besitzer sind frei', () => {
    let own = run(s, { type: 'table.setSettings', permissionOverrides: { player: { 'cards.move': 'own' } } }).state;
    own = place(own, 'seat2.notes', ['H5'], true);
    run(own, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'seat1.notes' } }, player('seat1'));
    run(own, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { free: { anchor: 'center', x: 0, y: 0 } } }, player('seat1'));
    expectRejected(own, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'seat2.damage' } }, 'reject.notAllowed', player('seat1'));
    expectRejected(own, { type: 'cards.move', cards: ['H5'], from: { zone: 'seat2.notes' }, to: { zone: 'discard' } }, 'reject.notAllowed', player('seat1'));
    expectRejected(own, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { free: { anchor: 'seat2', x: 0, y: 0 } } }, 'reject.notAllowed', player('seat1'));
  });

  it('jeder Rechteschlüssel wird von einem Befehl genutzt und umgekehrt', () => {
    const used = new Set(Object.values(engine.commands).map((c) => c.permission));
    const declared = new Set(Object.keys(content.permissions.player));
    expect([...used].sort()).toEqual([...declared].sort());
  });
});
