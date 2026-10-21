// Geometrie wie in der alten Datei: Bögen, Zonen und Spielbereich je Ansicht (Werte aus layouts.yaml und Haut).

import { describe, expect, it } from 'vitest';
import { cardSize, computeLayout, freePosAt, lampGap, placeCards, pointerAt, pointerPosAt, stackEdges, zoneAt, type CardPlace, type Rect } from '../../src/ui/layout';
import { content, fresh, lay, place } from '../helpers';

describe('Ansichten', () => {
  it('Draufsicht mit 4 Spielern: Bögen 0,9-fach links und rechts, Tischmitte mittig dazwischen', () => {
    const L = computeLayout(content, 4, null, null);
    const hh = 537 * 0.9;
    expect(L.sheets.seat1).toMatchObject({ x: 14, y: (990 - (2 * hh + 14)) / 2, scale: 0.9, visible: true });
    expect(L.sheets.seat2.x).toBeCloseTo(1760 - 14 - 380 * 0.9);
    expect(L.sheets.seat3.y).toBeCloseTo(L.sheets.seat1.y + hh + 14);
    expect(L.middle).toEqual({ x: 530, y: 10, w: 700, h: 970 });
    expect(L.middle.x + L.middle.w / 2).toBe(1760 / 2);
    // gegenüber der alten Datei um 48 nach links (5d)
    expect(L.zones['deck']).toMatchObject({ x: 760 - 48, y: 440, w: 80, h: 112, scale: 1 });
    expect(L.menu).toEqual({ x: 1102, y: 120 });
    expect(L.gmControls).toEqual({ x: 1230 - 40, y: 980 - 26 });
  });

  it('Draufsicht mit 2 Spielern: Bögen 1,2-fach; Plätze 3 und 4 ausgeblendet', () => {
    const L = computeLayout(content, 2, null, null);
    expect(L.sheets.seat1.scale).toBe(1.2);
    expect(L.sheets.seat3.visible).toBe(false);
    expect(L.zones['seat3.damage']).toBeUndefined();
    expect(L.middle).toEqual({ x: 530, y: 10, w: 700, h: 970 });
    expect(L.middle.x - (L.sheets.seat1.x + L.sheets.seat1.w)).toBeCloseTo(60);
  });

  it('Rollenansicht: eigener Bogen groß links, Tischmitte daneben, andere rechts untereinander', () => {
    const L = computeLayout(content, 4, 'seat2', null);
    expect(L.role).toBe('seat2');
    expect(L.sheets.seat2).toMatchObject({ x: 14, y: 10, scale: 970 / 537 });
    expect(L.middle).toEqual({ x: 710, y: 10, w: 700, h: 970 });
    // 4 Spieler: drei Bögen passen in die Höhe der Spalte (oben 60 Reserve für den Menüknopf)
    const m = (990 - 70 - 10 - 2 * 8) / (3 * 537);
    expect(m).toBeCloseTo(0.555, 3);
    expect(L.sheets.seat1).toMatchObject({ y: 70, opacity: 0.88 });
    expect(L.sheets.seat1.scale).toBeCloseTo(m);
    expect(L.sheets.seat1.x + L.sheets.seat1.w / 2).toBeCloseTo(1420 + 330 / 2);
    expect(L.sheets.seat3.y).toBeCloseTo(70 + 537 * m + 8);
    expect(L.sheets.seat4.y + L.sheets.seat4.h).toBeCloseTo(980);
    expect(L.zones['clubs']).toMatchObject({ x: 1010 - 48 - 530 + 710, y: 640 });
  });

  it('Rollenansicht: kleine Bögen bei 2 Spielern 0,85, bei 3 Spielern so groß, wie zwei in die Höhe passen', () => {
    expect(computeLayout(content, 2, 'seat2', null).sheets.seat1.scale).toBe(0.85);
    const three = computeLayout(content, 3, 'seat2', null);
    expect(three.sheets.seat1.scale).toBeCloseTo((990 - 70 - 10 - 8) / (2 * 537));
    expect(three.sheets.seat3.y + three.sheets.seat3.h).toBeCloseTo(980);
  });

  it('Tischmitte ist in beiden Ansichten gleich, nur verschoben', () => {
    for (const n of [2, 3, 4]) {
      const over = computeLayout(content, n, null, null);
      const role = computeLayout(content, n, 'seat1', null);
      const dx = role.middle.x - over.middle.x;
      expect({ ...role.middle, x: role.middle.x - dx }).toEqual(over.middle);
      for (const z of over.zoneList.filter((z) => !z.owner)) expect(role.zones[z.id]).toEqual({ ...z, x: z.x + dx });
      expect(role.menu).toEqual({ ...over.menu, x: over.menu.x + dx });
      expect(role.resistTitle).toEqual({ ...over.resistTitle, x: over.resistTitle.x + dx });
      expect(role.gmControls).toEqual({ ...over.gmControls, x: over.gmControls.x + dx });
    }
  });

  it('Bogenzonen wie bisher: Schaden bei (298, 72) im 380er-Bogen, mitskaliert', () => {
    const L = computeLayout(content, 4, null, null);
    const s = L.sheets.seat1;
    const dmg = L.zones['seat1.damage']!;
    expect(dmg.x).toBeCloseTo(s.x + 298 * 0.9, 0);
    expect(dmg.y).toBeCloseTo(s.y + 72 * 0.9, 0);
    expect(dmg.scale).toBeCloseTo(0.9);
    expect(L.zones['seat1.notes']!.fanX).toBeCloseTo(36);
  });

  it('geöffneter Karo-Stapel wächst auf volle Kartengröße', () => {
    const L = computeLayout(content, 4, null, 'diamonds_easy');
    expect(L.zones['diamonds_easy']).toMatchObject({ w: 80, h: 112, scale: 1 });
    expect(L.zones['diamonds_hard']).toMatchObject({ w: 48, h: 68, scale: 0.6 });
  });
});

describe('Karten und Ablegen', () => {
  it('Dicke eines Stapels: keine Kante bei einer Karte, dann 1, 2 und 3 Kanten ab 2, 8 und 20 Karten', () => {
    expect([0, 1, 2, 7, 8, 19, 20, 52].map(stackEdges)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('Stapel genau übereinander, Fächer mit festem Abstand, frei liegende gedreht am Anker', () => {
    let s = place(fresh(), 'danger', ['H2', 'H3'], true);
    s = lay(s, 'S5', { anchor: 'seat1', x: 0.5, y: 0.5 });
    const L = computeLayout(content, 4, null, null);
    const p = placeCards(s, L);
    expect(p.H3!.x - p.H2!.x).toBeCloseTo(26);
    const deck = s.zones['deck']!;
    expect(p[deck.at(-1)!]).toMatchObject({ x: L.zones['deck']!.x, y: L.zones['deck']!.y });
    expect(p[deck[0]!]).toMatchObject({ x: L.zones['deck']!.x, y: L.zones['deck']!.y });
    expect(p.S5).toMatchObject({ rotated: true, scale: 0.6, x: L.sheets.seat1.x + L.sheets.seat1.w / 2 });
  });

  it('Stapelung eindeutig: Zonen in Reihenfolge des Stands, frei liegende darüber; Platz je Karte (5g)', () => {
    let s = place(fresh(), 'danger', ['H2', 'H3'], true);
    s = lay(s, 'S5', { anchor: 'seat1', x: 0.5, y: 0.5 });
    const p = placeCards(s, computeLayout(content, 4, null, null));
    const all = Object.values(p);
    expect(new Set(all.map((c) => c!.z)).size).toBe(all.length);
    const zoneZ = Object.entries(p).filter(([c]) => c !== 'S5').map(([, c]) => c!.z);
    expect(Math.max(...zoneZ)).toBeLessThan(p.S5!.z);
    // in jeder Zone weniger Karten als ihr Bereich fasst
    for (const cards of Object.values(s.zones)) expect(cards.length).toBeLessThan(100);
    expect(10 + Object.keys(s.zones).length * 100).toBeLessThan(20000);
    expect(p.H3!.slot).toBe('danger#1');
    expect(p.S5!.slot).toBe('free#seat1:0.5:0.5');
  });

  it('Ablegen: Zone unter dem Punkt; sonst frei am Bogen oder im Spielbereich', () => {
    const L = computeLayout(content, 4, null, null);
    expect(zoneAt(L, 750, 500)?.id).toBe('deck');
    const s = L.sheets.seat2;
    expect(freePosAt(L, s.x + s.w / 4, s.y + s.h / 2)).toEqual({ anchor: 'seat2', x: 0.25, y: 0.5 });
    expect(freePosAt(L, 880, 900).anchor).toBe('center');
  });

  it('außerhalb von Bogen und Tischmitte: ganz in der Tischmitte an ihrem Rand (A32)', () => {
    const c = cardSize(computeLayout(content, 4, null, null), { scale: 0.6, rotated: true });
    for (const L of [computeLayout(content, 4, null, null), computeLayout(content, 2, null, null), computeLayout(content, 4, 'seat2', null)]) {
      const m = L.middle;
      // links neben der Tischmitte, rechts darüber hinaus, unten heraus
      expect(freePosAt(L, m.x - 5, 500)).toEqual({ anchor: 'center', x: 0, y: expect.closeTo((500 - m.y) / m.h, 4) });
      const r = freePosAt(L, m.x + m.w - 10, m.y + m.h - 5);
      expect(r.anchor).toBe('center');
      expect(m.x + r.x * m.w + c.w).toBeCloseTo(m.x + m.w, 1);
      expect(m.y + r.y * m.h + c.h).toBeCloseTo(m.y + m.h, 1);
    }
    // Rollenansicht: Lücke in der Spalte der kleinen Bögen
    const role = computeLayout(content, 4, 'seat2', null);
    const gap = role.sheets.seat1.x - 10;
    expect(freePosAt(role, gap, 500)).toMatchObject({ anchor: 'center', x: expect.closeTo(1 - c.w / role.middle.w, 3) });
  });
});

describe('Zeiger der anderen (8.3): Rollenansicht → Draufsicht', () => {
  const role = computeLayout(content, 4, 'seat2', null);
  const over = computeLayout(content, 4, null, null);
  const within = (pt: { x: number; y: number } | null, r: Rect) => {
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeGreaterThanOrEqual(r.x);
    expect(pt!.x).toBeLessThanOrEqual(r.x + r.w);
    expect(pt!.y).toBeGreaterThanOrEqual(r.y);
    expect(pt!.y).toBeLessThanOrEqual(r.y + r.h);
  };
  /** S5 frei im Spielbereich */
  const withFree = (x: number, y: number) => lay(fresh(), 'S5', { anchor: 'center', x, y });
  const cardRect = (p: CardPlace) => ({ x: p.x, y: p.y, ...cardSize(over, p) });

  it('über dem Deck: Anker ist das Deck, der Zeiger steht auch in der Draufsicht darüber', () => {
    const s = fresh();
    const d = role.zones['deck']!;
    const pos = pointerPosAt(role, placeCards(s, role), s.free, d.x + d.w * 0.25, d.y + d.h * 0.75, []);
    expect(pos).toEqual({ zone: 'deck', x: 0.25, y: 0.75 });
    const o = over.zones['deck']!;
    expect(pointerAt(over, placeCards(s, over), pos)).toEqual({ x: o.x + o.w * 0.25, y: o.y + o.h * 0.75 });
  });

  it('auf dem Bogen wie bisher am Bogen', () => {
    const s = fresh();
    const b = role.sheets.seat2;
    const pos = pointerPosAt(role, placeCards(s, role), s.free, b.x + b.w / 2, b.y + b.h / 4, []);
    expect(pos).toEqual({ anchor: 'seat2', x: 0.5, y: 0.25 });
    within(pointerAt(over, placeCards(s, over), pos), over.sheets.seat2);
  });

  it('über einer frei liegenden Karte: Anker ist die Karte', () => {
    const s = withFree(0.3, 0.4);
    const p = placeCards(s, role).S5!;
    const pos = pointerPosAt(role, placeCards(s, role), s.free, p.x + 5, p.y + 40, []);
    expect(pos).toMatchObject({ card: 'S5' });
    within(pointerAt(over, placeCards(s, over), pos), cardRect(placeCards(s, over).S5!));
  });

  it('frei liegende Karte über einem Bogen: die Karte geht vor', () => {
    // in der Rollenansicht ragt S5 vom Spielbereich in den eigenen Bogen
    const s = withFree(-30 / role.middle.w, 0.3);
    const p = placeCards(s, role).S5!;
    const x = p.x + 4;
    expect(x).toBeLessThan(role.sheets.seat2.x + role.sheets.seat2.w);
    const pos = pointerPosAt(role, placeCards(s, role), s.free, x, p.y + 20, []);
    expect(pos).toMatchObject({ card: 'S5' });
    within(pointerAt(over, placeCards(s, over), pos), cardRect(placeCards(s, over).S5!));
  });

  it('zwischen den Stapeln: derselbe Punkt der Tischmitte, nur verschoben', () => {
    const s = fresh();
    const dx = role.middle.x - over.middle.x;
    // zwischen Deck und Gefahr, zwischen Ablage und Kreuz, rechts neben der Ablage
    for (const [x, y] of [[640, 600], [930, 600], [1000, 480]] as const) {
      const pos = pointerPosAt(over, placeCards(s, over), s.free, x, y, []);
      expect(pos).toMatchObject({ anchor: 'center' });
      const pt = pointerAt(role, placeCards(s, role), pos)!;
      expect(pt.x).toBeCloseTo(x + dx, 1); // Anteil auf 4 Stellen gerundet
      expect(pt.y).toBeCloseTo(y, 1);
    }
  });

  it('außerhalb von Bogen und Tischmitte: bei den anderen am Rand der Tischmitte', () => {
    const s = fresh();
    // Rollenansicht: Lücke in der Spalte der kleinen Bögen, oben über der Spalte
    for (const [x, y] of [[role.sheets.seat1.x - 10, 500], [1500, 30]] as const) {
      const pos = pointerPosAt(role, placeCards(s, role), s.free, x, y, []);
      expect(pos).toMatchObject({ anchor: 'center', x: 1 });
      within(pointerAt(over, placeCards(s, over), pos), over.middle);
    }
    // Draufsicht: zwischen Bogen und Tischmitte
    const pos = pointerPosAt(over, placeCards(s, over), s.free, over.middle.x - 20, 400, []);
    expect(pos).toMatchObject({ anchor: 'center', x: 0 });
    within(pointerAt(role, placeCards(s, role), pos), role.middle);
  });

  it('gezogene Karten zählen nicht: darunter liegt die Zone bzw. der Spielbereich', () => {
    const s = withFree(0.3, 0.4);
    const p = placeCards(s, role).S5!;
    expect(pointerPosAt(role, placeCards(s, role), s.free, p.x + 5, p.y + 40, ['S5'])).toMatchObject({ anchor: 'center' });
  });

  it('Anker hier nicht zu sehen: kein Zeiger', () => {
    const two = computeLayout(content, 2, null, null);
    const s = fresh();
    expect(pointerAt(two, placeCards(s, two), { anchor: 'seat3', x: 0.5, y: 0.5 })).toBeNull();
    expect(pointerAt(two, placeCards(s, two), { zone: 'seat3.damage', x: 0.5, y: 0.5 })).toBeNull();
    // Karte frei auf dem ausgeblendeten Bogen
    const h = lay(s, 'S5', { anchor: 'seat3', x: 0.5, y: 0.5 });
    expect(pointerAt(two, placeCards(h, two), { card: 'S5', x: 0.5, y: 0.5 })).toBeNull();
  });
});

describe('Laterne (5n, 11.9)', () => {
  const MIDDLE_ZONES = ['diamonds_easy', 'diamonds_medium', 'diamonds_hard', 'display', 'deck', 'discard', 'danger', 'progress', 'clubs'];
  const views = [null, 'seat1', 'seat2', 'seat3', 'seat4'] as const;

  it('oben mittig in der Tischmitte, 104 TP, in beiden Ansichten an derselben Stelle der Tischmitte', () => {
    for (const players of [2, 3, 4] as const) {
      for (const role of views) {
        const L = computeLayout(content, players, role, null);
        expect(L.lamp.cx - L.middle.x).toBe(350);
        expect(L.lamp.cy - L.middle.y).toBe(60);
        expect(L.lamp).toMatchObject({ w: 104, h: 104, r: 52 });
      }
    }
    expect(computeLayout(content, 4, null, null).lamp).toMatchObject({ cx: 880, cy: 70 });
    expect(computeLayout(content, 4, 'seat1', null).lamp).toMatchObject({ cx: 1060, cy: 70 });
  });

  it('Flamme im Kamin, Höhe für die Schatten', () => {
    const { lamp } = computeLayout(content, 4, null, null);
    expect(lamp.flame.x).toBeCloseTo(lamp.x + 104 * 0.5024);
    expect(lamp.flame.y).toBeCloseTo(lamp.y + 104 * 0.4561);
    expect(lamp.flame.h).toBe(260);
  });

  it('Kreis überschneidet keine Zone der Tischmitte, auch keinen geöffneten Stapel, keine Beschriftung und kein Menü', () => {
    for (const role of [null, 'seat1'] as const) {
      for (const open of [null, ...MIDDLE_ZONES]) {
        const L = computeLayout(content, 4, role, open);
        for (const id of MIDDLE_ZONES) {
          const z = L.zones[id]!;
          expect(lampGap(L.lamp, z), `${id} (offen: ${open})`).toBeGreaterThan(0);
          // Beschriftung darunter: mittig bis 100 TP zu jeder Seite, sonst ab links 200 TP breit; 26 TP hoch
          const label = z.label.center ? { x: z.x + z.w / 2 - 100, y: z.y + z.h + 4, w: 200, h: 26 } : { x: z.x, y: z.y + z.h + 4, w: 200, h: 26 };
          expect(lampGap(L.lamp, label), `Beschriftung ${id}`).toBeGreaterThan(0);
        }
        expect(lampGap(L.lamp, { x: L.resistTitle.x, y: L.resistTitle.y, w: 200, h: 20 })).toBeGreaterThan(0);
        expect(lampGap(L.lamp, { x: L.menu.x, y: L.menu.y, w: 110, h: 140 })).toBeGreaterThan(0);
      }
    }
  });

  it('Licht je Ansicht: in der Rollenansicht weiter und heller', () => {
    expect(computeLayout(content, 4, null, null).light).toEqual({ reach: 1050, ambient: 0.3 });
    expect(computeLayout(content, 4, 'seat3', null).light).toEqual({ reach: 1500, ambient: 0.45 });
  });

  it('Abstand zum Kreis: 0 bei Überlapp, sonst Abstand zum Rand', () => {
    const { lamp } = computeLayout(content, 4, null, null);
    expect(lampGap(lamp, { x: lamp.cx - 5, y: lamp.cy - 5, w: 10, h: 10 })).toBe(0);
    expect(lampGap(lamp, { x: lamp.cx + 62, y: lamp.cy - 5, w: 10, h: 10 })).toBeCloseTo(10);
    // Ecke des Quadrats liegt außerhalb des Kreises
    expect(lampGap(lamp, { x: lamp.x - 10, y: lamp.y - 10, w: 12, h: 12 })).toBeGreaterThan(0);
  });
});
