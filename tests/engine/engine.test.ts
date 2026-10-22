import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/dispatch';
import { cryptoRng, seededRng, shuffled } from '../../src/engine/rng';
import { initialTable } from '../../src/engine/setup';
import type { EngineEventOf, Ruleset } from '../../src/engine/types';
import { GM, SPECTATOR, engine, expectRejected, fresh, place, player, run, type K } from '../helpers';

const allCards = (s: K) => [...Object.values(s.zones).flat(), ...s.free];

describe('Zufall', () => {
  it('feste Startzahl → gleiches Ergebnis', () => {
    expect(shuffled([1, 2, 3, 4, 5, 6], seededRng(3))).toEqual(shuffled([1, 2, 3, 4, 5, 6], seededRng(3)));
  });

  it('Mischen ist eine Umordnung und erzwingt keine Änderung (A26)', () => {
    const rng = seededRng(11);
    let same = 0;
    for (let i = 0; i < 2000; i++) {
      const r = shuffled(['a', 'b'], rng);
      expect([...r].sort()).toEqual(['a', 'b']);
      if (r[0] === 'a') same++;
    }
    expect(same / 2000).toBeGreaterThan(0.45);
    expect(same / 2000).toBeLessThan(0.55);
  });

  it('kryptografischer Zufall bleibt im Bereich und trifft alle Werte', () => {
    const rng = cryptoRng();
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });
});

describe('Aufbau', () => {
  const s = fresh();

  it('52 Karten, jede genau einmal, alle verdeckt, nichts frei', () => {
    const cards = allCards(s);
    expect(cards).toHaveLength(52);
    expect(new Set(cards).size).toBe(52);
    expect(Object.values(s.faceUp).some(Boolean)).toBe(false);
    expect(s.free).toEqual([]);
  });

  it('Startaufteilung wie bisher, jede Zone existiert (auch je Platz)', () => {
    expect([...s.zones['diamonds_easy']!].sort()).toEqual(['D2', 'D3', 'D4', 'D5', 'D6']);
    expect(s.zones['deck']).toHaveLength(27);
    expect(s.zones['clubs']).toHaveLength(12);
    for (const z of ['discard', 'display', 'danger', 'progress', 'seat1.damage', 'seat4.notes', 'seat2.collect']) expect(s.zones[z]).toEqual([]);
  });
});

describe('Karten bewegen', () => {
  const base = place(place(fresh(), 'danger', ['H2', 'H3', 'H4'], true), 'seat1.notes', ['S2', 'S3'], true);

  it('vom Stapel nur die oberste Karte, mit Umschalt die obersten mehreren', () => {
    const deck = base.zones['deck']!;
    const top = deck[deck.length - 1]!;
    const second = deck[deck.length - 2]!;
    expectRejected(base, { type: 'cards.move', cards: [second], from: { zone: 'deck' }, to: { zone: 'danger' } }, 'reject.stale');
    const { state } = run(base, { type: 'cards.move', cards: [second, top], from: { zone: 'deck' }, to: { zone: 'danger' } });
    expect(state.zones['danger']!.slice(-2)).toEqual([second, top]);
    expect(state.zones['deck']).toHaveLength(deck.length - 2);
  });

  it('aus einem Fächer jede einzelne Karte', () => {
    const { state } = run(base, { type: 'cards.move', cards: ['H2'], from: { zone: 'danger' }, to: { zone: 'progress' } });
    expect(state.zones['danger']).toEqual(['H3', 'H4']);
    expect(state.zones['progress']).toEqual(['H2']);
  });

  it('Voraussetzung veraltet (jemand war schneller) → abgelehnt, nichts ändert sich', () => {
    const { state } = run(base, { type: 'cards.move', cards: ['H4'], from: { zone: 'danger' }, to: { zone: 'progress' } });
    expectRejected(state, { type: 'cards.move', cards: ['H4'], from: { zone: 'danger' }, to: { zone: 'discard' } }, 'reject.stale');
  });

  it('Notizen fassen höchstens 3 Karten', () => {
    const { state } = run(base, { type: 'cards.move', cards: ['H4'], from: { zone: 'danger' }, to: { zone: 'seat1.notes' } });
    expect(state.zones['seat1.notes']).toHaveLength(3);
    expectRejected(state, { type: 'cards.move', cards: ['H3'], from: { zone: 'danger' }, to: { zone: 'seat1.notes' } }, 'reject.capacity.notes');
    // Umsortieren innerhalb der Notizen geht weiterhin
    run(state, { type: 'cards.move', cards: ['S2'], from: { zone: 'seat1.notes' }, to: { zone: 'seat1.notes' } });
  });

  it('Ablegen auf Ablage, Auslage und Schaden deckt auf, anderswo nicht', () => {
    const top = base.zones['deck']!.at(-1)!;
    for (const zone of ['discard', 'display', 'seat2.damage']) {
      const { state, events } = run(base, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone } });
      expect(state.faceUp[top as never]).toBe(true);
      expect(events.map((e) => e.type)).toContain('cardsTurned');
    }
    const { state } = run(base, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'danger' } });
    expect(state.faceUp[top as never]).toBeFalsy();
  });

  it('frei ablegen mit Anker, wieder aufnehmen', () => {
    const top = base.zones['deck']!.at(-1)!;
    const { state } = run(base, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { free: { anchor: 'seat2', x: 10, y: 20 } } });
    expect(state.free).toEqual([top]);
    expect(state.freePos[top as never]).toEqual({ anchor: 'seat2', x: 10, y: 20 });
    const back = run(state, { type: 'cards.move', cards: [top], from: { free: true }, to: { zone: 'discard' } }).state;
    expect(back.free).toEqual([]);
    expect(back.freePos).toEqual({});
  });

  it('ausgeblendete Plätze: weder ablegen noch aufnehmen', () => {
    const two = run(base, { type: 'table.setPlayers', players: 2 }).state;
    const top = two.zones['deck']!.at(-1)!;
    expectRejected(two, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'seat3.damage' } }, 'reject.hiddenSeat');
    expectRejected(two, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { free: { anchor: 'seat4', x: 0, y: 0 } } }, 'reject.hiddenSeat');
  });
});

describe('Umdrehen, Ziehen, Mischen', () => {
  const base = fresh();

  it('Doppelklick dreht die oberste Karte um, nicht eine darunter', () => {
    const deck = base.zones['deck']!;
    const { state } = run(base, { type: 'card.flip', card: deck.at(-1) });
    expect(state.faceUp[deck.at(-1) as never]).toBe(true);
    expectRejected(base, { type: 'card.flip', card: deck.at(-2) }, 'reject.stale');
  });

  it('Kreuz: Doppelklick auf verdeckte Karte dreht sie nur um, Ablage bleibt leer (5r, F1)', () => {
    const top = base.zones['clubs']!.at(-1)!;
    const { state, events } = run(base, { type: 'card.flip', card: top });
    expect(state.zones['clubs']).toEqual(base.zones['clubs']);
    expect(state.zones['discard']).toEqual([]);
    expect(state.faceUp[top as never]).toBe(true);
    expect(events).toEqual([{ type: 'cardsTurned', cards: [top], faceUp: true }]);
  });

  describe('Ziehen auf eine Zone mit Höchstzahl und Besitzer (5r)', () => {
    const pile: Ruleset<null> = {
      id: 'pile', version: '1', initialGame: () => null, parseGame: () => null,
      deck: { start: { pile: ['H2', 'H3'] } },
      zones: [{ id: 'pile', actions: { draw: { to: 'seat1.box', faceUp: true, announce: false } } }, { id: 'box', perSeat: true, capacity: 1 }],
      commands: {}, events: {}, migrations: [], seatColors: ['a', 'b', 'c', 'd'], reactions: [],
      permissions: { gm: 'all', player: { 'zone.draw': 'own' }, spectator: 'none' },
    };
    const e = createEngine(pile);
    const s0 = initialTable(pile, seededRng(1));
    const go = (s: typeof s0, actor = GM) => e.dispatch(s, { type: 'zone.draw', zone: 'pile' }, actor, seededRng(1));

    it('volle Zielzone lehnt ab wie beim Ablegen', () => {
      const first = go(s0);
      if ('rejected' in first) throw new Error();
      expect(first.state.zones['seat1.box']).toHaveLength(1);
      const second = go(first.state);
      expect('rejected' in second && second.reason).toEqual({ key: 'reject.capacity.box', params: { max: 1 } });
    });

    it('Ziehen auf einen fremden Platz braucht das Recht für dessen Zone', () => {
      expect('rejected' in go(s0, player('seat2'))).toBe(true);
      expect('rejected' in go(s0, player('seat1'))).toBe(false);
    });
  });

  it('Deck ziehen → offen auf die Ablage; Karo ziehen → offen in die Auslage', () => {
    const d = run(base, { type: 'zone.draw', zone: 'deck' }).state;
    expect(d.zones['discard']).toHaveLength(1);
    const k = run(base, { type: 'zone.draw', zone: 'diamonds_hard' }).state;
    expect(k.zones['display']).toHaveLength(1);
    expect(k.faceUp[k.zones['display']![0] as never]).toBe(true);
  });

  it('„Umdrehen“: jeder Stapel dreht die oberste Karte an Ort und Stelle um, auch Kreuz (F4)', () => {
    for (const zone of ['deck', 'diamonds_easy', 'clubs']) {
      const top = base.zones[zone]!.at(-1)!;
      const { state } = run(base, { type: 'zone.flip', zone });
      expect(state.faceUp[top as never], zone).toBe(true);
      expect(state.zones[zone], zone).toEqual(base.zones[zone]);
    }
    expect(run(base, { type: 'zone.flip', zone: 'clubs' }).state.zones['discard']).toEqual([]);
  });

  it('leerer Stapel: Ziehen tut nichts; Ablage hat kein Ziehen', () => {
    const empty = place(base, 'danger', [...base.zones['diamonds_easy']!]);
    expect(run(empty, { type: 'zone.draw', zone: 'diamonds_easy' }).events).toEqual([]);
    expectRejected(base, { type: 'zone.draw', zone: 'discard' }, 'reject.noAction');
  });

  it('Deck mischen: Karo von der Ablage zurück in ihre Stapel, Rest ins Deck, alles verdeckt und gemischt (15.5, A31)', () => {
    let s = place(base, 'discard', ['D3', 'HA', 'DK', 'C5'], true);
    s = place(s, 'diamonds_easy', [], false);
    const { state, events } = run(s, { type: 'zone.shuffle', zone: 'deck' });
    expect(state.zones['discard']).toEqual([]);
    expect(state.zones['deck']).toEqual(expect.arrayContaining(['HA', 'C5']));
    expect(state.zones['diamonds_easy']).toContain('D3');
    expect(state.zones['diamonds_hard']).toContain('DK');
    for (const c of ['D3', 'HA', 'DK', 'C5']) expect(state.faceUp[c as never]).toBe(false);
    const ev = events[0] as EngineEventOf<'zonesShuffled'>;
    expect(ev.shuffled.sort()).toEqual(['deck', 'diamonds_easy', 'diamonds_hard']);
    expect(allCards(state)).toHaveLength(52);
  });

  it('Karo mischen holt Karo aus der Auslage in die passenden Stapel, andere Karten bleiben', () => {
    const s = place(base, 'display', ['D7', 'H9', 'D2'], true);
    const { state } = run(s, { type: 'zone.shuffle', zone: 'diamonds_easy' });
    expect(state.zones['display']).toEqual(['H9']);
    expect(state.zones['diamonds_medium']).toContain('D7');
    expect(state.zones['diamonds_easy']).toContain('D2');
  });
});

describe('Ablauf', () => {
  it('Ereignisse sind fortlaufend nummeriert; Clients kommen per replay zum selben Stand', () => {
    const s0 = fresh();
    const r1 = engine.dispatch(s0, { type: 'zone.draw', zone: 'deck' }, GM, seededRng(1));
    if ('rejected' in r1) throw new Error();
    const r2 = engine.dispatch(r1.state, { type: 'zone.shuffle', zone: 'deck' }, GM, seededRng(2));
    if ('rejected' in r2) throw new Error();
    expect([...r1.events, ...r2.events].map((e) => e.seq)).toEqual([1, 2]);
    expect(engine.replay(s0, [...r1.events, ...r2.events])).toEqual(r2.state);
  });

  it('replay erkennt Lücken', () => {
    const s0 = fresh();
    const r = engine.dispatch(s0, { type: 'zone.draw', zone: 'deck' }, GM, seededRng(1));
    if ('rejected' in r) throw new Error();
    expect(() => engine.replay(s0, [{ ...r.events[0]!, seq: 2 }])).toThrow(/Lücke/);
  });

  it('unbekannte oder kaputte Befehle werden abgelehnt', () => {
    expectRejected(fresh(), { type: 'gibts.nicht' }, 'reject.unknownCommand');
    expectRejected(fresh(), { type: 'zone.draw', zone: 5 }, 'reject.invalid');
    expectRejected(fresh(), { type: 'zone.draw', zone: 'deck', extra: 1 }, 'reject.invalid');
  });

  it('Reaktionen, die sich endlos auslösen, brechen den ganzen Befehl ab', () => {
    const loop: Ruleset<null> = {
      id: 'loop', version: '1', initialGame: () => null, parseGame: () => null,
      deck: { start: {} }, zones: [{ id: 'a', actions: { draw: { to: 'a', faceUp: true, announce: false } } }],
      commands: {}, events: { ping: { parse: (x) => x as { type: 'ping' }, apply: (s) => s } }, migrations: [], seatColors: ['a', 'b', 'c', 'd'],
      reactions: [{ id: 'echo', react: () => [{ type: 'ping' }] }],
      permissions: { gm: 'all', player: {}, spectator: 'none' },
    };
    const e = createEngine(loop);
    const s = initialTable(loop, seededRng(1));
    s.zones['a'] = ['H2'];
    const r = e.dispatch(s, { type: 'zone.draw', zone: 'a' }, GM, seededRng(1));
    expect('rejected' in r && r.reason.key).toBe('reject.reactionLoop');
  });

  it('Plätze: belegen nur sichtbare freie, freigeben jederzeit; nur die SL', () => {
    const s = run(fresh(), { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Ida' }).state;
    expect(s.seats.seat2).toEqual({ occupied: true, name: 'Ida' });
    expectRejected(s, { type: 'table.setSeat', seat: 'seat2', occupied: true }, 'reject.seatTaken');
    const two = run(s, { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'table.setSeat', seat: 'seat3', occupied: true }, 'reject.hiddenSeat');
    expectRejected(s, { type: 'table.setSeat', seat: 'seat2', occupied: false }, 'reject.notAllowed', player('seat2'));
  });

  it('freier Platz merkt sich, wer zuletzt dort saß (8.7)', () => {
    const s = run(fresh(), { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Ida' }).state;
    const freed = run(s, { type: 'table.setSeat', seat: 'seat2', occupied: false }).state;
    expect(freed.seats.seat2).toEqual({ occupied: false, name: 'Ida' });
    // wer den Platz neu belegt, ersetzt den Namen; ohne Namen bleibt keiner
    expect(run(freed, { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Bo' }).state.seats.seat2).toEqual({ occupied: true, name: 'Bo' });
    expect(run(freed, { type: 'table.setSeat', seat: 'seat2', occupied: true }).state.seats.seat2).toEqual({ occupied: true });
    // ohne Vorgänger kein Name
    expect(run(fresh(), { type: 'table.setSeat', seat: 'seat3', occupied: false }).state.seats.seat3).toEqual({ occupied: false });
  });

  it('umsetzen und tauschen (8.7): Personen wechseln, Farben bleiben am Platz; nur die SL', () => {
    let s = run(fresh(), { type: 'table.setSeat', seat: 'seat1', occupied: true, name: 'Ida' }).state;
    s = run(s, { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Bo' }).state;
    s = run(s, { type: 'seat.edit', seat: 'seat2', color: 'teal' }).state;
    // auf einen freien Platz: der alte merkt sich die Person als „zuletzt“
    const moved = run(s, { type: 'table.moveSeat', from: 'seat1', to: 'seat3' });
    expect(moved.events).toEqual([{ type: 'seatsChanged', seats: expect.anything() }]);
    expect(moved.state.seats.seat3).toEqual({ occupied: true, name: 'Ida' });
    expect(moved.state.seats.seat1).toEqual({ occupied: false, name: 'Ida' });
    // tauschen
    const swapped = run(s, { type: 'table.moveSeat', from: 'seat1', to: 'seat2' }).state;
    expect(swapped.seats.seat1).toEqual({ occupied: true, name: 'Bo' });
    expect(swapped.seats.seat2).toEqual({ occupied: true, name: 'Ida', color: 'teal' });
    // Bögen bleiben am Platz
    expect(swapped.game).toEqual(s.game);
    // Ablehnungen
    expectRejected(s, { type: 'table.moveSeat', from: 'seat3', to: 'seat4' }, 'reject.seatFree');
    expectRejected(s, { type: 'table.moveSeat', from: 'seat1', to: 'seat1' }, 'reject.invalid');
    expectRejected(s, { type: 'table.moveSeat', from: 'seat1', to: 'seat3' }, 'reject.notAllowed', player('seat1'));
    expectRejected(s, { type: 'table.moveSeat', from: 'seat1', to: 'seat3' }, 'reject.notAllowed', SPECTATOR);
  });

  it('umsetzen mit ausgeblendeten Plätzen (8.7): vom ausgeblendeten auf einen freien, nie auf einen ausgeblendeten', () => {
    let s = run(fresh(), { type: 'table.setSeat', seat: 'seat1', occupied: true, name: 'Ida' }).state;
    s = run(s, { type: 'table.setSeat', seat: 'seat4', occupied: true, name: 'Cem' }).state;
    const two = run(s, { type: 'table.setPlayers', players: 2 }).state;
    const back = run(two, { type: 'table.moveSeat', from: 'seat4', to: 'seat2' }).state;
    expect(back.seats.seat2).toEqual({ occupied: true, name: 'Cem' });
    expect(back.seats.seat4).toEqual({ occupied: false, name: 'Cem' });
    expectRejected(two, { type: 'table.moveSeat', from: 'seat1', to: 'seat3' }, 'reject.hiddenSeat');
    // Tausch mit ausgeblendetem Platz: der andere landete ungefragt dort
    expectRejected(two, { type: 'table.moveSeat', from: 'seat4', to: 'seat1' }, 'reject.hiddenSeat');
  });

  it('eigener Name und eigene Farbe (5e): nur am eigenen Platz, jede Farbe höchstens einmal', () => {
    const s = run(fresh(), { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Ida' }).state;
    const named = run(s, { type: 'seat.edit', seat: 'seat2', name: '  Ida W. ' }, player('seat2')).state;
    expect(named.seats.seat2).toEqual({ occupied: true, name: 'Ida W.' });
    // leerer Name = ohne Namen
    expect(run(named, { type: 'seat.edit', seat: 'seat2', name: '' }, player('seat2')).state.seats.seat2).toEqual({ occupied: true });
    // Farbe aus der Auswahl; die Voreinstellungen der anderen Plätze sind belegt (seat1 = coral)
    const teal = run(s, { type: 'seat.edit', seat: 'seat2', color: 'teal' }, player('seat2')).state;
    expect(teal.seats.seat2).toEqual({ occupied: true, name: 'Ida', color: 'teal' });
    expectRejected(s, { type: 'seat.edit', seat: 'seat2', color: 'coral' }, 'reject.colorTaken', player('seat2'));
    expectRejected(s, { type: 'seat.edit', seat: 'seat2', color: 'gold' }, 'reject.unknownColor', player('seat2'));
    // die alte Farbe von Platz 2 ist danach frei
    expect(run(teal, { type: 'seat.edit', seat: 'seat1', color: 'sky' }).state.seats.seat1.color).toBe('sky');
    // auch ausgeblendete Plätze behalten ihre Farbe für sich (seat4 = violet)
    const two = run(s, { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'seat.edit', seat: 'seat2', color: 'violet' }, 'reject.colorTaken', player('seat2'));
    // fremder Platz, Zuschauer, freier Platz
    expectRejected(s, { type: 'seat.edit', seat: 'seat1', color: 'teal' }, 'reject.notAllowed', player('seat2'));
    expectRejected(s, { type: 'seat.edit', seat: 'seat2', name: 'X' }, 'reject.notAllowed', SPECTATOR);
    expectRejected(s, { type: 'seat.edit', seat: 'seat3', name: 'X' }, 'reject.seatFree');
    // die Farbe gehört zum Platz: bleibt beim Freigeben und neu Belegen
    const freed = run(teal, { type: 'table.setSeat', seat: 'seat2', occupied: false }).state;
    expect(freed.seats.seat2).toEqual({ occupied: false, name: 'Ida', color: 'teal' });
    expect(run(freed, { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Bo' }).state.seats.seat2).toEqual({ occupied: true, name: 'Bo', color: 'teal' });
  });

  it('Spieler eines ausgeblendeten Platzes sind Zuschauer', () => {
    const two = run(fresh(), { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'zone.draw', zone: 'deck' }, 'reject.notAllowed', player('seat3'));
    run(two, { type: 'zone.draw', zone: 'deck' }, player('seat2'));
  });
});

describe('Laterne (5n, 11.9)', () => {
  it('brennt am Anfang; Löschen und Anzünden ergeben je ein Ereignis mit dem Auslöser', () => {
    const s = fresh();
    expect(s.lamp).toBe(true);
    const out = run(s, { type: 'table.setLamp', lit: false });
    expect(out.events).toEqual([{ type: 'lampChanged', lit: false, by: 'gm' }]);
    expect(out.state.lamp).toBe(false);
    expect(run(out.state, { type: 'table.setLamp', lit: true }).state.lamp).toBe(true);
  });

  it('gleicher Wert: kein Ereignis', () => {
    expect(run(fresh(), { type: 'table.setLamp', lit: true }).events).toEqual([]);
  });

  it('Spieler nur mit Recht (A38); dann nennt das Ereignis seinen Platz', () => {
    const s = fresh();
    expectRejected(s, { type: 'table.setLamp', lit: false }, 'reject.notAllowed', player('seat2'));
    const open = run(s, { type: 'table.setSettings', permissionOverrides: { player: { 'table.setLamp': 'allow' } } }).state;
    expect(run(open, { type: 'table.setLamp', lit: false }, player('seat2')).events).toEqual([{ type: 'lampChanged', lit: false, by: 'seat2' }]);
  });

  it('Zurücksetzen lässt die Laterne, wie sie ist', () => {
    const out = run(fresh(), { type: 'table.setLamp', lit: false }).state;
    expect(run(out, { type: 'table.reset', includeCharacters: true }).state.lamp).toBe(false);
  });
});
