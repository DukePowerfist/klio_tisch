// Gespeicherte Stände auf das aktuelle Format bringen (ARCHITEKTUR.md 7, Versionierung): eine Kette, je Schritt
// eine Formatnummer. Die Schritte liefert das Regelwerk (`Ruleset.migrations`); geprüft wird erst danach.

import { FORMAT } from './setup';
import type { Migration } from './types';

/** Stand aus einer neueren Fassung: diese kann ihn nicht lesen. */
export class NewerFormatError extends Error {}

export function migrate(input: unknown, migrations: readonly Migration[]): unknown {
  let stored = input;
  for (;;) {
    const format = (stored as { format?: unknown } | null)?.format;
    // kein Format bzw. schon aktuell: den Rest prüft das Schema
    if (typeof format !== 'number' || format === FORMAT) return stored;
    if (format > FORMAT) throw new NewerFormatError(`Der Spielstand stammt aus einer neueren Fassung (Format ${format}, diese kennt ${FORMAT}). Bitte die Seite neu laden.`);
    // Engine und Regelwerk können zur selben Nummer je einen Schritt haben: alle laufen, in der Reihenfolge der Liste
    const steps = migrations.filter((m) => m.from === format);
    if (steps.length === 0) throw new Error(`Spielstand im Format ${format} lässt sich nicht umwandeln`);
    stored = { ...(steps.reduce((s, step) => step.migrate(s), stored) as object), format: format + 1 };
  }
}
