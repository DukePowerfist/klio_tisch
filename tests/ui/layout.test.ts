// Geometrie wie in der alten Datei: Bögen, Zonen und Spielbereich je Ansicht (Werte aus layouts.yaml und Haut).

import { describe, expect, it } from 'vitest';
import { computeLayout, freePosAt, placeCards, zoneAt } from '../../src/ui/layout';
import { content, fresh, place } from '../helpers';

describe('Ansichten', () => {
  it('Draufsicht mit 4 Spielern: Bögen 0,9-fach links und rechts, Spielbereich dazwischen', () => {
    const L = computeLayout(content, 4, null, null);
    const hh = 537 * 0.9;
    expect(L.sheets.seat1).toMatchObject({ x: 14, y: (990 - (2 * hh + 14)) / 2, scale: 0.9, visible: true });
    expect(L.sheets.seat2.x).toBeCloseTo(1760 - 14 - 380 * 0.9);
    expect(L.sheets.seat3.y).toBeCloseTo(L.sheets.seat1.y + hh + 14);
    expect(L.panel).toEqual({ x: 14 + 342 + 16, y: 10, w: 1760 - 2 * (14 + 342 + 16), h: 970 });
    expect(L.zones['deck']).toMatchObject({ x: 760, y: 440, w: 80, h: 112, scale: 1 });
  });

  it('Draufsicht mit 2 Spielern: Bögen 1,2-fach; Plätze 3 und 4 ausgeblendet', () => {
    const L = computeLayout(content, 2, null, null);
    expect(L.sheets.seat1.scale).toBe(1.2);
    expect(L.sheets.seat3.visible).toBe(false);
    expect(L.zones['seat3.damage']).toBeUndefined();
  });

  it('Rollenansicht: eigener Bogen groß links, andere 0,85-fach unten rechts', () => {
    const L = computeLayout(content, 4, 'seat2', null);
    expect(L.role).toBe('seat2');
    expect(L.sheets.seat2).toMatchObject({ x: 14, y: 10, scale: 970 / 537 });
    expect(L.sheets.seat1).toMatchObject({ x: 745, scale: 0.85, opacity: 0.88 });
    expect(L.sheets.seat3.x).toBeCloseTo(745 + 380 * 0.85 + 8);
    expect(L.zones['clubs']).toMatchObject({ x: 1480, y: 40 });
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
    expect(zoneAt(L, 800, 500)?.id).toBe('deck');
    const s = L.sheets.seat2;
    expect(freePosAt(L, s.x + s.w / 4, s.y + s.h / 2)).toEqual({ anchor: 'seat2', x: 0.25, y: 0.5 });
    expect(freePosAt(L, 880, 900).anchor).toBe('center');
  });
});
