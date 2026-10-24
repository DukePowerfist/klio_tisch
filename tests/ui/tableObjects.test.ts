// Expeditionsblatt und Kartenschachtel am unteren Rand (Schritt 5zb, ARCHITEKTUR.md 10.12): Lage, Maßstab, Ausweichen.

import { describe, expect, it } from 'vitest';
import { besideObjects, cardSize, computeLayout, freePosAt, lampGap, oracleRect, oracleScale, rotatedBounds, type Layout, type Rect } from '../../src/ui/layout';
import { content } from '../helpers';

const E = content.layouts.middle.expedition;
const O = content.layouts.middle.oracle;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Unterkante der Beschriftung einer Tischzone (ZoneView: 4 Abstand, Zeile 20 bzw. klein 17, Rand 2 × 2) */
const labelBottom = (L: Layout, id: string, small: boolean) => {
  const z = L.zones[id]!;
  return z.y + z.h + 4 + (small ? 17 : 20) + 4;
};
const views = () => {
  const out: { L: Layout; label: string }[] = [];
  for (const players of [1, 2, 3, 4]) {
    for (const role of [null, ...(['seat1', 'seat2', 'seat3', 'seat4'] as const).slice(0, players)]) {
      out.push({ L: computeLayout(content, players, role, null), label: `${players} Spieler, ${role ?? 'Draufsicht'}` });
    }
  }
  return out;
};

describe('Expeditionsblatt in Ruhe (5zb)', () => {
  it('liegt über der unteren Brettkante, links unter Gefahr und Fortschritt; der Kopf liegt auf dem Tisch', () => {
    for (const { L, label } of views()) {
      const { img, paper } = L.expedition;
      expect(img.y, label).toBe(L.board.h - E.rest);
      expect(img.y + img.h, label).toBeGreaterThan(L.board.h);
      expect(img.x, label).toBe(L.middle.x + E.x);
      // ganz links der Raute in der Mitte des Filzaufdrucks
      expect(paper.x + paper.w, label).toBeLessThan(L.middle.x + L.middle.w / 2 - 6);
      // der gemalte Kopf (bis zur Kopflinie) liegt auf dem Tisch
      expect(img.y + E.rows[0]!, label).toBeLessThanOrEqual(L.board.h);
    }
  });

  it('verdeckt auch hochgerückt und geneigt keine Zone und keine Beschriftung', () => {
    for (const { L, label } of views()) {
      const { paper } = L.expedition;
      const corner = (paper.w / 2) * Math.sin((Math.abs(E.tilt) * Math.PI) / 180);
      const top = paper.y - E.lift - corner;
      expect(top, label).toBeGreaterThan(labelBottom(L, 'progress', true));
      const lifted = { ...paper, y: top, h: paper.h };
      for (const z of L.zoneList.filter((z) => !z.owner)) expect(overlap(lifted, z), `${label}, ${z.id}`).toBe(false);
    }
  });

  it('ist in Draufsicht und Rollenansicht gleich, nur mit der Tischmitte verschoben', () => {
    const over = computeLayout(content, 4, null, null);
    const role = computeLayout(content, 4, 'seat1', null);
    const dx = role.middle.x - over.middle.x;
    expect(role.expedition.paper).toEqual({ ...over.expedition.paper, x: over.expedition.paper.x + dx });
  });
});

describe('Kartenschachtel (5zb)', () => {
  it('Maßstab: Wörter mindestens 12 px bei Zoom 1, zwischen 1 und maxScale (S3, T7)', () => {
    const fit = (w: number, h: number) => Math.min(w / 1760, h / 990);
    expect(oracleScale(O, fit(1920, 1080))).toBe(1);
    const small = oracleScale(O, fit(1024, 600));
    expect(small).toBeGreaterThan(1.5);
    expect(small).toBeLessThan(O.maxScale);
    expect(small * O.word * fit(1024, 600)).toBeCloseTo(12);
    expect(oracleScale(O, fit(800, 450))).toBe(O.maxScale);
    expect(oracleScale(O, 0)).toBe(1);
  });

  it('steht unter Kreuz, auch mit maxScale unter dessen Beschriftung, rechts vom Blatt und im Filz', () => {
    for (const { L, label } of views()) {
      const r = oracleRect(O, L.oracle, O.maxScale);
      const cardTop = L.board.h - O.rest * O.maxScale;
      // die hintere Karte ragt `out[0] - opening` über das Bild hinaus; ab ihrer Oberkante sind `rest · s` zu sehen
      expect(r.y - (O.out[0] - O.opening) * O.maxScale, label).toBeCloseTo(cardTop);
      expect(cardTop, label).toBeGreaterThan(labelBottom(L, 'clubs', false));
      expect(r.x, label).toBeGreaterThan(L.expedition.paper.x + L.expedition.paper.w);
      expect(r.x + r.w, label).toBeLessThan(L.middle.x + L.middle.w);
      const clubs = L.zones['clubs']!;
      expect(Math.abs(L.oracle.cx - (clubs.x + clubs.w / 2)), label).toBeLessThan(1);
      for (const z of L.zoneList.filter((z) => !z.owner)) expect(overlap({ ...r, y: cardTop, h: L.board.h - cardTop }, z), `${label}, ${z.id}`).toBe(false);
    }
  });

  it('Hindernis immer mit maxScale, nicht mit dem gezeigten Maßstab (T1)', () => {
    const L = computeLayout(content, 4, null, null);
    const reach = L.obstacles[1]!;
    const upright = { x: L.oracle.cx - (O.size[0] * O.maxScale) / 2, y: L.board.h - O.rest * O.maxScale, w: O.size[0] * O.maxScale, h: O.rest * O.maxScale };
    expect(reach).toEqual(rotatedBounds(upright, O.tilt, { x: L.oracle.cx, y: L.board.h }));
    // geneigt etwas breiter und höher als aufrecht
    expect(reach.w).toBeGreaterThan(upright.w);
    expect(reach.y).toBeLessThan(upright.y);
  });
});

describe('Freie Karten weichen Blatt und Schachtel aus (5zb, F5, U3)', () => {
  const L = computeLayout(content, 4, null, null);
  const c = cardSize(L, { scale: L.freeCardScale, rotated: true });
  const placed = (x: number, y: number): Rect => {
    const pos = freePosAt(L, x, y);
    return { x: L.middle.x + pos.x * L.middle.w, y: L.middle.y + pos.y * L.middle.h, ...c };
  };
  const clear = (r: Rect) => L.obstacles.every((o) => !overlap(r, o));
  const inMiddle = (r: Rect) => r.x >= L.middle.x - 0.1 && r.y >= L.middle.y - 0.1 && r.x + r.w <= L.middle.x + L.middle.w + 0.1 && r.y + r.h <= L.middle.y + L.middle.h + 0.1;

  it('auf das Blatt abgelegt landet die Karte knapp darüber, nicht darauf', () => {
    const p = L.expedition.paper;
    const r = placed(p.x + p.w / 2 - c.w / 2, p.y + 10);
    expect(clear(r)).toBe(true);
    expect(inMiddle(r)).toBe(true);
    expect(r.y + r.h).toBeLessThanOrEqual(p.y);
  });

  it('neben die kleine Schachtel abgelegt weicht sie trotzdem dem Platz der großen aus (T1)', () => {
    const shown = oracleRect(O, L.oracle, 1);
    const r = placed(shown.x + shown.w + 4, L.board.h - 60);
    expect(clear(r)).toBe(true);
    expect(inMiddle(r)).toBe(true);
  });

  it('Kette: aus dem Blatt seitlich heraus, ohne in die Schachtel, die Laterne oder über den Rand zu geraten', () => {
    for (let x = L.middle.x; x < L.middle.x + L.middle.w; x += 23) {
      const r = placed(x, L.middle.y + L.middle.h - 30);
      expect(clear(r), `x ${x}`).toBe(true);
      expect(inMiddle(r), `x ${x}`).toBe(true);
      expect(lampGap(L.lamp, r), `x ${x}`).toBeGreaterThan(0);
    }
  });

  it('weit weg von beiden bleibt die Karte, wo sie ist', () => {
    const r = { x: L.middle.x + 300, y: L.middle.y + 420, ...c };
    expect(besideObjects(L, r)).toEqual(r);
  });
});

describe('Neigung (5zb)', () => {
  it('rotatedBounds: um 0° unverändert, um 90° um die Mitte mit vertauschten Seiten', () => {
    const r = { x: 0, y: 0, w: 40, h: 20 };
    expect(rotatedBounds(r, 0, { x: 20, y: 10 })).toEqual(r);
    const q = rotatedBounds(r, 90, { x: 20, y: 10 });
    expect(q.w).toBeCloseTo(20);
    expect(q.h).toBeCloseTo(40);
    expect(q.x).toBeCloseTo(10);
    expect(q.y).toBeCloseTo(-10);
  });

  it('Blatt und Schachtel sind zu verschiedenen Seiten geneigt, die Schachtel nur leicht', () => {
    expect(Math.sign(E.tilt)).not.toBe(Math.sign(O.tilt));
    expect(Math.abs(O.tilt)).toBeGreaterThan(0);
    expect(Math.abs(O.tilt)).toBeLessThanOrEqual(5);
  });
});
