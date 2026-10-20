import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/dispatch';
import { cryptoRng, seededRng, shuffled } from '../../src/engine/rng';
import { initialTable } from '../../src/engine/setup';
import type { Ruleset } from '../../src/engine/types';
import { GM, engine, expectRejected, fresh, place, player, run, type K } from '../helpers';

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

  it('Kreuz: Doppelklick auf verdeckte Karte zieht sie offen auf die Ablage', () => {
    const top = base.zones['clubs']!.at(-1)!;
    const { state, events } = run(base, { type: 'card.flip', card: top });
    expect(state.zones['discard']).toEqual([top]);
    expect(state.faceUp[top as never]).toBe(true);
    expect(events[0]).toMatchObject({ type: 'cardDrawn', announce: true });
  });

  it('Deck ziehen → offen auf die Ablage; Karo ziehen → offen in die Auslage', () => {
    const d = run(base, { type: 'zone.draw', zone: 'deck' }).state;
    expect(d.zones['discard']).toHaveLength(1);
    const k = run(base, { type: 'zone.draw', zone: 'diamonds_hard' }).state;
    expect(k.zones['display']).toHaveLength(1);
    expect(k.faceUp[k.zones['display']![0] as never]).toBe(true);
  });

  it('„Umdrehen“: Deck und Karo drehen die oberste Karte, Kreuz zieht', () => {
    const top = base.zones['deck']!.at(-1)!;
    expect(run(base, { type: 'zone.flip', zone: 'deck' }).state.faceUp[top as never]).toBe(true);
    expect(run(base, { type: 'zone.flip', zone: 'clubs' }).state.zones['discard']).toHaveLength(1);
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
    const ev = events[0] as unknown as { shuffled: string[] };
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
      id: 'loop', version: '1', initialGame: () => null,
      deck: { cards: [], start: {} }, zones: [{ id: 'a', actions: { draw: { to: 'a', faceUp: true, announce: false } } }],
      commands: {}, events: { ping: { parse: (x) => x as { type: 'ping' }, apply: (s) => s } }, migrations: [],
      reactions: [{ id: 'echo', react: () => [{ type: 'ping' }] }],
      permissions: { gm: 'all', player: {}, spectator: 'none' },
    };
    const e = createEngine(loop);
    const s = initialTable(loop, seededRng(1));
    s.zones['a'] = ['H2'];
    const r = e.dispatch(s, { type: 'zone.draw', zone: 'a' }, GM, seededRng(1));
    expect('rejected' in r && r.reason.key).toBe('reject.reactionLoop');
  });

  it('Spieler eines ausgeblendeten Platzes sind Zuschauer', () => {
    const two = run(fresh(), { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'zone.draw', zone: 'deck' }, 'reject.notAllowed', player('seat3'));
    run(two, { type: 'zone.draw', zone: 'deck' }, player('seat2'));
  });
});
