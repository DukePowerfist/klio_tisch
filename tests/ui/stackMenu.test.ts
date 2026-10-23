// Stapelmenü (ARCHITEKTUR.md 10.2, Schritt 5o): Einträge, Wirkung des Mischens aus Probeläufen der Engine, Lage.

import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import type { Actor, SeatId, TableState, ZoneId } from '../../src/engine/types';
import { computeLayout, type Rect } from '../../src/ui/layout';
import { MENU_GAP, placeMenu, placePlateMenu, shuffleEffect, stackEntries, TIP_INSET, type Area, type Side, type StackContext } from '../../src/ui/stackMenu';
import { can } from '../../src/engine/permissions';
import { content, engine, fresh, GM, place, player, ruleset, SPECTATOR, type K } from '../helpers';

/** Probelauf wie session.predict: Stand danach oder null bei Ablehnung */
const predictFor = (state: K, actor = GM) => (cmd: { type: string; zone: ZoneId }) => {
  const r = engine.dispatch(state, cmd, actor, seededRng(0));
  return 'state' in r ? (r.state as TableState<unknown>) : null;
};
const ctx = (table: K, zone: ZoneId, can: (type: string) => boolean = () => true): StackContext => ({ content, table, zone, can, predict: predictFor(table) });
const entries = (table: K, zone: ZoneId, can?: (type: string) => boolean) => stackEntries(ctx(table, zone, can));
const byAction = (table: K, zone: ZoneId, can?: (type: string) => boolean) => Object.fromEntries(entries(table, zone, can).map((e) => [e.action, e]));

const s0 = fresh();
const deckCards = s0.zones['deck']!;
const [easy1] = s0.zones['diamonds_easy']!;
const medium1 = s0.zones['diamonds_medium']![0]!;
const hard1 = s0.zones['diamonds_hard']![0]!;
/** Deck mit 5 eigenen Karten und 2 Karo in der Ablage */
const deckWithDiamonds = place(s0, 'discard', [...deckCards.slice(0, 5), easy1!, hard1], true);
/** Auslage mit Karo aller drei Stufen */
const displayAllTiers = place(s0, 'display', [easy1!, medium1, hard1], true);
const emptied = (state: K, zone: ZoneId) => ({ ...structuredClone(state), zones: { ...state.zones, [zone]: [] } }) as K;

describe('Stapelmenü: Einträge (10.2)', () => {
  it('feste Reihenfolge Ziehen, Umdrehen, Mischen; Kürzel Z, U, M', () => {
    const list = entries(s0, 'deck');
    expect(list.map((e) => [e.action, e.label, e.key])).toEqual([['draw', 'Ziehen', 'z'], ['flip', 'Umdrehen', 'u'], ['shuffle', 'Mischen', 'm']]);
    expect(list.every((e) => e.allowed && e.enabled)).toBe(true);
    expect(list.map((e) => e.title)).toEqual(['Oberste Karte auf die Ablage ziehen (Z)', 'Oberste Karte umdrehen (U)', 'Stapel mischen (M)']);
    expect(list[2]).toMatchObject({ effect: { total: 0 } });
  });

  it('Karo-Stapel zieht in die Auslage', () => {
    expect(byAction(s0, 'diamonds_medium').draw!.title).toBe('Oberste Karte in die Auslage ziehen (Z)');
  });

  it('leerer Stapel ohne etwas zum Einsammeln: alles ausgegraut, Grund „Stapel leer“', () => {
    const e = byAction(emptied(s0, 'diamonds_easy'), 'diamonds_easy');
    for (const a of ['draw', 'flip', 'shuffle']) expect(e[a]).toMatchObject({ allowed: true, enabled: false, title: 'Stapel leer' });
  });

  it('leeres Deck mit Karten in der Ablage: nur Mischen, mit Anzahl', () => {
    const e = byAction(emptied(deckWithDiamonds, 'deck'), 'deck');
    expect(e.draw).toMatchObject({ enabled: false, title: 'Stapel leer' });
    expect(e.flip).toMatchObject({ enabled: false, title: 'Stapel leer' });
    expect(e.shuffle).toMatchObject({ enabled: true, effect: { total: 7 } });
  });

  it('Mischen am Deck nennt, was zurückkommt und wohin die Karo gehen', () => {
    const e = byAction(deckWithDiamonds, 'deck').shuffle!;
    expect(e.title).toBe('Stapel mischen; holt 7 Karten aus der Ablage zurück (2 davon nach Leicht und Schwierig) (M)');
  });

  it('Mischen an einem Karo-Stapel holt die Karo aller Stufen aus der Auslage; eine einzelne Karte in der Einzahl', () => {
    expect(byAction(displayAllTiers, 'diamonds_easy').shuffle!.title).toBe(
      'Stapel mischen; holt 3 Karten aus der Auslage zurück (2 davon nach Mittel und Schwierig) (M)',
    );
    const one = place(s0, 'display', [easy1!], true);
    expect(byAction(one, 'diamonds_hard').shuffle).toMatchObject({ title: 'Stapel mischen; holt 1 Karte aus der Auslage zurück (1 davon nach Leicht) (M)' });
  });

  it('ohne Recht ausgegraut mit dem Text der Ablehnung; ohne ein einziges Recht nichts erlaubt', () => {
    const only = byAction(s0, 'deck', (type) => type === 'zone.draw');
    expect(only.draw).toMatchObject({ allowed: true, enabled: true });
    expect(only.flip).toMatchObject({ allowed: false, enabled: false, title: 'Dafür fehlt dir die Berechtigung.' });
    // Recht geht vor „leer“
    expect(byAction(emptied(s0, 'deck'), 'deck', () => false).draw!.title).toBe('Dafür fehlt dir die Berechtigung.');
    expect(entries(s0, 'deck', () => false).some((e) => e.allowed)).toBe(false);
  });

  it('Rechte aus der echten Prüfung (permissions.yaml): Zuschauer darf nichts, Spieler alles am Tisch', () => {
    const canAs = (actor: Actor) => (type: string) => can(actor, engine.commands[type]!, { type, zone: 'deck' }, s0, ruleset.permissions);
    expect(entries(s0, 'deck', canAs(SPECTATOR)).map((e) => e.allowed)).toEqual([false, false, false]);
    expect(entries(s0, 'deck', canAs(player('seat1'))).map((e) => e.enabled)).toEqual([true, true, true]);
  });
});

describe('Stapelmenü: Wirkung des Mischens aus dem Probelauf (N1)', () => {
  const effectOf = (state: K, zone: ZoneId) => shuffleEffect(state, predictFor(state)({ type: 'zone.shuffle', zone })!);

  it('Deck mit Karo in der Ablage: Karo in ihre Stapel, Rest ins Deck', () => {
    const e = effectOf(deckWithDiamonds, 'deck');
    expect(e).toMatchObject({ total: 7, from: ['discard'], into: { deck: 5, diamonds_easy: 1, diamonds_hard: 1 } });
  });

  it('Karo-Stapel: alle Karo aus der Auslage in ihre jeweiligen Stapel', () => {
    expect(effectOf(displayAllTiers, 'diamonds_medium')).toMatchObject({ total: 3, from: ['display'], into: { diamonds_easy: 1, diamonds_medium: 1, diamonds_hard: 1 } });
  });

  it('nichts einzusammeln: leer', () => {
    expect(effectOf(s0, 'deck')).toEqual({ total: 0, from: [], into: {} });
  });
});

// ---------- Lage mit den echten Maßen ----------

/** Panel aus der Musterseite (Variante B, 208 px breit) */
const PANEL = { w: 208, h: 160 };
const LOG_W = 300;

/** Bildschirmrechtecke wie Board.svelte bei Zoom 1: Tisch eingepasst und mittig in der Bühne */
function scene(W: number, H: number, role: SeatId | null, zone: ZoneId, log = false) {
  const L = computeLayout(content, 4, role, zone);
  const stageW = W - (log ? LOG_W : 0);
  const s = Math.min(stageW / L.board.w, H / L.board.h);
  const tx = (stageW - L.board.w * s) / 2;
  const ty = (H - L.board.h * s) / 2;
  const toScreen = (r: Rect): Rect => ({ x: tx + r.x * s, y: ty + r.y * s, w: r.w * s, h: r.h * s });
  // Dock unten links (5 Knöpfe, Dock.svelte), Menüknopf oben rechts (Menu.svelte); 8 px Rand (N8)
  const area: Area = {
    bounds: { x: 8, y: 8, w: stageW - 16, h: H - 16 },
    blocked: [{ x: 12, y: H - 42, w: 174, h: 30 }, { x: stageW - 42, y: 12, w: 30, h: 30 }],
  };
  return { L, toScreen, area };
}

const TARGET: Record<string, ZoneId> = { deck: 'discard', diamonds_easy: 'display', diamonds_medium: 'display', diamonds_hard: 'display', clubs: 'discard' };
/** bevorzugte Seite aus layouts.yaml (N2): Deck und Leicht links, sonst rechts */
const PREFERRED: Record<string, Side> = { deck: 'left', diamonds_easy: 'left', diamonds_medium: 'right', diamonds_hard: 'right', clubs: 'right' };
const sidesFor = (side: Side): Side[] => (side === 'left' ? ['left', 'right'] : ['right', 'left']);

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, b: Rect) => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;

describe('Stapelmenü: Lage am Stapel mit den echten Maßen (10.2)', () => {
  const cases = [
    [1280, 720, null, false],
    [1280, 720, 'seat1', false],
    [1920, 1080, null, false],
    [1920, 1080, 'seat1', false],
    [1280, 720, null, true],
    [1280, 720, 'seat1', true],
  ] as const;
  for (const [W, H, role, log] of cases) {
    it(`${W} × ${H}, ${role ? 'Rollenansicht' : 'Übersicht'}${log ? ', Protokoll offen' : ''}: bevorzugte Seite, oben bündig, Ziel und Stapel frei`, () => {
      for (const zone of Object.keys(TARGET)) {
        const { L, toScreen, area } = scene(W, H, role, zone, log);
        const anchor = toScreen(L.zones[zone]!);
        const target = toScreen(L.zones[TARGET[zone]!]!);
        expect(L.zones[zone]!.menu, zone).toBe(PREFERRED[zone]);
        const p = placeMenu(anchor, [target], area, PANEL, sidesFor(L.zones[zone]!.menu));
        const r = { x: p.x, y: p.y, ...PANEL };
        expect({ zone, side: p.side, fallback: p.fallback, top: p.y === anchor.y }).toEqual({ zone, side: PREFERRED[zone], fallback: false, top: true });
        expect(inside(r, area.bounds), zone).toBe(true);
        for (const other of [anchor, target, ...area.blocked]) expect(overlaps(r, other), zone).toBe(false);
        expect(p.tip, zone).toBeCloseTo(Math.max(TIP_INSET, anchor.h / 4));
      }
    });
  }

  it('aufgeklapptes „Leicht“ (Endmaß): mit rechts als Vorliebe müsste das Menü über die Auslage ausweichen, deshalb links (N9)', () => {
    const { L, toScreen, area } = scene(1280, 720, null, 'diamonds_easy');
    const anchor = toScreen(L.zones['diamonds_easy']!);
    const target = toScreen(L.zones['display']!);
    expect(L.zones['diamonds_easy']!.w).toBeGreaterThan(48);
    // bevorzugte Seite geht vor „oben bündig“: rechts bleibt, aber nach oben verschoben, über der Auslage
    expect(placeMenu(anchor, [target], area, PANEL, ['right', 'left'])).toMatchObject({ side: 'right', y: target.y - PANEL.h });
    expect(placeMenu(anchor, [target], area, PANEL, ['left', 'right'])).toMatchObject({ side: 'left', y: anchor.y });
  });
});

describe('Stapelmenü: Lage, Sonderfälle', () => {
  const area: Area = { bounds: { x: 8, y: 8, w: 1000, h: 600 }, blocked: [] };
  const anchor = { x: 400, y: 100, w: 60, h: 80 };

  it('am Fensterrand: Gegenseite', () => {
    const atEdge = { ...anchor, x: 1008 - 70 };
    expect(placeMenu(atEdge, [], area, PANEL, ['right', 'left'])).toMatchObject({ side: 'left', x: atEdge.x - MENU_GAP - PANEL.w, fallback: false });
  });

  it('unten am Rand: so weit nach oben geschoben wie nötig, Zipfel bleibt auf Höhe des Stapels', () => {
    const low = { ...anchor, y: 560 };
    const p = placeMenu(low, [], area, PANEL, ['right']);
    expect(p.y).toBe(608 - PANEL.h);
    expect(p.tip).toBeCloseTo(low.y + low.h / 4 - p.y);
  });

  it('Zipfel: begrenzt auf den geraden Teil der Kante, entfällt außerhalb des Panels (N3)', () => {
    // kleiner Stapel, oben bündig: h / 4 läge in der Ecke, der Zipfel rückt auf den Anfang des geraden Teils
    expect(placeMenu({ ...anchor, h: 40 }, [], area, PANEL, ['right']).tip).toBe(TIP_INSET);
    expect(placeMenu(anchor, [], area, PANEL, ['right']).tip).toBe(anchor.h / 4);
    // Ziel rechts oben: das Panel muss unter das Ziel, die Höhe des Stapels liegt über seiner Oberkante
    const target = { x: anchor.x + anchor.w + 20, y: 0, w: 100, h: 200 };
    expect(placeMenu(anchor, [target], area, PANEL, ['right'])).toMatchObject({ side: 'right', y: 200, tip: null, fallback: false });
  });

  it('Ziel wird gemieden, auch wenn dafür verschoben werden muss', () => {
    const target = { x: anchor.x + anchor.w + 20, y: anchor.y - 20, w: 80, h: 60 };
    const p = placeMenu(anchor, [target], area, PANEL, ['right']);
    expect(p).toMatchObject({ side: 'right', y: target.y + target.h, fallback: false });
  });

  describe('Ersatzfall (N2, N3)', () => {
    it('Vorrang 1: vollständig sichtbar, auch wenn das Ziel dabei verdeckt wird', () => {
      const small: Area = { bounds: { x: 0, y: 0, w: 320, h: 200 }, blocked: [] };
      const a = { x: 20, y: 40, w: 60, h: 80 };
      const target = { x: 100, y: 40, w: 60, h: 80 };
      const p = placeMenu(a, [target], small, PANEL, ['left', 'right']);
      expect(p).toMatchObject({ side: 'right', fallback: true });
      expect(inside({ x: p.x, y: p.y, ...PANEL }, small.bounds)).toBe(true);
      expect(overlaps({ x: p.x, y: p.y, ...PANEL }, a)).toBe(false);
    });

    it('Vorrang 2 vor 3: Stapel frei geht vor Ziel frei', () => {
      // links passt es nur über den Stapel, rechts nur über das Ziel
      const small: Area = { bounds: { x: 0, y: 0, w: 320, h: 170 }, blocked: [] };
      const a = { x: 30, y: 10, w: 60, h: 150 };
      const target = { x: 150, y: 10, w: 60, h: 150 };
      const p = placeMenu(a, [target], small, PANEL, ['left', 'right']);
      expect(p.side).toBe('right');
      expect(overlaps({ x: p.x, y: p.y, ...PANEL }, a)).toBe(false);
    });

    it('Vorrang 3: die Seite, auf der weniger vom Ziel verdeckt wird; bei Gleichstand die bevorzugte', () => {
      const small: Area = { bounds: { x: 0, y: 0, w: 600, h: 170 }, blocked: [] };
      const a = { x: 260, y: 10, w: 60, h: 150 };
      const bigLeft = { x: 0, y: 0, w: 250, h: 170 };
      const smallRight = { x: 500, y: 0, w: 100, h: 170 };
      expect(placeMenu(a, [bigLeft, smallRight], small, PANEL, ['left', 'right'])).toMatchObject({ side: 'right', fallback: true });
      // Gleichstand: ein Ziel über die ganze Breite, beide Seiten verdecken es gleich
      const wide = [{ x: 0, y: 0, w: 600, h: 170 }];
      expect(placeMenu(a, wide, small, PANEL, ['right', 'left'])).toMatchObject({ side: 'right', fallback: true });
      expect(placeMenu(a, wide, small, PANEL, ['left', 'right'])).toMatchObject({ side: 'left', fallback: true });
      // mehrere Ziele: das erste ist wichtiger (`avoid` nach Wichtigkeit)
      const two = [{ x: 0, y: 0, w: 120, h: 170 }, { x: 330, y: 0, w: 270, h: 170 }];
      expect(placeMenu(a, two, small, PANEL, ['left', 'right'])).toMatchObject({ side: 'right', fallback: true });
    });

    it('Fenster schmaler als Stapel und Panel: Panel darf den Stapel überdecken, bleibt aber sichtbar', () => {
      const tiny: Area = { bounds: { x: 0, y: 0, w: 240, h: 300 }, blocked: [] };
      const a = { x: 80, y: 20, w: 80, h: 112 };
      const p = placeMenu(a, [], tiny, PANEL, ['right', 'left']);
      expect(p.fallback).toBe(true);
      expect(p.tip).toBeNull();
      expect(inside({ x: p.x, y: p.y, ...PANEL }, tiny.bounds)).toBe(true);
    });
  });

  it('Namensschild als Anker (5p): unten, links bündig; am unteren Rand oben', () => {
    const plate = { x: 300, y: 100, w: 120, h: 24 };
    expect(placeMenu(plate, [], area, PANEL, ['below', 'above'])).toMatchObject({ side: 'below', x: 300, y: 124 + MENU_GAP, tip: 60, fallback: false });
    const low = { ...plate, y: 520 };
    expect(placeMenu(low, [], area, PANEL, ['below', 'above'])).toMatchObject({ side: 'above', y: 520 - MENU_GAP - PANEL.h });
    const right = { ...plate, x: 950 };
    expect(placeMenu(right, [], area, PANEL, ['below', 'above'])).toMatchObject({ side: 'below', x: 1008 - PANEL.w });
  });
});

describe('Lage des Namensschild-Menüs (10.4, R1, R2)', () => {
  const area: Area = { bounds: { x: 8, y: 8, w: 1264, h: 704 }, blocked: [{ x: 12, y: 678, w: 174, h: 30 }] };
  const panel = { w: 240, h: 300 };
  const plate = (x: number, y: number): Rect => ({ x, y, w: 49, h: 15 });
  const fits = (p: { x: number; y: number }, h = panel.h) => inside({ x: p.x, y: p.y, w: panel.w, h }, area.bounds);

  it('unter dem Schild, links bündig, Zipfel auf die Mitte des Schilds', () => {
    const p = placePlateMenu(plate(13, 6), area, panel, null);
    expect(p).toMatchObject({ x: 13, y: 6 + 15 + MENU_GAP, side: 'below', fallback: false });
    expect(p.tip).toBeCloseTo(24.5);
  });

  it('am rechten Rand so wenig wie nötig verschoben, der Zipfel zeigt weiter aufs Schild', () => {
    const p = placePlateMenu(plate(1100, 6), area, panel, null);
    expect(p.x).toBe(1272 - 240);
    expect(p.x + p.tip!).toBeCloseTo(1100 + 24.5);
  });

  it('unten nur weit neben dem Schild frei (Dock): darüber statt weit weg', () => {
    const p = placePlateMenu(plate(13, 368), area, panel, null);
    expect(p).toMatchObject({ x: 13, side: 'above', fallback: false });
    expect(p.y + panel.h).toBe(368 - MENU_GAP);
  });

  it('passt beim Öffnen auf keiner Seite: auf der Seite mit mehr Platz ins Fenster, über das Schild, ohne Zipfel, nicht aufs Dock', () => {
    const big = { w: 240, h: 380 };
    const p = placePlateMenu(plate(13, 368), area, big, null);
    expect(p).toMatchObject({ x: 13, side: 'above', tip: null, fallback: true });
    expect(fits(p, big.h)).toBe(true);
    expect(p.y).toBeLessThanOrEqual(368);
    expect(p.y + big.h).toBeGreaterThanOrEqual(383);
    const low = placePlateMenu(plate(13, 300), area, { w: 240, h: 420 }, 'below');
    expect(low).toMatchObject({ x: 13, side: 'below', fallback: true });
    expect(low.y + 420).toBeLessThanOrEqual(678);
  });

  it('feste Seite (R1): wird das Menü höher, bleibt es auf seiner Seite und rutscht notfalls ins Fenster', () => {
    const open = placePlateMenu(plate(600, 300), area, panel, null);
    expect(open.side).toBe('below');
    const grown = placePlateMenu(plate(600, 300), area, { w: 240, h: 450 }, 'below');
    expect(grown).toMatchObject({ x: 600, side: 'below', tip: null, fallback: true });
    expect(fits(grown, 450)).toBe(true);
    // ohne feste Seite wäre es darüber gegangen
    expect(placePlateMenu(plate(600, 500), area, { w: 240, h: 450 }, null).side).toBe('above');
    expect(placePlateMenu(plate(600, 500), area, { w: 240, h: 450 }, 'below').side).toBe('below');
  });
});
