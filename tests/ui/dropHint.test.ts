// Vorschau der Ablegestelle (11.6, Schritt 5h): Ziel wie beim Loslassen, Lage aus dem Probelauf durch die Engine.

import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import type { Actor, CardId, CardSource, CardTarget } from '../../src/engine/types';
import { dropHints, dropTarget } from '../../src/ui/dropHint';
import { cardSize, computeLayout, placeCards, zoneAt } from '../../src/ui/layout';
import { content, engine, fresh, GM, place, player, run, type K } from '../helpers';

const L = computeLayout(content, 4, null, null);
const center = (id: string) => {
  const z = L.zones[id]!;
  return [z.x + z.w / 2, z.y + z.h / 2] as const;
};
/** Versatz, mit dem die erste Karte mit ihrer Mitte über (x, y) liegt */
function over(s: K, card: string, x: number, y: number) {
  const p = placeCards(s, L)[card as CardId]!;
  const size = cardSize(L, p);
  return { dx: x - (p.x + size.w / 2), dy: y - (p.y + size.h / 2) };
}
/** wie das Brett: Ziel bestimmen, Probelauf, Umrisse */
function hints(s: K, cards: string[], from: CardSource, to: CardTarget | null, actor: Actor = GM) {
  if (!to) return [];
  const r = engine.dispatch(s, { type: 'cards.move', cards, from, to }, actor, seededRng(0));
  return dropHints(L, placeCards(s, L), 'state' in r ? r.state : null, cards as CardId[]);
}

describe('Ziel beim Loslassen', () => {
  it('Zone unter der Kartenmitte, sonst unter dem Zeiger, sonst freier Tisch an der Lage der Karte', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const places = placeCards(s, L);
    const [dx, dy] = center('discard');
    const d = { cards: [top], ...over(s, top, dx, dy) };
    expect(dropTarget(L, places, d, [0, 0])).toEqual({ zone: 'discard' });
    // eine freie Stelle neben der Ablage (keine Zone)
    const [fx, fy] = [[dx + 120, dy], [dx, dy + 120], [dx - 120, dy], [dx, dy - 120]].find(([x, y]) => !zoneAt(L, x!, y!))!;
    // Kartenmitte über dem freien Tisch, Zeiger über der Ablage: Ablage
    const off = { cards: [top], ...over(s, top, fx!, fy!) };
    expect(dropTarget(L, places, off, [dx, dy])).toEqual({ zone: 'discard' });
    expect(dropTarget(L, places, off, [fx!, fy!])).toMatchObject({ free: { anchor: 'center' } });
  });
});

describe('Umrisse aus dem Probelauf', () => {
  it('Stapel: oben auf, genau dort, wo die Karte danach liegt', () => {
    const s = place(fresh(), 'discard', ['H5', 'H6'], true);
    const top = s.zones['deck']!.at(-1)!;
    const [h] = hints(s, [top], { zone: 'deck' }, { zone: 'discard' });
    const after = placeCards(run(s, { type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'discard' } }).state, L)[top]!;
    expect(h).toMatchObject({ card: top, x: after.x, y: after.y });
  });

  it('aufgefächert: hinter der letzten Karte; eine mittlere Karte in ihre eigene Zone landet am Ende', () => {
    const s = place(fresh(), 'danger', ['H2', 'H3', 'H4'], true);
    const p = placeCards(s, L);
    expect(hints(s, ['H5'], { zone: 'deck' }, { zone: 'danger' })).toEqual([]); // H5 liegt nicht oben im Deck: abgelehnt
    const top = s.zones['deck']!.at(-1)!;
    expect(hints(s, [top], { zone: 'deck' }, { zone: 'danger' })[0]!.x).toBeCloseTo(p.H4!.x + L.zones['danger']!.fanX);
    expect(hints(s, ['H3'], { zone: 'danger' }, { zone: 'danger' })[0]!.x).toBeCloseTo(p.H4!.x);
    // die letzte Karte fiele an ihren Platz zurück: kein Umriss
    expect(hints(s, ['H4'], { zone: 'danger' }, { zone: 'danger' })).toEqual([]);
  });

  it('Stapel: oberste Karte zurück auf ihren Stapel zeigt keinen Umriss', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    expect(hints(s, [top], { zone: 'deck' }, { zone: 'deck' })).toEqual([]);
  });

  it('freier Tisch: gedreht und verkleinert wie frei liegende Karten', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const [h] = hints(s, [top], { zone: 'deck' }, { free: { anchor: 'center', x: 0.1, y: 0.1 } });
    expect(h!.scale).toBe(L.freeCardScale);
    expect(h!.w).toBeGreaterThan(h!.h);
  });

  it('kein Umriss, wenn der Host ablehnen würde: volle Notizen, fremder Bogen bei „nur eigener Bogen“', () => {
    let s = place(fresh(), 'seat1.notes', ['H2', 'H3', 'H4'], true);
    const top = s.zones['deck']!.at(-1)!;
    expect(hints(s, [top], { zone: 'deck' }, { zone: 'seat1.notes' })).toEqual([]);
    s = run(s, { type: 'table.setSettings', permissionOverrides: { player: { 'cards.move': 'own' } } }).state;
    expect(hints(s, [top], { zone: 'deck' }, { zone: 'seat2.damage' }, player('seat1'))).toEqual([]);
    expect(hints(s, [top], { zone: 'deck' }, { zone: 'seat1.damage' }, player('seat1'))).toHaveLength(1);
  });

  it('mehrere Karten (Umschalt): ein Umriss je Karte', () => {
    const s = fresh();
    const cards = s.zones['deck']!.slice(-2);
    expect(hints(s, cards, { zone: 'deck' }, { zone: 'danger' })).toHaveLength(2);
  });
});
