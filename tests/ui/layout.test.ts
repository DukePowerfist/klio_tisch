// Geometrie wie in der alten Datei: Bögen, Zonen und Spielbereich je Ansicht (Werte aus layouts.yaml und Haut).

import { describe, expect, it } from 'vitest';
import { computeLayout, freePosAt, placeCards, pointerAt, pointerPosAt, zoneAt, type Rect } from '../../src/ui/layout';
import { content, fresh, place, type K } from '../helpers';

describe('Ansichten', () => {
  it('Draufsicht mit 4 Spielern: Bögen 0,9-fach links und rechts, Tischmitte mittig dazwischen', () => {
    const L = computeLayout(content, 4, null, null);
    const hh = 537 * 0.9;
    expect(L.sheets.seat1).toMatchObject({ x: 14, y: (990 - (2 * hh + 14)) / 2, scale: 0.9, visible: true });
    expect(L.sheets.seat2.x).toBeCloseTo(1760 - 14 - 380 * 0.9);
    expect(L.sheets.seat3.y).toBeCloseTo(L.sheets.seat1.y + hh + 14);
    expect(L.panel).toEqual({ x: 530, y: 10, w: 700, h: 970 });
    expect(L.panel.x + L.panel.w / 2).toBe(1760 / 2);
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
    expect(L.panel).toEqual({ x: 530, y: 10, w: 700, h: 970 });
    expect(L.panel.x - (L.sheets.seat1.x + L.sheets.seat1.w)).toBeCloseTo(60);
  });

  it('Rollenansicht: eigener Bogen groß links, Tischmitte daneben, andere rechts untereinander', () => {
    const L = computeLayout(content, 4, 'seat2', null);
    expect(L.role).toBe('seat2');
    expect(L.sheets.seat2).toMatchObject({ x: 14, y: 10, scale: 970 / 537 });
    expect(L.panel).toEqual({ x: 710, y: 10, w: 700, h: 970 });
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
      const dx = role.panel.x - over.panel.x;
      expect({ ...role.panel, x: role.panel.x - dx }).toEqual(over.panel);
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
  it('Stapel leicht versetzt, Fächer mit festem Abstand, frei liegende gedreht am Anker', () => {
    let s = place(fresh(), 'danger', ['H2', 'H3'], true);
    s = { ...s, free: ['S5'], freePos: { S5: { anchor: 'seat1', x: 0.5, y: 0.5 } } };
    s.zones['deck'] = s.zones['deck']!.filter((c) => c !== 'S5');
    const L = computeLayout(content, 4, null, null);
    const p = placeCards(s, L);
    expect(p.H3!.x - p.H2!.x).toBeCloseTo(26);
    const deck = s.zones['deck']!;
    expect(p[deck[1]!]!.x - p[deck[0]!]!.x).toBeCloseTo(0.4);
    expect(p.S5).toMatchObject({ rotated: true, scale: 0.6, x: L.sheets.seat1.x + L.sheets.seat1.w / 2 });
  });

  it('Ablegen: Zone unter dem Punkt; sonst frei am Bogen oder im Spielbereich', () => {
    const L = computeLayout(content, 4, null, null);
    expect(zoneAt(L, 750, 500)?.id).toBe('deck');
    const s = L.sheets.seat2;
    expect(freePosAt(L, s.x + s.w / 4, s.y + s.h / 2)).toEqual({ anchor: 'seat2', x: 0.25, y: 0.5 });
    expect(freePosAt(L, 880, 900).anchor).toBe('center');
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
  const withFree = (x: number, y: number) => {
    const s: K = { ...fresh(), free: ['S5'], freePos: { S5: { anchor: 'center', x, y } } };
    s.zones['deck'] = s.zones['deck']!.filter((c) => c !== 'S5');
    return s;
  };
  const cardRect = (p: { x: number; y: number }) => ({ x: p.x, y: p.y, w: 112 * 0.6, h: 80 * 0.6 });

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
    const s = withFree(-30 / role.panel.w, 0.3);
    const p = placeCards(s, role).S5!;
    const x = p.x + 4;
    expect(x).toBeLessThan(role.sheets.seat2.x + role.sheets.seat2.w);
    const pos = pointerPosAt(role, placeCards(s, role), s.free, x, p.y + 20, []);
    expect(pos).toMatchObject({ card: 'S5' });
    within(pointerAt(over, placeCards(s, over), pos), cardRect(placeCards(s, over).S5!));
  });

  it('zwischen den Stapeln: derselbe Punkt der Tischmitte, nur verschoben', () => {
    const s = fresh();
    const dx = role.panel.x - over.panel.x;
    // zwischen Deck und Gefahr, zwischen Ablage und Kreuz, rechts neben der Ablage
    for (const [x, y] of [[640, 600], [930, 600], [1000, 480]] as const) {
      const pos = pointerPosAt(over, placeCards(s, over), s.free, x, y, []);
      expect(pos).toMatchObject({ anchor: 'center' });
      const pt = pointerAt(role, placeCards(s, role), pos)!;
      expect(pt.x).toBeCloseTo(x + dx, 1); // Anteil auf 4 Stellen gerundet
      expect(pt.y).toBeCloseTo(y, 1);
    }
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
    const h: K = { ...s, free: ['S5'], freePos: { S5: { anchor: 'seat3', x: 0.5, y: 0.5 } } };
    h.zones['deck'] = h.zones['deck']!.filter((c) => c !== 'S5');
    expect(pointerAt(two, placeCards(h, two), { card: 'S5', x: 0.5, y: 0.5 })).toBeNull();
  });
});
