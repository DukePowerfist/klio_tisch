// Vorschau der Ablegestelle (11.6, Schritt 5h): Ziel wie beim Loslassen, Lage aus dem Probelauf durch die Engine.

import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import type { Actor, CardId, CardSource, CardTarget } from '../../src/engine/types';
import { dropHints, dropTarget, inHand } from '../../src/ui/dropHint';
import { cardSize, computeLayout, lampGap, placeCards, pointerAt, pointerPosAt, zoneAt, type Rect } from '../../src/ui/layout';
import { content, engine, fresh, GM, lay, place, player, run, type K } from '../helpers';

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
/** freie Stelle auf dem Filz neben der Ablage, weit weg von Laterne, Blatt und Schachtel */
const freeSpot = (): [number, number] => {
  const [x, y] = center('discard');
  return ([[x + 120, y], [x, y + 120], [x - 120, y], [x, y - 120]] as [number, number][]).find(([a, b]) => !zoneAt(L, a, b))!;
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** wie das Brett: Ziel bestimmen, Probelauf, Umrisse */
function hints(s: K, cards: string[], from: CardSource, to: CardTarget | null, actor: Actor = GM) {
  if (!to) return [];
  const r = engine.dispatch(s, { type: 'cards.move', cards, from, to }, actor, seededRng(0));
  return dropHints(L, placeCards(s, L), 'state' in r ? r.state : null, cards as CardId[]);
}

describe('Ziel beim Loslassen (11.10, F1)', () => {
  it('nur nach dem Zeiger: Zone darunter, sonst freier Tisch', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const places = placeCards(s, L);
    const [dx, dy] = center('discard');
    const [fx, fy] = freeSpot();
    // Zeiger über der Ablage: Ablage, wo die Karte auch gerade ist
    expect(dropTarget(L, places, { cards: [top], ...over(s, top, fx, fy) }, [dx, dy])).toEqual({ zone: 'discard' });
    // Kartenmitte über der Ablage, Zeiger daneben: freier Tisch (bis 5za zählte die Kartenmitte)
    expect(dropTarget(L, places, { cards: [top], ...over(s, top, dx, dy) }, [fx, fy])).toMatchObject({ free: { anchor: 'center' } });
  });

  it('freier Filz: an der linken oberen Ecke der Karte, wie sie in der Hand gezeigt wird', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const places = placeCards(s, L);
    const [fx, fy] = freeSpot();
    const d = { cards: [top], ...over(s, top, fx, fy) };
    const shown = inHand(L, places[top]!, d, [fx, fy]);
    const to = dropTarget(L, places, d, [fx, fy]) as { free: { x: number; y: number } };
    expect(L.middle.x + to.free.x * L.middle.w).toBeCloseTo(shown.x, 0);
    expect(L.middle.y + to.free.y * L.middle.h).toBeCloseTo(shown.y, 0);
    // die Ecke der kleinen Karte, nicht die der großen
    expect(shown.x).toBeGreaterThan(places[top]!.x + d.dx + 1);
  });

  it('auf Laterne, Blatt oder Schachtel: daneben verschoben, der Umriss zeigt die Stelle (5zb)', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const places = placeCards(s, L);
    const { lamp, middle: m } = L;
    const paper = L.obstacles[0]!;
    const spots: [number, number][] = [[lamp.cx, lamp.cy], [paper.x + paper.w / 2, m.y + m.h - 30], [L.obstacles[1]!.x + 30, m.y + m.h - 30]];
    const on = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    expect(on(paper, ...spots[1]!) && on(L.obstacles[1]!, ...spots[2]!)).toBe(true);
    for (const [x, y] of spots) {
      expect(zoneAt(L, x, y)).toBeNull();
      const d = { cards: [top], ...over(s, top, x, y) };
      const [h] = hints(s, [top], { zone: 'deck' }, dropTarget(L, places, d, [x, y]));
      expect(h).toBeDefined();
      // Abstand 4, bis auf die Rundung der gespeicherten Lage (4 Stellen)
      expect(lampGap(lamp, h!)).toBeGreaterThan(3.9);
      for (const o of L.obstacles) expect(overlaps(h!, o), `${x}, ${y}`).toBe(false);
    }
  });
});

describe('Karte in der Hand (11.10)', () => {
  /** Anteil der Stelle (x, y) an einer Karte, gezeigt an (at.x, at.y) mit Maßstab und Drehung */
  const frac = (at: { x: number; y: number; scale: number; rotated: boolean }, x: number, y: number) => {
    const size = cardSize(L, at);
    return [(x - at.x) / size.w, (y - at.y) / size.h];
  };

  it('Deck (Maßstab 1): auf 0,6 kleiner, hochkant, die Stelle unter dem Zeiger bleibt unter ihm', () => {
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const p = placeCards(s, L)[top]!;
    const delta = { dx: 37, dy: -52 };
    const old = { ...p, x: p.x + delta.dx, y: p.y + delta.dy };
    const ptr: [number, number] = [old.x + 0.3 * 80, old.y + 0.7 * 112];
    const h = inHand(L, p, delta, ptr);
    expect(h).toMatchObject({ scale: L.freeCardScale, rotated: false });
    expect(cardSize(L, h).w).toBeCloseTo(48, 5);
    const [u, v] = frac(h, ...ptr);
    expect(u).toBeCloseTo(0.3, 5);
    expect(v).toBeCloseTo(0.7, 5);
  });

  it('frei liegende Karte: bleibt gleich groß und quer, nur verschoben', () => {
    const s = lay(fresh(), 'H7', { anchor: 'center', x: 0.3, y: 0.3 });
    const p = placeCards(s, L).H7!;
    const h = inHand(L, p, { dx: 10, dy: 20 }, [p.x + 30, p.y + 20]);
    expect(h).toEqual({ x: p.x + 10, y: p.y + 20, scale: L.freeCardScale, rotated: true });
  });

  it('Sammeln am Bogen wird größer, geöffnetes Karo kleiner, beide auf die Handgröße', () => {
    const s = place(fresh(), 'seat1.collect', ['H2'], true);
    const p = placeCards(s, L).H2!;
    expect(p.scale).toBeLessThan(L.freeCardScale);
    expect(inHand(L, p, { dx: 0, dy: 0 }, [p.x, p.y]).scale).toBe(L.freeCardScale);
    const open = computeLayout(content, 4, null, 'diamonds_easy');
    const k = placeCards(place(fresh(), 'diamonds_easy', ['D2']), open).D2!;
    expect(k.scale).toBe(1);
    expect(inHand(open, k, { dx: 0, dy: 0 }, [k.x, k.y]).scale).toBe(open.freeCardScale);
  });

  it('mehrere Karten (Umschalt): Abstände zueinander mal k', () => {
    const s = place(fresh(), 'danger', ['H2', 'H3', 'H4'], true);
    const places = placeCards(s, L);
    const delta = { dx: -20, dy: 15 };
    const ptr: [number, number] = [places.H2!.x + 40, places.H2!.y + 50];
    const [a, b] = (['H2', 'H4'] as CardId[]).map((c) => inHand(L, places[c]!, delta, ptr));
    const k = L.freeCardScale / places.H2!.scale;
    expect(b!.x - a!.x).toBeCloseTo((places.H4!.x - places.H2!.x) * k, 5);
    expect(b!.y - a!.y).toBeCloseTo((places.H4!.y - places.H2!.y) * k, 5);
  });

  it('fremder Zug: die andere Ansicht zeigt die Karte ebenso klein um den fremden Zeiger (Rollenansicht → Draufsicht)', () => {
    const role = computeLayout(content, 4, 'seat2', null);
    const s = fresh();
    const top = s.zones['deck']!.at(-1)!;
    const [rp, op] = [placeCards(s, role), placeCards(s, L)];
    // Spieler in der Rollenansicht greift die Deckkarte bei 30 % / 70 % und zieht sie 150 nach links
    const grab: [number, number] = [rp[top]!.x + 24, rp[top]!.y + 78.4];
    const now: [number, number] = [grab[0] - 150, grab[1]];
    const start = pointerPosAt(role, rp, s.free, ...grab);
    const last = pointerPosAt(role, rp, s.free, ...now, [top]);
    const mine = frac(inHand(role, rp[top]!, { dx: -150, dy: 0 }, now), ...now);
    // bei der SL in der Draufsicht: Versatz b − a, Anker b (Board.svelte, remoteOf)
    const a = pointerAt(L, op, start)!;
    const b = pointerAt(L, op, last)!;
    const theirs = inHand(L, op[top]!, { dx: b.x - a.x, dy: b.y - a.y }, [b.x, b.y]);
    expect(theirs.scale).toBe(L.freeCardScale);
    const f = frac(theirs, b.x, b.y);
    expect(f[0]).toBeCloseTo(mine[0]!, 2);
    expect(f[1]).toBeCloseTo(mine[1]!, 2);
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

describe('Haufen vom freien Tisch (11.11)', () => {
  const pile = () => ['H2', 'H3', 'H4'].reduce((t, c, i) => lay(t, c, { anchor: 'center', x: 0.3 + i * 0.02, y: 0.3 }), fresh());

  it('in die Ablage: alle, in der Reihenfolge von free', () => {
    const s = pile();
    const hs = hints(s, ['H2', 'H3', 'H4'], { free: true }, { zone: 'discard' });
    expect(hs.map((h) => h.card)).toEqual(['H2', 'H3', 'H4']);
    const after = run(s, { type: 'cards.move', cards: ['H2', 'H3', 'H4'], from: { free: true }, to: { zone: 'discard' } }).state;
    expect(after.zones['discard']!.slice(-3)).toEqual(['H2', 'H3', 'H4']);
  });

  it('auf den freien Tisch: deckungsgleich an der Ecke der angefassten Karte, auch wenn sie nicht die unterste ist', () => {
    const s = pile();
    const places = placeCards(s, L);
    const [fx, fy] = freeSpot();
    const d = { card: 'H3' as CardId, cards: ['H2', 'H3', 'H4'] as CardId[], ...over(s, 'H3', fx, fy) };
    const shown = inHand(L, places.H3!, d, [fx, fy]);
    const hs = hints(s, d.cards, { free: true }, dropTarget(L, places, d, [fx, fy]));
    expect(hs).toHaveLength(3);
    for (const h of hs) {
      expect(h.x).toBeCloseTo(shown.x, 0);
      expect(h.y).toBeCloseTo(shown.y, 0);
    }
    // mit der untersten als Anker läge der Haufen woanders
    const byFirst = dropTarget(L, places, { cards: d.cards, dx: d.dx, dy: d.dy }, [fx, fy]) as { free: { x: number } };
    expect(L.middle.x + byFirst.free.x * L.middle.w).not.toBeCloseTo(shown.x, 0);
  });

  it('auf einem fremden Bogen bei „nur eigener Bogen“: abgelehnt, kein Umriss', () => {
    let s = fresh();
    for (const c of ['H2', 'H3']) s = lay(s, c, { anchor: 'seat2', x: 0.5, y: 0.5 });
    for (const c of ['H4', 'H5']) s = lay(s, c, { anchor: 'seat1', x: 0.5, y: 0.5 });
    s = run(s, { type: 'table.setSettings', permissionOverrides: { player: { 'cards.move': 'own' } } }).state;
    expect(hints(s, ['H2', 'H3'], { free: true }, { zone: 'discard' }, player('seat1'))).toEqual([]);
    expect(hints(s, ['H4', 'H5'], { free: true }, { zone: 'discard' }, player('seat1'))).toHaveLength(2);
  });
});
