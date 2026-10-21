// Wer ist da (11.7, Schritt 5l): alle Fälle der Tabelle, Zeit vorgespult statt gewartet.

import { describe, expect, it } from 'vitest';
import { SEATS, type SeatId, type TableState } from '../../src/engine/types';
import type { PresenceInfo } from '../../src/net/presence';
import { Arrivals, AWAY_MS, stillAway, type ArrivalSignal } from '../../src/ui/arrivals';

type Seats = TableState<unknown>['seats'];
type Who = PresenceInfo['who'];

/** Plätze im Stand: genannte belegt (mit Namen), die übrigen frei */
const seats = (...occupied: SeatId[]): Seats =>
  Object.fromEntries(SEATS.map((s) => [s, occupied.includes(s) ? { occupied: true, name: s } : { occupied: false }])) as Seats;

/** Tisch mit Uhr: `who` setzt bzw. entfernt (null) die Zeigermeldung eines Peers; `at` spult vor und lässt Fristen ablaufen */
function table(start: Seats, self: SeatId | null = null) {
  let now = 1000;
  const a = new Arrivals(start, self, now);
  const others = new Map<string, { who: Who }>();
  const log: ArrivalSignal[] = [];
  const keep = (s: ArrivalSignal[]) => (log.push(...s), s);
  return {
    a,
    log,
    who: (peer: string, w: Who | null) => {
      if (w) others.set(peer, { who: w });
      else others.delete(peer);
      return keep(a.presence(others, now));
    },
    seats: (next: Seats) => keep(a.seatsChanged(next, now)),
    self: (s: SeatId | null) => keep(a.setSelf(s, now)),
    /** Zeit vorspulen (ms) und fällige Fristen ablaufen lassen, wie es der Zeitgeber der Sitzung täte */
    after: (ms: number) => {
      now += ms;
      return keep(a.tick(now));
    },
  };
}

describe('Anfangszustand und erstes Erscheinen nach dem eigenen Laden', () => {
  it('besetzter Platz ohne Zeigermeldung: erst anwesend, nach AWAY_MS still „nicht da“', () => {
    const t = table(seats('seat2'));
    expect(t.a.present('seat2')).toBe(true);
    expect(t.after(AWAY_MS - 1)).toEqual([]);
    expect(t.a.present('seat2')).toBe(true);
    expect(t.after(1)).toEqual([]);
    expect(t.a.present('seat2')).toBe(false);
  });

  it('erstes Erscheinen ist still, auch nach stillem „nicht da“ (kein „wieder da“)', () => {
    const t = table(seats('seat2', 'seat3'));
    expect(t.who('p2', 'seat2')).toEqual([]);
    t.after(AWAY_MS);
    expect(t.a.present('seat3')).toBe(false);
    expect(t.who('p3', 'seat3')).toEqual([]);
    expect(t.a.present('seat3')).toBe(true);
    expect(t.log).toEqual([]);
  });

  it('der eigene Platz ist immer anwesend; freie Plätze haben keine Frist', () => {
    const t = table(seats('seat1'), 'seat1');
    expect(t.a.nextDeadline()).toBeNull();
    t.after(AWAY_MS * 3);
    expect(t.a.present('seat1')).toBe(true);
    expect(t.log).toEqual([]);
  });
});

describe('Platz belegt', () => {
  it('Zeigermeldung vor dem Ereignis: belegt und angekommen sofort', () => {
    const t = table(seats());
    t.who('p2', 'seat2');
    expect(t.seats(seats('seat2'))).toEqual([
      { type: 'seated', seat: 'seat2' },
      { type: 'arrived', seat: 'seat2', how: 'new', peer: 'p2', self: false },
    ]);
  });

  it('Zeigermeldung nach dem Ereignis (binnen AWAY_MS): belegt sofort, angekommen mit der Meldung', () => {
    const t = table(seats());
    expect(t.seats(seats('seat2'))).toEqual([{ type: 'seated', seat: 'seat2' }]);
    t.after(AWAY_MS - 1);
    expect(t.who('p2', 'seat2')).toEqual([{ type: 'arrived', seat: 'seat2', how: 'new', peer: 'p2', self: false }]);
  });

  it('Zuschauer wird Spieler: der Wechsel von `who` ist kein erstes Erscheinen, das Ankommen kommt vom Ereignis', () => {
    const t = table(seats());
    t.who('p9', 'spectator');
    expect(t.who('p9', 'seat3')).toEqual([]);
    expect(t.seats(seats('seat3'))).toContainEqual({ type: 'arrived', seat: 'seat3', how: 'new', peer: 'p9', self: false });
  });

  it('Umsetzen einer abwesenden Person: nur belegt, kein Ankommen, danach still „nicht da“', () => {
    const t = table(seats());
    t.seats(seats('seat4'));
    expect(t.after(AWAY_MS)).toEqual([]);
    expect(t.a.present('seat4')).toBe(false);
    // kommt sie später, ist das ihr erstes Erscheinen hier: still
    expect(t.who('p4', 'seat4')).toEqual([]);
    expect(t.log).toEqual([{ type: 'seated', seat: 'seat4' }]);
  });

  it('eigener Beitritt: das Ereignis kommt vor der Rolle; angekommen mit der Rolle, als man selbst', () => {
    const t = table(seats());
    expect(t.seats(seats('seat2'))).toEqual([{ type: 'seated', seat: 'seat2' }]);
    expect(t.self('seat2')).toEqual([{ type: 'arrived', seat: 'seat2', how: 'new', peer: null, self: true }]);
  });
});

describe('Weg und wieder da', () => {
  it('kurzer Abbruch unter AWAY_MS (Neuladen): nichts', () => {
    const t = table(seats('seat2'));
    t.who('p2', 'seat2');
    t.who('p2', null);
    t.after(AWAY_MS - 1);
    expect(t.who('p2b', 'seat2')).toEqual([]);
    t.after(AWAY_MS);
    expect(t.log).toEqual([]);
    expect(t.a.present('seat2')).toBe(true);
  });

  it('weg nach AWAY_MS, dann wieder da (mit neuer Peer-ID)', () => {
    const t = table(seats('seat2'));
    t.who('p2', 'seat2');
    t.who('p2', null);
    expect(t.after(AWAY_MS)).toEqual([{ type: 'left', seat: 'seat2' }]);
    expect(t.a.present('seat2')).toBe(false);
    expect(t.who('p2b', 'seat2')).toEqual([{ type: 'arrived', seat: 'seat2', how: 'back', peer: 'p2b', self: false }]);
    expect(t.a.present('seat2')).toBe(true);
  });

  it('„wieder da“ nur nach „weg“: wer nie anwesend gesehen wurde, kommt still', () => {
    const t = table(seats('seat2'));
    t.after(AWAY_MS);
    expect(t.who('p2', 'seat2')).toEqual([]);
  });

  it('zwei Tabs mit demselben Platz (der alte noch im Raum): erst wenn beide weg sind, läuft die Frist', () => {
    const t = table(seats('seat2'));
    t.who('old', 'seat2');
    t.who('new', 'seat2');
    t.who('new', null);
    expect(t.a.nextDeadline()).toBeNull();
    t.who('old', null);
    expect(t.after(AWAY_MS)).toEqual([{ type: 'left', seat: 'seat2' }]);
  });
});

describe('Freigeben, Umsetzen, Tausch', () => {
  it('Freigeben hält die Uhr an und steht im Protokoll', () => {
    const t = table(seats('seat2'));
    t.who('p2', 'seat2');
    t.who('p2', null);
    expect(t.seats(seats())).toEqual([{ type: 'freed', seat: 'seat2' }]);
    expect(t.after(AWAY_MS)).toEqual([]);
    expect(t.a.nextDeadline()).toBeNull();
  });

  it('Freigeben einer anwesenden Person: sie wird Zuschauer, kein „weg“', () => {
    const t = table(seats('seat2'));
    t.who('p2', 'seat2');
    t.seats(seats());
    t.who('p2', 'spectator');
    expect(t.after(AWAY_MS)).toEqual([]);
    expect(t.log).toEqual([{ type: 'freed', seat: 'seat2' }]);
  });

  it('Umsetzen auf einen freien Platz: am Ziel angekommen, am alten Platz kein „frei“ und kein „weg“', () => {
    const t = table(seats('seat2'));
    t.who('p2', 'seat2');
    const moved = t.seats(seats('seat4'));
    expect(moved).not.toContainEqual({ type: 'freed', seat: 'seat2' });
    expect(moved).toContainEqual({ type: 'seated', seat: 'seat4' });
    expect(t.who('p2', 'seat4')).toEqual([{ type: 'arrived', seat: 'seat4', how: 'new', peer: 'p2', self: false }]);
    expect(t.after(AWAY_MS)).toEqual([]);
  });

  it('Tausch mit einer abwesenden Person: kein Ankommen, kein „weg“; deren neuer Platz danach still „nicht da“', () => {
    const t = table(seats('seat2', 'seat3'));
    t.who('a', 'seat2');
    t.who('b', 'seat3');
    t.who('b', null);
    expect(t.after(AWAY_MS)).toEqual([{ type: 'left', seat: 'seat3' }]);
    t.log.length = 0;
    // Tausch: Stand ändert sich nur im Namen, A meldet sich mit dem neuen Platz
    expect(t.seats({ ...seats('seat2', 'seat3'), seat2: { occupied: true, name: 'seat3' }, seat3: { occupied: true, name: 'seat2' } })).toEqual([]);
    expect(t.who('a', 'seat3')).toEqual([]);
    expect(t.a.present('seat3')).toBe(true);
    expect(t.after(AWAY_MS)).toEqual([]);
    expect(t.a.present('seat2')).toBe(false);
    expect(t.log).toEqual([]);
  });

  it('Tausch zweier anwesender Personen: nichts', () => {
    const t = table(seats('seat2', 'seat3'));
    t.who('a', 'seat2');
    t.who('b', 'seat3');
    t.who('a', 'seat3');
    t.who('b', 'seat2');
    t.after(AWAY_MS);
    expect(t.log).toEqual([]);
    expect([t.a.present('seat2'), t.a.present('seat3')]).toEqual([true, true]);
  });

  it('selbst umgesetzt: der alte Platz bleibt belegt (Tausch mit einer Abwesenden) und wird still „nicht da“', () => {
    const t = table(seats('seat2', 'seat3'), 'seat2');
    expect(t.self('seat3')).toEqual([]);
    expect(t.after(AWAY_MS)).toEqual([]);
    expect(t.a.present('seat2')).toBe(false);
    expect(t.a.present('seat3')).toBe(true);
  });
});

describe('Stand', () => {
  it('unveränderte Belegung (Name, Farbe, ganz ersetzter Stand ohne Wechsel): nichts', () => {
    const t = table(seats('seat2'));
    expect(t.seats({ ...seats('seat2'), seat2: { occupied: true, name: 'Anna', color: '#fff' } })).toEqual([]);
  });
});

describe('SL und Zuschauer', () => {
  it('ändern an den Plätzen nichts', () => {
    const t = table(seats('seat2'));
    t.who('p2', 'seat2');
    t.who('gm', 'gm');
    t.who('s', 'spectator');
    t.who('gm', null);
    t.who('s', null);
    t.after(AWAY_MS);
    expect(t.log).toEqual([]);
  });
});

describe('Übergang am Schild (Teil 3)', () => {
  const set = (...s: SeatId[]) => new Set<SeatId>(s);
  it('ohne Signal still (Anfangszustand, erstes Erscheinen), mit Signal überblendet', () => {
    // still „nicht da“ nach dem Laden
    expect(stillAway(set(), set('seat2'), [], set())).toEqual(set('seat2'));
    // weg mit Signal: überblendet, auch wenn der Platz vorher still war
    expect(stillAway(set(), set('seat2'), [{ type: 'left', seat: 'seat2' }], set('seat2'))).toEqual(set());
    // wieder da: überblendet; erstes Erscheinen (ohne Signal): still
    expect(stillAway(set('seat2'), set(), [{ type: 'arrived', seat: 'seat2', how: 'back', peer: 'p', self: false }], set())).toEqual(set());
    expect(stillAway(set('seat2'), set(), [], set())).toEqual(set('seat2'));
  });

  it('unveränderte Plätze behalten ihren Wert', () => {
    expect(stillAway(set('seat3'), set('seat3', 'seat2'), [{ type: 'left', seat: 'seat2' }], set('seat3'))).toEqual(set('seat3'));
  });
});
