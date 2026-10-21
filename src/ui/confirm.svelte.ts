// Bestätigen durch einen zweiten Klick (Auswürfeln, Charakter zurücksetzen; 10.1): Der erste Klick macht scharf,
// ein zweiter innerhalb der Frist führt aus. Genutzt vom Knopf am Bogen und vom Menü am Namensschild.

export class Confirm {
  /** wartet auf den zweiten Klick */
  armed = $state(false);
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly ms = 3500) {}

  /** Klick: true = jetzt ausführen. Ohne `needed` (nichts ginge verloren) sofort. */
  click(needed: boolean): boolean {
    if (needed && !this.armed) {
      this.armed = true;
      this.#timer = setTimeout(() => (this.armed = false), this.ms);
      return false;
    }
    this.cancel();
    return true;
  }

  cancel(): void {
    clearTimeout(this.#timer);
    this.armed = false;
  }
}
