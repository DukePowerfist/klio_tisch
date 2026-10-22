// Stapelmenü (ARCHITEKTUR.md 10.2, Schritt 5o): Einträge mit Grund fürs Ausgrauen, Wirkung des Mischens, Lage am Anker.
// Rein, damit testbar; angezeigt wird in StackMenu.svelte. `placeMenu` kennt keine Stapel (auch für das Namensschild, 5p).

import type { CardId, TableState, ZoneId } from '../engine/types';
import type { KlioContent } from '../rules/klio/content/validate';
import type { Rect } from './layout';
import { t } from './texts';

// ---------- Einträge ----------

export type StackAction = 'draw' | 'flip' | 'shuffle';

/** Feste Reihenfolge: Ziehen als Hauptknopf, Trennlinie, Umdrehen, Mischen */
export const STACK_ACTIONS: readonly StackAction[] = ['draw', 'flip', 'shuffle'];

export type StackEntry = {
  action: StackAction;
  label: string;
  /** Recht vorhanden; ohne ein einziges Recht ist der Stapel kein Knopf */
  allowed: boolean;
  /** jetzt möglich; sonst ausgegraut mit Grund in `title` */
  enabled: boolean;
  /** Tooltip: was passiert (mit Kürzel) oder warum es nicht geht */
  title: string;
  /** Kürzel bei offenem Menü, klein geschrieben */
  key: string;
  /** nur Mischen: was es einsammelt; `confirm` ist der Text der Rückfrage, null = ohne Rückfrage */
  effect?: ShuffleEffect;
  confirm?: string | null;
};

export type StackContext = {
  content: KlioContent;
  table: TableState<unknown>;
  /** Stapel auf dem Tisch (Zone mit Aktionen in zones.yaml) */
  zone: ZoneId;
  /** darf der Nutzer diesen Befehl an diesem Stapel? (session.can) */
  can: (type: string) => boolean;
  /** Stand nach dem Befehl, ohne Senden; null bei Ablehnung (session.predict, N1) */
  predict: (cmd: { type: string; zone: ZoneId }) => TableState<unknown> | null;
};

const cards = (n: number) => (n === 1 ? t('stack.cardsOne') : t('stack.cardsMany', { n }));
/** „A“, „A und B“, „A, B und C“ */
const list = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${t('stack.and')} ${items.at(-1)}`);

export function stackEntries(c: StackContext): StackEntry[] {
  const actions = c.content.zones[c.zone]?.actions ?? {};
  const empty = (c.table.zones[c.zone] ?? []).length === 0;
  return STACK_ACTIONS.map((action) => {
    const key = t(`stack.keys.${action}`);
    const base = { action, label: t(`zones.actions.${action}`), key: key.toLowerCase() };
    const allowed = actions[action] !== undefined && c.can(`zone.${action}`);
    const off = (reason: string) => ({ ...base, allowed, enabled: false, title: t(reason) });
    if (actions[action] === undefined) return off('reject.noAction');
    if (!allowed) return off('reject.notAllowed');
    if (action !== 'shuffle') {
      if (empty) return off('stack.empty');
      const title = action === 'draw' ? t('stack.drawTitle', { to: t(`stack.drawTo.${actions.draw!.to}`), key }) : t('stack.flipTitle', { key });
      return { ...base, allowed, enabled: true, title };
    }
    const after = c.predict({ type: 'zone.shuffle', zone: c.zone });
    if (!after) return off('reject.noAction');
    const effect = shuffleEffect(c.table, after);
    if (empty && effect.total === 0) return { ...off('stack.empty'), effect, confirm: null };
    return { ...base, allowed, enabled: true, title: shuffleTitle(effect, c.zone, key), effect, confirm: effect.total ? t('stack.confirm', { cards: cards(effect.total) }) : null };
  });
}

function shuffleTitle(e: ShuffleEffect, zone: ZoneId, key: string): string {
  if (e.total === 0) return t('stack.shuffleTitle', { key });
  const elsewhere = Object.entries(e.into).filter(([z]) => z !== zone);
  const n = elsewhere.reduce((s, [, k]) => s + k, 0);
  const others = n ? t('stack.others', { n, names: list(elsewhere.map(([z]) => t(`stack.names.${z}`))) }) : '';
  return t('stack.gatherTitle', { cards: cards(e.total), from: list(e.from.map((z) => t(`stack.gatherFrom.${z}`))), others, key });
}

// ---------- Wirkung des Mischens ----------

export type ShuffleEffect = {
  /** Zahl der Karten, die von woanders kommen */
  total: number;
  /** woher, in der Reihenfolge der Zonen im Stand */
  from: ZoneId[];
  /** wohin, mit Anzahl; in der Reihenfolge der Zonen im Stand */
  into: Record<ZoneId, number>;
  /** sortierte Karten-IDs: Kennung für die Rückfrage (N6) */
  key: string;
};

/** Vergleicht die Zonen vor und nach einem Probelauf von `zone.shuffle` (N1): Mischen selbst rechnet die Engine. */
export function shuffleEffect(before: TableState<unknown>, after: TableState<unknown>): ShuffleEffect {
  const was = new Map<CardId, ZoneId>();
  for (const [z, ids] of Object.entries(before.zones)) for (const id of ids ?? []) was.set(id, z);
  const from = new Set<ZoneId>();
  const into: Record<ZoneId, number> = {};
  const moved: CardId[] = [];
  for (const [z, ids] of Object.entries(after.zones)) {
    for (const id of ids ?? []) {
      const old = was.get(id);
      if (old === undefined || old === z) continue;
      from.add(old);
      into[z] = (into[z] ?? 0) + 1;
      moved.push(id);
    }
  }
  return { total: moved.length, from: [...from], into, key: moved.sort().join(',') };
}

// ---------- Lage ----------

export type Side = 'left' | 'right' | 'below' | 'above';

/** Nutzbarer Bereich (N8): Rechteck, darin gesperrte Stellen (Dock, Menüknopf) */
export type Area = { bounds: Rect; blocked: Rect[] };

export type Placement = {
  x: number;
  y: number;
  side: Side;
  /** Lage des Zipfels auf der Kante zum Anker (von oben bzw. links), begrenzt auf den geraden Teil der Kante;
   *  null = kein Zipfel (die Höhe des Ankers liegt außerhalb des Panels, oder das Panel liegt nicht am Anker) */
  tip: number | null;
  /** keine Lage erfüllte Regel 1 und 2 zugleich (N2) */
  fallback: boolean;
};

/** Abstand zwischen Anker und Panel (Platz für den Zipfel) */
export const MENU_GAP = 10;
/** Zipfel zeigt auf die Mitte der oberen Hälfte des Ankers (bei unten/oben auf seine Mitte), nur auf dem geraden Teil
 *  der Kante: mindestens Eckenradius 10 plus halbe Zipfelbreite 6 vom Rand (N3) */
export const TIP_INSET = 16;

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const horizontal = (side: Side) => side === 'left' || side === 'right';

/** Lage auf der Achse vom Anker weg (x bei links/rechts, y bei unten/oben) */
function mainAt(side: Side, a: Rect, p: { w: number; h: number }): number {
  switch (side) {
    case 'left':
      return a.x - MENU_GAP - p.w;
    case 'right':
      return a.x + a.w + MENU_GAP;
    case 'below':
      return a.y + a.h + MENU_GAP;
    case 'above':
      return a.y - MENU_GAP - p.h;
  }
}

/**
 * Lage eines Menüs am Anker (ARCHITEKTUR.md 10.2). Rangfolge: (1) vollständig im nutzbaren Bereich, Anker frei;
 * (2) nichts aus `avoid` überdeckt; (3) erste mögliche Seite aus `sides`; (4) bündig mit dem Anker (oben bzw. links),
 * sonst so wenig wie nötig verschoben. Geht das nirgends, der Ersatzfall: (i) sichtbar, (ii) Anker frei, (iii) `avoid`
 * nach Wichtigkeit möglichst wenig verdeckt, bei Gleichstand die frühere Seite.
 */
export function placeMenu(anchor: Rect, avoid: Rect[], area: Area, panel: { w: number; h: number }, sides: readonly Side[]): Placement {
  const { bounds, blocked } = area;
  const rect = (side: Side, main: number, cross: number): Rect =>
    horizontal(side) ? { x: main, y: cross, ...panel } : { x: cross, y: main, ...panel };
  // Lagen quer zur Seite: bündig, an den Rändern des Bereichs und direkt neben jedem Hindernis
  function crossings(side: Side): number[] {
    const h = horizontal(side);
    const size = h ? panel.h : panel.w;
    const start = (r: Rect) => (h ? r.y : r.x);
    const len = (r: Rect) => (h ? r.h : r.w);
    const aligned = start(anchor);
    const all = [aligned, start(bounds), start(bounds) + len(bounds) - size];
    for (const r of [...blocked, ...avoid]) all.push(start(r) - size, start(r) + len(r));
    return [...new Set(all)].sort((p, q) => Math.abs(p - aligned) - Math.abs(q - aligned) || p - q);
  }
  const within = (r: Rect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
  const tipAt = (side: Side, r: Rect): number | null => {
    const at = horizontal(side) ? anchor.y + anchor.h / 4 - r.y : anchor.x + anchor.w / 2 - r.x;
    const len = horizontal(side) ? r.h : r.w;
    return at < 0 || at > len ? null : clampTo(at, TIP_INSET, len - TIP_INSET);
  };

  for (const side of sides) {
    const main = mainAt(side, anchor, panel);
    for (const cross of crossings(side)) {
      const r = rect(side, main, cross);
      if (within(r) && blocked.every((b) => !overlap(r, b)) && !overlap(r, anchor) && avoid.every((v) => !overlap(r, v)))
        return { x: r.x, y: r.y, side, tip: tipAt(side, r), fallback: false };
    }
  }

  // Ersatzfall (N2, N3): ins Fenster geschoben, nach Vorrang bewertet
  let best: { r: Rect; side: Side; tip: number | null; score: number[] } | null = null;
  for (const [i, side] of sides.entries()) {
    const h = horizontal(side);
    const raw = mainAt(side, anchor, panel);
    const main = h ? clampTo(raw, bounds.x, bounds.x + bounds.w - panel.w) : clampTo(raw, bounds.y, bounds.y + bounds.h - panel.h);
    for (const c of crossings(side)) {
      const cross = h ? clampTo(c, bounds.y, bounds.y + bounds.h - panel.h) : clampTo(c, bounds.x, bounds.x + bounds.w - panel.w);
      const r = rect(side, main, cross);
      const hidden = panel.w * panel.h - overlap(r, bounds) + blocked.reduce((s, b) => s + overlap(r, b), 0);
      const score = [hidden, overlap(r, anchor), ...avoid.map((v) => overlap(r, v)), i, Math.abs(cross - (h ? anchor.y : anchor.x))];
      if (!best || less(score, best.score)) best = { r, side, tip: main === raw ? tipAt(side, r) : null, score };
    }
  }
  const b = best!;
  return { x: b.r.x, y: b.r.y, side: b.side, tip: b.tip, fallback: true };
}

/** wie clamp, aber bei zu kleinem Bereich bündig mit dessen Anfang */
const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

const less = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};
