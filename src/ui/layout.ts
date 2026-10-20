// Geometrie des Tisches (ARCHITEKTUR.md 10): wo liegen Bögen, Zonen und Karten in der aktuellen Ansicht.
// Reine Funktionen auf Inhalten + Stand; die Werte stammen aus layouts.yaml und der Haut (wie bisher).

import { seatVisibleFor, seatZoneId } from '../engine/zones';
import { SEATS, type AnchorId, type CardId, type FreePos, type SeatId, type TableState, type ZoneId } from '../engine/types';
import type { KlioContent } from '../rules/klio/content/validate';

export type Rect = { x: number; y: number; w: number; h: number };
export type MenuSide = 'fixed' | 'left' | 'right' | 'below';

export type ZoneBox = Rect & {
  id: ZoneId;
  /** Kartenmaßstab in dieser Zone (1 = 80 × 112) */
  scale: number;
  fanX: number;
  fanY: number;
  owner: SeatId | null;
  template: string;
  /** Stapelmenü (nur Zonen mit Aktionen) und Beschriftung, aus layouts.yaml */
  menu: MenuSide;
  label: { center: boolean; rotated: boolean; x: number | null };
};

export type SheetBox = Rect & { seat: SeatId; scale: number; visible: boolean; opacity: number };

export type Layout = {
  board: { w: number; h: number };
  card: { w: number; h: number };
  sheets: Record<SeatId, SheetBox>;
  panel: Rect;
  zones: Record<ZoneId, ZoneBox>;
  /** dieselben Zonen als Liste (Trefferprüfung beim Ziehen) */
  zoneList: ZoneBox[];
  resistTitle: { x: number; y: number };
  menu: { x: number; y: number };
  freeCardScale: number;
};

/** Grundbreite eines Bogens auf dem Tisch bei Maßstab 1 (wie bisher 380 × 537). */
export const SHEET_W = 380;
export const SHEET_H = 537;

const hiddenSheet = (seat: SeatId): SheetBox => ({ seat, x: 0, y: 0, w: 0, h: 0, scale: 0, visible: false, opacity: 0 });

/** `role` = Rollenansicht dieses Platzes, null = Draufsicht. */
export function computeLayout(c: KlioContent, players: number, viewRole: SeatId | null, open: ZoneId | null): Layout {
  const L = c.layouts;
  const [BW, BH] = L.board;
  const [CW, CH] = L.card;
  const visible = (s: SeatId) => seatVisibleFor(s, players);
  const role = viewRole && visible(viewRole) ? viewRole : null;

  const sheets = {} as Record<SeatId, SheetBox>;
  let panel: Rect;
  if (role) {
    const own = (BH - 2 * L.role.sheets.own.y) / SHEET_H;
    const o = L.role.sheets.others;
    const sw = SHEET_W * o.scale;
    const sh = SHEET_H * o.scale;
    let k = 0;
    for (const s of SEATS) {
      if (s === role) sheets[s] = { seat: s, x: L.role.sheets.own.x, y: L.role.sheets.own.y, w: SHEET_W * own, h: SHEET_H * own, scale: own, visible: true, opacity: 1 };
      else if (visible(s)) sheets[s] = { seat: s, x: o.x + k++ * (sw + o.gap), y: BH - o.bottomMargin - sh, w: sw, h: sh, scale: o.scale, visible: true, opacity: o.opacity };
      else sheets[s] = hiddenSheet(s);
    }
    const p = L.role.sheets.panel;
    panel = { x: p.x, y: p.y, w: BW - p.x - 10, h: BH - sh - 32 };
  } else {
    const o = L.overview.sheets;
    const m = players <= 2 ? o.scaleUpTo2Players : o.scaleFrom3Players;
    const ww = SHEET_W * m;
    const hh = SHEET_H * m;
    o.columns.forEach((col, ci) => {
      const shown = col.filter(visible);
      const total = shown.length * hh + (shown.length - 1) * o.gap;
      for (const s of col) {
        const j = shown.indexOf(s);
        sheets[s] = j < 0
          ? hiddenSheet(s)
          : { seat: s, x: ci ? BW - o.margin - ww : o.margin, y: (BH - total) / 2 + j * (hh + o.gap), w: ww, h: hh, scale: m, visible: true, opacity: 1 };
      }
    });
    const left = o.margin + ww + 16;
    panel = { x: left, y: 10, w: BW - 2 * left, h: BH - 20 };
  }

  const v = role ? L.role : L.overview;
  const zones: Record<ZoneId, ZoneBox> = {};
  const decor = (shape: (typeof L.shapes)[string] | undefined) => ({
    menu: (role ? shape?.menuInRole : undefined) ?? shape?.menu ?? 'below',
    label: { center: !!shape?.label?.center, rotated: !!shape?.label?.rotated, x: shape?.label?.x ?? null },
  });
  for (const [id, z] of Object.entries(c.zones)) {
    if (z.perSeat) continue;
    const shape = L.shapes[id] ?? {};
    const grow = shape.growOnOpen && open === id;
    const [x, y] = v.zones[id] ?? [0, 0];
    zones[id] = {
      id, x, y,
      w: grow ? CW : (shape.w ?? CW), h: grow ? CH : (shape.h ?? CH),
      scale: grow ? 1 : (shape.scale ?? 1), fanX: shape.fanX ?? 0, fanY: shape.fanY ?? 0,
      owner: null, template: id, ...decor(shape),
    };
  }
  // Bogenzonen: Lage aus der Haut (Bildkoordinaten), skaliert mit dem Bogen
  const [imgW] = c.skinPaper.size;
  for (const s of SEATS) {
    const sb = sheets[s];
    if (!sb.visible) continue;
    const k = (SHEET_W * sb.scale) / imgW; // Bildpunkt → Tisch
    for (const t of c.sheet.zones) {
      const r = c.skinPaper.zones[t]!;
      const shape = L.shapes[`seat.${t}`] ?? {};
      const id = seatZoneId(s, t);
      zones[id] = {
        id, x: sb.x + r.x * k, y: sb.y + r.y * k, w: r.w * k, h: r.h * k,
        scale: (shape.scale ?? 1) * sb.scale, fanX: (shape.fanX ?? 0) * sb.scale, fanY: (shape.fanY ?? 0) * sb.scale,
        owner: s, template: t, ...decor(shape),
      };
    }
  }

  return {
    board: { w: BW, h: BH },
    card: { w: CW, h: CH },
    sheets,
    panel,
    zones,
    zoneList: Object.values(zones),
    resistTitle: { x: v.resistTitle[0], y: v.resistTitle[1] },
    menu: { x: v.menu[0], y: v.menu[1] },
    freeCardScale: L.freeCardScale,
  };
}

/** Rechteck eines Ankers für frei liegende Karten. */
export function anchorRect(layout: Layout, anchor: AnchorId): Rect | null {
  if (anchor === 'center') return layout.panel;
  const s = layout.sheets[anchor];
  return s.visible ? s : null;
}

export type CardPlace = {
  x: number;
  y: number;
  scale: number;
  /** frei liegende Karten sind 90° gedreht */
  rotated: boolean;
  z: number;
};

/** Lage jeder sichtbaren Karte: in Zonen gestapelt oder aufgefächert, frei liegende relativ zu ihrem Anker.
 *  Karten auf ausgeblendeten Bögen fehlen. */
export function placeCards(state: TableState<unknown>, layout: Layout): Partial<Record<CardId, CardPlace>> {
  const out: Partial<Record<CardId, CardPlace>> = {};
  for (const [id, cards] of Object.entries(state.zones)) {
    const z = layout.zones[id];
    if (!z) continue;
    const fanned = z.fanX || z.fanY;
    cards.forEach((card, i) => {
      const stack = fanned ? 0 : Math.min(i, 12) * 0.4;
      out[card] = { x: z.x + i * z.fanX + stack, y: z.y + i * z.fanY + stack, scale: z.scale, rotated: false, z: 10 + i };
    });
  }
  state.free.forEach((card, i) => {
    const pos = state.freePos[card];
    const r = pos && anchorRect(layout, pos.anchor);
    if (r) out[card] = { x: r.x + pos.x * r.w, y: r.y + pos.y * r.h, scale: layout.freeCardScale, rotated: true, z: 1000 + i };
  });
  return out;
}

/** Größe einer Karte auf dem Tisch (gedreht: Breite und Höhe vertauscht). */
export function cardSize(layout: Layout, p: Pick<CardPlace, 'scale' | 'rotated'>): { w: number; h: number } {
  const w = layout.card.w * p.scale;
  const h = layout.card.h * p.scale;
  return p.rotated ? { w: h, h: w } : { w, h };
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Zone unter einem Punkt (Tischkoordinaten). */
export function zoneAt(layout: Layout, x: number, y: number): ZoneBox | null {
  return layout.zoneList.find((z) => inside(z, x, y)) ?? null;
}

/** Anker für eine frei abgelegte Karte: Bogen unter dem Punkt, sonst Spielbereich (A32). Lage als Anteil 0–1. */
export function freePosAt(layout: Layout, x: number, y: number): FreePos {
  const seat = SEATS.find((s) => layout.sheets[s].visible && inside(layout.sheets[s], x, y));
  const anchor: AnchorId = seat ?? 'center';
  const r = anchorRect(layout, anchor)!;
  const frac = (v: number) => Math.round(v * 10000) / 10000;
  return { anchor, x: frac((x - r.x) / r.w), y: frac((y - r.y) / r.h) };
}
