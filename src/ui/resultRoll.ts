// Ergebnisfenster (5t, 10.6): welche Zeilen der Expedition nach einem Wurf kurz einblenden.

/** Zeilen eines eigenen Wurfs: eine Zeile (`table`) oder alle (ohne `table`) */
export type OwnRoll = number | 'all';

/** Geänderte Zeilen gegenüber dem vorigen Stand, dazu die selbst gewürfelten (auch bei gleichem Ergebnis, P1). Den
 *  eigenen Wurf übergibt der Aufrufer nur beim eigenen Ereignis (Q3). */
export function rolledRows(was: readonly number[] | null | undefined, next: readonly number[], own: OwnRoll | null): number[] {
  return next.flatMap((v, i) => (was?.[i] !== v || own === 'all' || own === i ? [i] : []));
}
