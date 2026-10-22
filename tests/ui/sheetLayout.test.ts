// Bögen in allen Ansichten (5q, Teil 1): Invarianten und Zeiger, damit sich Lage und Maßstab der Bögen ändern dürfen,
// ohne dass der Zeiger bei den anderen an der falschen Stelle steht (ARCHITEKTUR.md 10.3). Alle Prüfpunkte kommen
// aus dem jeweiligen Layout, keine festen Koordinaten.

import { describe, expect, it } from 'vitest';
import { SEATS, type SeatId } from '../../src/engine/types';
import { seatVisibleFor } from '../../src/engine/zones';
import { cardSize, computeLayout, freePosAt, placeCards, pointerAt, pointerPosAt, type Layout, type Rect } from '../../src/ui/layout';
import { content, fresh, lay } from '../helpers';

/** sichtbarer Lederrand um den Filz (`box-shadow` 6 + 1 an `.panel` in Board.svelte) */
const RIM = 7;
const PLAYERS = [1, 2, 3, 4] as const;

const seatsFor = (players: number) => SEATS.filter((s) => seatVisibleFor(s, players));
/** Draufsicht und Rollenansicht jedes sichtbaren Platzes */
const viewsFor = (players: number): { name: string; L: Layout }[] => [
  { name: 'Draufsicht', L: computeLayout(content, players, null, null) },
  ...seatsFor(players).map((s) => ({ name: `Rolle ${s}`, L: computeLayout(content, players, s, null) })),
];
const pairsFor = (players: number) => viewsFor(players).flatMap((from) => viewsFor(players).map((to) => ({ from, to })));

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
const rel = (r: Rect, p: { x: number; y: number }) => ({ x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h });
const at = (r: Rect, f: { x: number; y: number }) => ({ x: r.x + f.x * r.w, y: r.y + f.y * r.h });
/** Anteile werden auf 4 Stellen gerundet übertragen, also auf etwa 0,1 TP genau */
const near = (got: { x: number; y: number } | null, want: { x: number; y: number }, what: string) => {
  expect(got, what).not.toBeNull();
  expect(Math.abs(got!.x - want.x), `${what}: x ${got!.x} statt ${want.x}`).toBeLessThan(0.1);
  expect(Math.abs(got!.y - want.y), `${what}: y ${got!.y} statt ${want.y}`).toBeLessThan(0.1);
};

describe('Bögen in allen Ansichten (5q): Invarianten', () => {
  it('Tischmitte in jeder Ansicht und bei jeder Spielerzahl gleich groß', () => {
    const { w, h } = computeLayout(content, 4, null, null).middle;
    for (const n of PLAYERS) for (const { name, L } of viewsFor(n)) expect(L.middle, `${n} Spieler, ${name}`).toMatchObject({ w, h });
  });

  it('jeder sichtbare Bogen im Seitenverhältnis 380 : 537, ausgeblendete Bögen unsichtbar', () => {
    for (const n of PLAYERS) {
      for (const { name, L } of viewsFor(n)) {
        for (const s of SEATS) {
          const b = L.sheets[s];
          expect(b.visible, `${n} Spieler, ${name}, ${s}`).toBe(seatVisibleFor(s, n));
          if (!b.visible) continue;
          expect(b.w, `${name}, ${s}`).toBeCloseTo(380 * b.scale, 6);
          expect(b.h, `${name}, ${s}`).toBeCloseTo(537 * b.scale, 6);
        }
      }
    }
  });

  it('Bogenzonen liegen in jeder Ansicht an derselben Stelle des Bogens (Anteil)', () => {
    for (const n of PLAYERS) {
      const views = viewsFor(n);
      const ref = views[0]!.L;
      for (const { name, L } of views) {
        for (const z of L.zoneList.filter((z) => z.owner)) {
          const want = ref.zones[z.id]!;
          const s = L.sheets[z.owner!];
          const r = ref.sheets[z.owner!];
          const what = `${n} Spieler, ${name}, ${z.id}`;
          expect(rel(s, z).x, what).toBeCloseTo(rel(r, want).x, 6);
          expect(rel(s, z).y, what).toBeCloseTo(rel(r, want).y, 6);
          expect(z.w / s.w, what).toBeCloseTo(want.w / r.w, 6);
          expect(z.h / s.h, what).toBeCloseTo(want.h / r.h, 6);
          expect(z.scale / s.scale, what).toBeCloseTo(want.scale / r.scale, 6);
        }
      }
    }
  });

  it('kein Bogen überlappt Filz samt Rand, einen anderen Bogen oder die Tischkante', () => {
    for (const n of PLAYERS) {
      for (const { name, L } of viewsFor(n)) {
        const shown = seatsFor(n).map((s) => L.sheets[s]);
        const felt = grow(L.middle, RIM);
        for (const b of shown) {
          const what = `${n} Spieler, ${name}, ${b.seat}`;
          expect(overlap(b, felt), `${what} über dem Filz`).toBe(false);
          expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= L.board.w && b.y + b.h <= L.board.h, `${what} über der Kante`).toBe(true);
          for (const o of shown) if (o !== b) expect(overlap(b, o), `${what} über ${o.seat}`).toBe(false);
        }
      }
    }
  });
});

describe('Bögen in allen Ansichten (5q): Zeiger für jedes Paar von Ansichten', () => {
  const s0 = fresh();

  it('auf jedem sichtbaren Bogen: beim Empfänger an derselben Stelle seines Bogens', () => {
    for (const n of PLAYERS) {
      for (const { from, to } of pairsFor(n)) {
        for (const s of seatsFor(n)) {
          for (const f of [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.95 }]) {
            const what = `${n} Spieler, ${from.name} → ${to.name}, ${s} bei ${f.x}/${f.y}`;
            const p = at(from.L.sheets[s], f);
            const pos = pointerPosAt(from.L, placeCards(s0, from.L), s0.free, p.x, p.y, []);
            expect(pos, what).toMatchObject({ anchor: s });
            near(pointerAt(to.L, placeCards(s0, to.L), pos), at(to.L.sheets[s], f), what);
          }
        }
      }
    }
  });

  it('auf einer Bogenzone: beim Empfänger an derselben Stelle dieser Zone', () => {
    for (const n of PLAYERS) {
      for (const { from, to } of pairsFor(n)) {
        for (const s of seatsFor(n)) {
          for (const t of ['damage', 'notes', 'collect']) {
            const id = `${s}.${t}`;
            const what = `${n} Spieler, ${from.name} → ${to.name}, ${id}`;
            const f = { x: 0.3, y: 0.7 };
            const p = at(from.L.zones[id]!, f);
            const pos = pointerPosAt(from.L, placeCards(s0, from.L), s0.free, p.x, p.y, []);
            near(pointerAt(to.L, placeCards(s0, to.L), pos), at(to.L.zones[id]!, f), what);
          }
        }
      }
    }
  });

  it('auf dem Deck: Anker ist das Deck, beim Empfänger an derselben Stelle des Decks', () => {
    for (const n of PLAYERS) {
      for (const { from, to } of pairsFor(n)) {
        const f = { x: 0.25, y: 0.75 };
        const p = at(from.L.zones['deck']!, f);
        const pos = pointerPosAt(from.L, placeCards(s0, from.L), s0.free, p.x, p.y, []);
        expect(pos).toEqual({ zone: 'deck', ...f });
        near(pointerAt(to.L, placeCards(s0, to.L), pos), at(to.L.zones['deck']!, f), `${n} Spieler, ${from.name} → ${to.name}`);
      }
    }
  });

  it('auf dem Filz und seinem Rand: nie an einem Bogen, beim Empfänger an derselben Stelle der Tischmitte', () => {
    for (const n of PLAYERS) {
      for (const { from, to } of pairsFor(n)) {
        const m = from.L.middle;
        // am Rand des Filzes innen und auf dem Lederrand (dieser wird an den Rand der Tischmitte geholt), dazu die Mitte unten
        const pts = [0.05, 0.5, 0.95].flatMap((fy) => [m.x + 2, m.x - RIM + 1, m.x + m.w - 2, m.x + m.w + RIM - 1].map((x) => ({ x, y: m.y + fy * m.h })));
        pts.push({ x: m.x + m.w / 2, y: m.y + m.h - 10 });
        for (const p of pts) {
          const what = `${n} Spieler, ${from.name} → ${to.name}, (${p.x}, ${p.y})`;
          const pos = pointerPosAt(from.L, placeCards(s0, from.L), s0.free, p.x, p.y, []);
          expect('anchor' in pos && pos.anchor !== 'center', `${what} an einem Bogen`).toBe(false);
          const inside = { x: Math.min(Math.max(p.x, m.x), m.x + m.w), y: p.y };
          near(pointerAt(to.L, placeCards(s0, to.L), pos), at(to.L.middle, rel(m, inside)), what);
        }
      }
    }
  });
});

describe('Bögen in allen Ansichten (5q): frei liegende Karten auf Bögen', () => {
  // seat2 ist in seiner Rollenansicht der große eigene Bogen, seat1 dort ein kleiner Bogen
  const CARDS: { seat: SeatId; f: { x: number; y: number } }[] = [
    { seat: 'seat1', f: { x: 0.4, y: 0.3 } },
    { seat: 'seat2', f: { x: 0.6, y: 0.7 } },
  ];

  it('auf dem Bogen abgelegt: Anker ist der Bogen, beim Empfänger an derselben Stelle seines Bogens', () => {
    for (const n of PLAYERS) {
      for (const { from, to } of pairsFor(n)) {
        for (const { seat, f } of CARDS.filter((c) => seatVisibleFor(c.seat, n))) {
          const what = `${n} Spieler, ${from.name} → ${to.name}, ${seat}`;
          const p = at(from.L.sheets[seat], f);
          const pos = freePosAt(from.L, p.x, p.y);
          expect(pos, what).toMatchObject({ anchor: seat });
          const card = placeCards(lay(fresh(), 'S5', pos), to.L).S5;
          near(card ?? null, at(to.L.sheets[seat], f), what);
        }
      }
    }
  });

  it('Zeiger auf dem Teil der Karte, der über den Bogen hinausragt: Anker ist die Karte, beim Empfänger an derselben Stelle der Karte', () => {
    for (const n of PLAYERS) {
      for (const { from, to } of pairsFor(n)) {
        for (const { seat } of CARDS.filter((c) => seatVisibleFor(c.seat, n))) {
          const what = `${n} Spieler, ${from.name} → ${to.name}, ${seat}`;
          // knapp links vom rechten Rand abgelegt: die gedrehte Karte ragt rechts über den Bogen hinaus
          const b = from.L.sheets[seat];
          const pos = freePosAt(from.L, b.x + b.w - 10, b.y + b.h / 2);
          expect(pos, what).toMatchObject({ anchor: seat });
          const s = lay(fresh(), 'S5', pos);
          const c = cardSize(from.L, { scale: from.L.freeCardScale, rotated: true });
          const p = { x: b.x + b.w + 5, y: b.y + b.h / 2 + c.h / 2 };
          const ptr = pointerPosAt(from.L, placeCards(s, from.L), s.free, p.x, p.y, []);
          expect(ptr, what).toMatchObject({ card: 'S5' });
          // beim Empfänger: Karte aus dessen Bogen berechnet, Zeiger an derselben Stelle der Karte
          const card = { ...at(to.L.sheets[seat], { x: pos.x, y: pos.y }), ...cardSize(to.L, { scale: to.L.freeCardScale, rotated: true }) };
          near(pointerAt(to.L, placeCards(s, to.L), ptr), at(card, rel({ x: b.x + pos.x * b.w, y: b.y + pos.y * b.h, ...c }, p)), what);
        }
      }
    }
  });
});
