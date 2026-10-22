// Geometrie des Tisches (ARCHITEKTUR.md 10): wo liegen Bögen, Zonen und Karten in der aktuellen Ansicht.
// Reine Funktionen auf Inhalten + Stand; die Werte stammen aus layouts.yaml und der Haut (wie bisher).

import { seatVisibleFor, seatZoneId } from '../engine/zones';
import { SEATS, type AnchorId, type CardId, type FreePos, type SeatId, type TableState, type ZoneId } from '../engine/types';
import type { PointerPos } from '../net/presence';
import type { KlioContent } from '../rules/klio/content/validate';

export type Rect = { x: number; y: number; w: number; h: number };
/** bevorzugte Seite des Stapelmenüs (10.2) */
export type MenuSide = 'left' | 'right';

export type ZoneBox = Rect & {
  id: ZoneId;
  /** Kartenmaßstab in dieser Zone (1 = 80 × 112) */
  scale: number;
  fanX: number;
  fanY: number;
  owner: SeatId | null;
  template: string;
  /** aufgefächert (zones.yaml `fanned`); sonst ein Stapel, dessen Dicke Kanten zeigen */
  fanned: boolean;
  /** bevorzugte Seite des Stapelmenüs (nur Zonen mit Aktionen) und Beschriftung, aus layouts.yaml */
  menu: MenuSide;
  label: { center: boolean; rotated: boolean; x: number | null };
};

export type SheetBox = Rect & { seat: SeatId; scale: number; visible: boolean; opacity: number };

/** Laterne (11.9): Bild als Quadrat, ein Kreis mit Radius `r` um (`cx`, `cy`) für Überlapp und Ablegen,
 *  Flamme in Tischkoordinaten mit ihrer Höhe über dem Tisch (Schatten) */
export type LampBox = Rect & { cx: number; cy: number; r: number; flame: { x: number; y: number; h: number } };

export type Layout = {
  /** tatsächlich gezeigte Ansicht: Platz der Rollenansicht, null = Draufsicht (auch wenn der Platz ausgeblendet ist) */
  role: SeatId | null;
  board: { w: number; h: number };
  card: { w: number; h: number };
  sheets: Record<SeatId, SheetBox>;
  /** Tischmitte = Spielbereich (Filz, Anker `center`); in beiden Ansichten gleich, nur verschoben */
  middle: Rect;
  zones: Record<ZoneId, ZoneBox>;
  /** dieselben Zonen als Liste (Trefferprüfung beim Ziehen) */
  zoneList: ZoneBox[];
  resistTitle: { x: number; y: number };
  /** rechte untere Ecke der SL-Leiste */
  gmControls: { x: number; y: number };
  freeCardScale: number;
  lamp: LampBox;
  /** Licht der Laterne in dieser Ansicht: Reichweite in TP, Grundlicht am Rand */
  light: { reach: number; ambient: number };
};

/** Grundbreite eines Bogens auf dem Tisch bei Maßstab 1 (wie bisher 380 × 537). */
export const SHEET_W = 380;
const SHEET_H = 537;

/** Ab diesem Zoom zeigen die Bögen ihre kleinen Bedienelemente; am eigenen Bogen der Rollenansicht immer (ARCHITEKTUR.md 10). */
export const CONTROLS_ZOOM = 1.3;

const hiddenSheet = (seat: SeatId): SheetBox => ({ seat, x: 0, y: 0, w: 0, h: 0, scale: 0, visible: false, opacity: 0 });

/** `role` = Rollenansicht dieses Platzes, null = Draufsicht.
 *  Die Tischmitte ist in beiden Ansichten gleich und nur verschoben (ARCHITEKTUR.md 10, Schritt 5d). */
export function computeLayout(c: KlioContent, players: number, viewRole: SeatId | null, open: ZoneId | null): Layout {
  const L = c.layouts;
  const [BW, BH] = L.board;
  const [CW, CH] = L.card;
  const visible = (s: SeatId) => seatVisibleFor(s, players);
  const role = viewRole && visible(viewRole) ? viewRole : null;

  const M = L.middle;
  const [mx, my] = role ? L.role.middle : L.overview.middle;
  const middle: Rect = { x: mx, y: my, w: M.size[0], h: M.size[1] };
  /** Punkt relativ zur Tischmitte → Tisch */
  const at = ([x, y]: readonly [number, number]) => ({ x: mx + x, y: my + y });

  const sheets = {} as Record<SeatId, SheetBox>;
  if (role) {
    const own = (BH - 2 * L.role.sheets.own.y) / SHEET_H;
    const o = L.role.sheets.others;
    // Spalte rechts: so groß, wie alle in die Höhe passen, höchstens maxScale
    const n = SEATS.filter((s) => s !== role && visible(s)).length;
    const m = Math.min(o.maxScale, (BH - o.top - o.bottomMargin - (n - 1) * o.gap) / (n * SHEET_H));
    const sw = SHEET_W * m;
    const sh = SHEET_H * m;
    let k = 0;
    for (const s of SEATS) {
      if (s === role) sheets[s] = { seat: s, x: L.role.sheets.own.x, y: L.role.sheets.own.y, w: SHEET_W * own, h: SHEET_H * own, scale: own, visible: true, opacity: 1 };
      else if (visible(s)) sheets[s] = { seat: s, x: o.x + (o.w - sw) / 2, y: o.top + k++ * (sh + o.gap), w: sw, h: sh, scale: m, visible: true, opacity: o.opacity };
      else sheets[s] = hiddenSheet(s);
    }
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
  }

  const zones: Record<ZoneId, ZoneBox> = {};
  const decor = (shape: (typeof L.shapes)[string] | undefined) => ({
    menu: shape?.menu ?? 'right',
    label: { center: !!shape?.label?.center, rotated: !!shape?.label?.rotated, x: shape?.label?.x ?? null },
  });
  for (const [id, z] of Object.entries(c.zones)) {
    if (z.perSeat) continue;
    const shape = L.shapes[id] ?? {};
    const grow = shape.growOnOpen && open === id;
    zones[id] = {
      id, ...at(M.zones[id] ?? [0, 0]),
      w: grow ? CW : (shape.w ?? CW), h: grow ? CH : (shape.h ?? CH),
      scale: grow ? 1 : (shape.scale ?? 1), fanX: shape.fanX ?? 0, fanY: shape.fanY ?? 0,
      owner: null, template: id, fanned: !!z.fanned, ...decor(shape),
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
        owner: s, template: t, fanned: !!c.zones[t]?.fanned, ...decor(shape),
      };
    }
  }

  return {
    role,
    board: { w: BW, h: BH },
    card: { w: CW, h: CH },
    sheets,
    middle,
    zones,
    zoneList: Object.values(zones),
    resistTitle: at(M.resistTitle),
    gmControls: at([middle.w - M.gmControlsInset[0], middle.h - M.gmControlsInset[1]]),
    freeCardScale: L.freeCardScale,
    lamp: lampBox(at(M.lamp.at), M.lamp),
    light: role ? L.role.light : L.overview.light,
  };
}

function lampBox(c: { x: number; y: number }, l: KlioContent['layouts']['middle']['lamp']): LampBox {
  const x = c.x - l.size / 2;
  const y = c.y - l.size / 2;
  return { x, y, w: l.size, h: l.size, cx: c.x, cy: c.y, r: l.size / 2, flame: { x: x + l.size * l.flame[0], y: y + l.size * l.flame[1], h: l.height } };
}

/** Abstand eines Rechtecks zum Kreis der Laterne (0 = berührt oder überlappt). */
export function lampGap(lamp: LampBox, r: Rect): number {
  const dx = Math.max(r.x - lamp.cx, 0, lamp.cx - (r.x + r.w));
  const dy = Math.max(r.y - lamp.cy, 0, lamp.cy - (r.y + r.h));
  return Math.max(0, Math.hypot(dx, dy) - lamp.r);
}

/** Rechteck eines Ankers für frei liegende Karten. */
function anchorRect(layout: Layout, anchor: AnchorId): Rect | null {
  if (anchor === 'center') return layout.middle;
  const s = layout.sheets[anchor];
  return s.visible ? s : null;
}

export type CardPlace = {
  x: number;
  y: number;
  scale: number;
  /** frei liegende Karten sind 90° gedreht */
  rotated: boolean;
  /** Stapelung: je Zone ein eigener Bereich, frei liegende darüber; eindeutig, unabhängig von der Reihenfolge im DOM */
  z: number;
  /** Platz im Stand (Zone und Stelle bzw. freie Lage): Ändert er sich, bewegt sich die Karte; sonst nur die Ansicht (11.2) */
  slot: string;
  /** Stapel (11.9): oberste Karte mit der Zahl der Kanten darunter, `under` für die Karten darunter (verdeckt) */
  edges?: number;
  under?: true;
};

export type Places = Partial<Record<CardId, CardPlace>>;

/** Stapelung: Zone k bekommt `10 + k · ZONE_Z` bis darunter, frei liegende Karten liegen ab `FREE_Z` darüber */
const ZONE_Z = 100;
const FREE_Z = 20000;

/** Lage jeder sichtbaren Karte: in Zonen gestapelt oder aufgefächert, frei liegende relativ zu ihrem Anker.
 *  Karten auf ausgeblendeten Bögen fehlen. */
export function placeCards(state: TableState<unknown>, layout: Layout): Places {
  const out: Places = {};
  Object.entries(state.zones).forEach(([id, cards], k) => {
    const z = layout.zones[id];
    if (!z) return;
    // Stapel liegen genau übereinander; ihre Dicke zeichnet die Zone (`stackEdges`, 11.6)
    const top = cards.length - 1;
    cards.forEach((card, i) => {
      const stack = z.fanned ? {} : i === top ? { edges: stackEdges(cards.length) } : { under: true as const };
      out[card] = { x: z.x + i * z.fanX, y: z.y + i * z.fanY, scale: z.scale, rotated: false, z: 10 + k * ZONE_Z + i, slot: `${id}#${i}`, ...stack };
    });
  });
  state.free.forEach((card, i) => {
    const pos = state.freePos[card];
    const p = pos && pointAt(layout, pos);
    if (p) out[card] = { ...p, scale: layout.freeCardScale, rotated: true, z: FREE_Z + i, slot: `free#${pos.anchor}:${pos.x}:${pos.y}` };
  });
  return out;
}

/** Dicke eines Stapels (11.6): so viele versetzte Kanten zeigt die Zone unter der obersten Karte */
export const stackEdges = (n: number): number => (n >= 20 ? 3 : n >= 8 ? 2 : n >= 2 ? 1 : 0);

/** Größe einer Karte auf dem Tisch (gedreht: Breite und Höhe vertauscht). */
export function cardSize(layout: Pick<Layout, 'card'>, p: Pick<CardPlace, 'scale' | 'rotated'>): { w: number; h: number } {
  const w = layout.card.w * p.scale;
  const h = layout.card.h * p.scale;
  return p.rotated ? { w: h, h: w } : { w, h };
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const frac = (v: number) => Math.round(v * 10000) / 10000;
/** Punkt als Anteil 0–1 eines Rechtecks (auf 4 Stellen) und zurück */
const relIn = (r: Rect, x: number, y: number) => ({ x: frac((x - r.x) / r.w), y: frac((y - r.y) / r.h) });
const pointIn = (r: Rect, f: { x: number; y: number }) => ({ x: r.x + f.x * r.w, y: r.y + f.y * r.h });
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Punkt in die Tischmitte geholt, Abstand `w`, `h` zum rechten und unteren Rand (6.1, A32); in Tischkoordinaten */
const clampIntoMiddle = ({ middle: m }: Layout, x: number, y: number, w = 0, h = 0) =>
  ({ x: clamp(x, m.x, m.x + m.w - w), y: clamp(y, m.y, m.y + m.h - h) });
/** dasselbe als Anteil der Tischmitte */
const intoMiddle = (layout: Layout, x: number, y: number, w = 0, h = 0) => {
  const p = clampIntoMiddle(layout, x, y, w, h);
  return relIn(layout.middle, p.x, p.y);
};
/** sichtbarer Bogen unter einem Punkt */
const sheetAt = (layout: Layout, x: number, y: number) => SEATS.find((s) => layout.sheets[s].visible && inside(layout.sheets[s], x, y));
const cardRect = (layout: Layout, p: CardPlace): Rect => ({ x: p.x, y: p.y, ...cardSize(layout, p) });

/** Zone unter einem Punkt (Tischkoordinaten). */
export function zoneAt(layout: Layout, x: number, y: number): ZoneBox | null {
  return layout.zoneList.find((z) => inside(z, x, y)) ?? null;
}

/** Umkehrung von `freePosAt`: Punkt auf dem Tisch in dieser Ansicht; null, wenn der Anker (Bogen) ausgeblendet ist. */
function pointAt(layout: Layout, pos: FreePos): { x: number; y: number } | null {
  const r = anchorRect(layout, pos.anchor);
  return r && pointIn(r, pos);
}

/** Anker für eine frei abgelegte Karte (linke obere Ecke): Bogen unter dem Punkt, sonst Spielbereich (A32).
 *  Lage als Anteil 0–1. Im Spielbereich liegt die ganze gedrehte Karte in der Tischmitte; was außerhalb von Bogen
 *  und Tischmitte abgelegt wird, kommt an ihren Rand, damit es in jeder Ansicht an derselben Stelle liegt. */
export function freePosAt(layout: Layout, x: number, y: number): FreePos {
  const seat = sheetAt(layout, x, y);
  if (seat) return { anchor: seat, ...relIn(layout.sheets[seat], x, y) };
  const c = cardSize(layout, { scale: layout.freeCardScale, rotated: true });
  const at = besideLamp(layout, { ...clampIntoMiddle(layout, x, y, c.w, c.h), ...c });
  return { anchor: 'center', ...relIn(layout.middle, at.x, at.y) };
}

/** Mindestabstand einer abgelegten Karte zur Laterne (11.9, F3) */
const LAMP_GAP = 4;

/** Karte (Rechteck in der Tischmitte) von der Laterne wegschieben wie vom Rand der Tischmitte (11.9, F3): berührt sie
 *  den Kreis samt Abstand, nach links, rechts oder unten knapp neben das umgebende Quadrat (nach oben ist kein Platz),
 *  nur ganz in der Tischmitte, auf dem kürzesten Weg. */
function besideLamp(layout: Layout, r: Rect): { x: number; y: number } {
  const { lamp, middle: m } = layout;
  if (lampGap(lamp, r) >= LAMP_GAP) return r;
  const s = lamp.r + LAMP_GAP;
  const fits = (p: { x: number; y: number }) => p.x >= m.x && p.y >= m.y && p.x + r.w <= m.x + m.w && p.y + r.h <= m.y + m.h;
  const options = [{ x: lamp.cx - s - r.w, y: r.y }, { x: lamp.cx + s, y: r.y }, { x: r.x, y: lamp.cy + s }].filter(fits);
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x - r.x, p.y - r.y);
  return options.sort((a, b) => dist(a) - dist(b))[0] ?? r;
}

/** Lage des Zeigers für die anderen (8.3), damit sie auch in einer anderen Ansicht über derselben Stelle steht:
 *  oberste frei liegende Karte (ohne `skip`, die gerade gezogenen), sonst Bogen, sonst Tischzone, sonst Spielbereich;
 *  außerhalb von Bogen und Tischmitte am Rand der Tischmitte.
 *  Zonen auf einem Bogen brauchen keinen eigenen Anker, sie gehen mit dem Bogen. */
export function pointerPosAt(layout: Layout, places: Places, free: readonly CardId[], x: number, y: number, skip: readonly CardId[] = []): PointerPos {
  for (let i = free.length - 1; i >= 0; i--) {
    const card = free[i]!;
    const p = places[card];
    const r = p && !skip.includes(card) ? cardRect(layout, p) : null;
    if (r && inside(r, x, y)) return { card, ...relIn(r, x, y) };
  }
  const seat = sheetAt(layout, x, y);
  if (seat) return { anchor: seat, ...relIn(layout.sheets[seat], x, y) };
  const zone = layout.zoneList.find((z) => !z.owner && inside(z, x, y));
  return zone ? { zone: zone.id, ...relIn(zone, x, y) } : { anchor: 'center', ...intoMiddle(layout, x, y) };
}

/** Umkehrung von `pointerPosAt` in dieser Ansicht; null, wenn der Anker hier nicht zu sehen ist. */
export function pointerAt(layout: Layout, places: Places, pos: PointerPos): { x: number; y: number } | null {
  const card = 'card' in pos ? places[pos.card] : undefined;
  const r = 'card' in pos ? card && cardRect(layout, card) : 'zone' in pos ? layout.zones[pos.zone] : anchorRect(layout, pos.anchor);
  return r ? pointIn(r, pos) : null;
}
