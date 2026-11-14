// Zähler für das Kartenbudget (Schritt 6a): Einschalten, Zählen, harte Sperren, Rechte, Migration.

import { describe, expect, it } from 'vitest';
import { FORMAT } from '../../src/engine/setup';
import { expectRejected, fresh, place, player, run, engine, type K } from '../helpers';

/** Deck mit diesen Karten obenauf (letzte = oberste) */
const deckTop = (s: K, ...cards: string[]) => place(s, 'deck', cards);
const started = (s: K, left = 3, seat = 'seat1') => run(s, { type: 'budget.start', seat, left }).state;
const drawDeck = (s: K, actor = player('seat1')) => run(s, { type: 'zone.draw', zone: 'deck' }, actor);
const moveTop = (s: K, to: object, k = 1, actor = player('seat1')) =>
  run(s, { type: 'cards.move', cards: s.zones['deck']!.slice(-k), from: { zone: 'deck' }, to }, actor);

describe('Kartenbudget (6a)', () => {
  it('aus am Anfang, Vorschlag 3; Start übernimmt den Vorschlag, Ende merkt sich das Budget der Aktion', () => {
    const s = fresh();
    expect(s.game.budget).toMatchObject({ active: false, seat: null, last: 3 });
    const on = run(s, { type: 'budget.start', seat: 'seat2' }).state;
    expect(on.game.budget).toMatchObject({ active: true, seat: 'seat2', left: 3, drawn: 0 });
    // zwei gezogen, eins dazu (Kraftakt …): beim nächsten Mal 4
    let t = drawDeck(deckTop(on, 'H5', 'H6'), player('seat1')).state;
    t = drawDeck(t).state;
    t = run(t, { type: 'budget.set', left: 2 }).state;
    const off = run(t, { type: 'budget.stop' }).state;
    expect(off.game.budget).toMatchObject({ active: false, seat: null, last: 4 });
    expect(run(off, { type: 'budget.start', seat: 'seat1' }).state.game.budget.left).toBe(4);
  });

  it('zählt jede Karte vom Deck: Ziehen, Ziehen per Maus auf Ablage und freien Tisch, mehrere auf einmal', () => {
    let s = deckTop(started(fresh(), 5), 'H2', 'H3', 'H4', 'H5');
    s = drawDeck(s).state;
    expect(s.game.budget).toMatchObject({ left: 4, drawn: 1 });
    s = moveTop(s, { zone: 'discard' }).state;
    s = moveTop(s, { free: { anchor: 'center', x: 0.5, y: 0.5 } }).state;
    expect(s.game.budget.left).toBe(2);
    s = moveTop(s, { zone: 'discard' }, 2).state;
    expect(s.game.budget).toMatchObject({ left: 0, drawn: 5 });
  });

  it('zählt nicht: zurück aufs Deck, auf einen Bogen (Notiz, Schaden), aus den Notizen, anderer Stapel', () => {
    let s = deckTop(started(fresh(), 3), 'H2', 'H3', 'H4');
    s = moveTop(s, { zone: 'deck' }).state;
    s = moveTop(s, { zone: 'seat1.notes' }).state;
    s = moveTop(s, { zone: 'seat1.damage' }).state;
    s = run(s, { type: 'cards.move', cards: ['H4'], from: { zone: 'seat1.notes' }, to: { zone: 'discard' } }, player('seat1')).state;
    s = run(s, { type: 'zone.draw', zone: 'clubs' }, player('seat1')).state;
    expect(s.game.budget).toMatchObject({ left: 3, drawn: 0, club: false });
  });

  it('Budget aufgebraucht: Deck gesperrt, für alle; mehr Karten als übrig auf einmal auch', () => {
    let s = deckTop(started(fresh(), 1), 'H2', 'H3', 'H4');
    expectRejected(s, { type: 'cards.move', cards: ['H3', 'H4'], from: { zone: 'deck' }, to: { zone: 'discard' } }, 'reject.budget.tooMany', player('seat1'));
    s = drawDeck(s).state;
    expectRejected(s, { type: 'zone.draw', zone: 'deck' }, 'reject.budget.empty', player('seat1'));
    expectRejected(s, { type: 'zone.draw', zone: 'deck' }, 'reject.budget.empty', player('seat2'));
    expectRejected(s, { type: 'cards.move', cards: ['H3'], from: { zone: 'deck' }, to: { zone: 'discard' } }, 'reject.budget.empty');
    // eine Forschungsnotiz vom Deck nehmen geht weiter
    expect(moveTop(s, { zone: 'seat1.notes' }).state.zones['seat1.notes']).toEqual(['H3']);
    // erhöhen hebt die Sperre auf
    expect(drawDeck(run(s, { type: 'budget.set', left: 1 }).state).state.game.budget.drawn).toBe(2);
  });

  it('♣ vom Deck: gesperrt trotz Restbudget, weiter nur über die Notizen; mit Vorteil nicht, mit beidem doch', () => {
    let s = place(deckTop(started(fresh(), 5), 'H2', 'C4'), 'seat1.notes', ['SK', 'H9']);
    s = drawDeck(s).state;
    expect(s.game.budget).toMatchObject({ left: 4, club: true });
    expectRejected(s, { type: 'zone.draw', zone: 'deck' }, 'reject.budget.club', player('seat1'));
    s = run(s, { type: 'cards.move', cards: ['H9'], from: { zone: 'seat1.notes' }, to: { zone: 'discard' } }, player('seat1')).state;
    expectRejected(s, { type: 'zone.draw', zone: 'deck' }, 'reject.budget.club', player('seat1'));

    const adv = run(s, { type: 'budget.set', advantage: true }, player('seat1')).state;
    expect(drawDeck(adv).state.game.budget.left).toBe(3);
    const both = run(adv, { type: 'budget.set', disadvantage: true }, player('seat1')).state;
    expectRejected(both, { type: 'zone.draw', zone: 'deck' }, 'reject.budget.club', player('seat1'));
  });

  it('Nachteil: Notizen der handelnden Person gesperrt (Umsortieren nicht), fremde nicht; mit Vorteil zusammen offen', () => {
    let s = place(place(started(fresh(), 3), 'seat1.notes', ['H9', 'H8']), 'seat2.notes', ['S9']);
    s = run(s, { type: 'budget.set', disadvantage: true }).state;
    expectRejected(s, { type: 'cards.move', cards: ['H9'], from: { zone: 'seat1.notes' }, to: { zone: 'discard' } }, 'reject.budget.notes', player('seat1'));
    run(s, { type: 'cards.move', cards: ['H9'], from: { zone: 'seat1.notes' }, to: { zone: 'seat1.notes' } }, player('seat1'));
    run(s, { type: 'cards.move', cards: ['S9'], from: { zone: 'seat2.notes' }, to: { zone: 'discard' } }, player('seat2'));
    s = run(s, { type: 'budget.set', advantage: true }).state;
    run(s, { type: 'cards.move', cards: ['H9'], from: { zone: 'seat1.notes' }, to: { zone: 'discard' } }, player('seat1'));
  });

  it('aus: weder Zählen noch Sperren; Automatik aus: Zähler zeigt nur an', () => {
    const s = deckTop(fresh(), 'C2', 'C3');
    expect(drawDeck(drawDeck(s).state).state.game.budget.drawn).toBe(0);
    let t = run(deckTop(started(fresh(), 1), 'C2', 'C3'), { type: 'table.setSettings', automation: { budget: false } }).state;
    t = drawDeck(drawDeck(t).state).state;
    expect(t.game.budget).toMatchObject({ left: 1, drawn: 0 });
  });

  it('Rechte: Spieler schalten nur für sich ein; ändern und ausschalten nur handelnde Person und SL; SL wählt die Person', () => {
    const s = fresh();
    expectRejected(s, { type: 'budget.start', seat: 'seat2' }, 'reject.notAllowed', player('seat1'));
    const on = run(s, { type: 'budget.start', seat: 'seat1' }, player('seat1')).state;
    expectRejected(on, { type: 'budget.start', seat: 'seat1' }, 'reject.budget.active', player('seat1'));
    expectRejected(on, { type: 'budget.set', left: 5 }, 'reject.notAllowed', player('seat2'));
    expectRejected(on, { type: 'budget.stop' }, 'reject.notAllowed', player('seat2'));
    expectRejected(on, { type: 'budget.set', seat: 'seat2' }, 'reject.notAllowed', player('seat1'));
    run(on, { type: 'budget.set', left: 5 }, player('seat1'));
    const moved = run(on, { type: 'budget.set', seat: 'seat3' }).state;
    expect(moved.game.budget.seat).toBe('seat3');
    run(moved, { type: 'budget.stop' }, player('seat3'));
    expectRejected(fresh(), { type: 'budget.start', seat: 'seat1' }, 'reject.notAllowed', { role: 'spectator' });
  });

  it('ausgeblendeter Platz nicht wählbar; Ändern ohne Zähler abgelehnt, ohne Änderung kein Ereignis', () => {
    const two = run(fresh(), { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'budget.start', seat: 'seat3' }, 'reject.hiddenSeat');
    expectRejected(fresh(), { type: 'budget.set', left: 2 }, 'reject.budget.inactive');
    expect(run(started(fresh(), 3), { type: 'budget.set', left: 3 }).events).toEqual([]);
    expect(run(fresh(), { type: 'budget.stop' }).events).toEqual([]);
  });

  it('Tisch zurücksetzen beendet die Aktion', () => {
    const s = run(started(fresh(), 3), { type: 'table.reset', includeCharacters: false }).state;
    expect(s.game.budget.active).toBe(false);
  });

  it('Format 5 → 6: alte Stände bekommen einen ausgeschalteten Zähler', () => {
    const { budget: _, ...game } = fresh().game;
    const s = engine.parseState({ ...fresh(), format: 5, game });
    expect(s.format).toBe(FORMAT);
    expect(s.game.budget).toEqual(fresh().game.budget);
  });
});
