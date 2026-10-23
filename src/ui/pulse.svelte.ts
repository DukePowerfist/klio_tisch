// Kurz sichtbare Markierungen (Treffer, Ankommen, fremde Änderung; 11): eine reaktive Menge, deren Einträge von
// selbst wieder verschwinden.

export const PULSE_MS = 650;

/** Menge, deren Einträge nach kurzer Zeit (bzw. wenn `until` erfüllt ist) von selbst wieder verschwinden (reaktiv).
 *  Kommt ein Schlüssel erneut, bevor er verschwunden ist, bleibt er bis zum Ende seines letzten Pulses (5x). */
export class Pulse<K> {
  private items = $state.raw<ReadonlySet<K>>(new Set());
  /** laufende Pulse je Schlüssel */
  private running = new Map<K, number>();
  has = (k: K): boolean => this.items.has(k);
  add(keys: K[], until: Promise<unknown> = new Promise((r) => setTimeout(r, PULSE_MS))): void {
    for (const k of keys) this.running.set(k, (this.running.get(k) ?? 0) + 1);
    this.items = new Set([...this.items, ...keys]);
    void until.then(() => {
      const gone = keys.filter((k) => {
        const n = (this.running.get(k) ?? 1) - 1;
        if (n > 0) this.running.set(k, n);
        else this.running.delete(k);
        return n <= 0;
      });
      if (gone.length > 0) this.items = new Set([...this.items].filter((k) => !gone.includes(k)));
    });
  }
}
