// Lage der Testkarte. Ohne Host im Verbindungstest: Jeder darf bewegen,
// die neueste Bewegung gewinnt (Zähler, bei Gleichstand die Peer-ID).

export type CardPos = { x: number; y: number; clock: number; by: string };

export function newer(a: CardPos, b: CardPos): CardPos {
  if (a.clock !== b.clock) return a.clock > b.clock ? a : b;
  return a.by >= b.by ? a : b;
}

export function moveTo(current: CardPos, x: number, y: number, self: string): CardPos {
  return { x: clamp01(x), y: clamp01(y), clock: current.clock + 1, by: self };
}

export function isCardPos(v: unknown): v is CardPos {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.x === 'number' && typeof c.y === 'number' &&
    Number.isFinite(c.x) && Number.isFinite(c.y) &&
    Number.isSafeInteger(c.clock) && typeof c.by === 'string'
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
