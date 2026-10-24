// Welche Zeilen der Expedition nach einem Wurf kurz einblenden (5t, seit 5zb in der Leselage des Blatts, 10.12).

/** Zeilen eines eigenen Wurfs: eine Zeile (`table`) oder alle (ohne `table`) */
export type OwnRoll = number | 'all';

/** Geänderte Zeilen gegenüber dem vorigen Stand, dazu die selbst gewürfelten (auch bei gleichem Ergebnis, P1). Den
 *  eigenen Wurf übergibt der Aufrufer nur beim eigenen Ereignis (Q3). */
export function rolledRows(was: readonly number[] | null | undefined, next: readonly number[], own: OwnRoll | null): number[] {
  return next.flatMap((v, i) => (was?.[i] !== v || own === 'all' || own === i ? [i] : []));
}

/** Gesendete eigene Würfe der Expedition, der Reihe nach; jedes eigene Ereignis dazu nimmt den ältesten (Q3). Ein
 *  abgelehnter Wurf (ohne Ereignis) fällt wieder heraus, sonst nähme ihn das nächste eigene Ereignis (5x). Nach Wert:
 *  Gleiche Werte sind austauschbar, und angenommene hat ihr Ereignis schon genommen (der Host schickt es vor der
 *  Antwort). */
export class OwnRolls {
  private queue: OwnRoll[] = [];
  sent(roll: OwnRoll, result: Promise<{ ok: boolean }>): void {
    this.queue.push(roll);
    void result.then((r) => {
      if (r.ok) return;
      const i = this.queue.indexOf(roll);
      if (i >= 0) this.queue.splice(i, 1);
    });
  }
  take(): OwnRoll | null {
    return this.queue.shift() ?? null;
  }
}
