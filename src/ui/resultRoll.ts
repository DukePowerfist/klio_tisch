// Ergebnisfenster (5t, 10.6): welche Zeilen der Expedition nach einem Wurf kurz einblenden.

/** Geänderte Zeilen gegenüber dem vorigen Stand; beim eigenen Ereignis dazu die selbst gewürfelten (auch bei gleichem
 *  Ergebnis, P1). Ein fremdes Ereignis wertet den eigenen Merker nie aus (Q3), auch wenn es vor dem eigenen ankommt. */
export function rolledRows(was: readonly number[] | null | undefined, next: readonly number[], own: boolean, ownRoll: readonly number[] | null): number[] {
  const rows = new Set(next.flatMap((v, i) => (was?.[i] === v ? [] : [i])));
  if (own && ownRoll) for (const i of ownRoll) rows.add(i);
  return [...rows].sort((a, b) => a - b);
}
