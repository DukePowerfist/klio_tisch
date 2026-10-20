// Format 1 → 2 (Schritt 5d, ARCHITEKTUR.md 10 „Tischmitte“): Der Spielbereich (Anker `center`) ist jetzt die
// Tischmitte, 700 × 970, in der Draufsicht bei x 530; die Stapel sind dabei um 48 nach links gerückt.
// Frei liegende Karten im Spielbereich behalten ihre Lage zu den Stapeln (wie in der Draufsicht); was nicht mehr in
// die Tischmitte passt, kommt ganz hinein an den Rand. Die Maße stehen hier fest, nicht aus layouts.yaml: Spätere
// Änderungen an den Ansichten dürfen diesen Schritt nicht verändern.

import type { Migration } from '../../../engine/types';

/** alter Spielbereich der Draufsicht je Spielerzahl */
const oldPanel = (players: number) => (players <= 2 ? { x: 486, w: 788 } : { x: 372, w: 1016 });
const OLD_Y = 10;
const OLD_H = 970;
const SHIFT = 48;
const MIDDLE = { x: 530, y: 10, w: 700, h: 970 };
/** frei liegende Karte: 80 × 112 mal 0,6, gedreht; gespeichert ist die linke obere Ecke */
const CARD = { w: 112 * 0.6, h: 80 * 0.6 };

const frac = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Pos = { anchor?: unknown; x?: unknown; y?: unknown };

export const tischmitte: Migration = {
  from: 1,
  migrate(stored) {
    const s = stored as { settings?: { players?: unknown }; freePos?: Record<string, Pos> };
    if (!s.freePos || typeof s.freePos !== 'object') return stored;
    const players = typeof s.settings?.players === 'number' ? s.settings.players : 4;
    const old = oldPanel(players);
    const freePos = Object.fromEntries(Object.entries(s.freePos).map(([card, p]) => {
      if (p?.anchor !== 'center' || typeof p.x !== 'number' || typeof p.y !== 'number') return [card, p];
      const x = clamp(old.x + p.x * old.w - SHIFT, MIDDLE.x, MIDDLE.x + MIDDLE.w - CARD.w);
      const y = clamp(OLD_Y + p.y * OLD_H, MIDDLE.y, MIDDLE.y + MIDDLE.h - CARD.h);
      return [card, { anchor: 'center', x: frac((x - MIDDLE.x) / MIDDLE.w), y: frac((y - MIDDLE.y) / MIDDLE.h) }];
    }));
    return { ...s, freePos };
  },
};
