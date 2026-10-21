// Kette der Migrationen (ARCHITEKTUR.md 7, Versionierung): Schritt für Schritt bis zum aktuellen Format.

import { describe, expect, it } from 'vitest';
import { migrate, NewerFormatError } from '../../src/engine/migrate';
import { FORMAT } from '../../src/engine/setup';
import type { Migration } from '../../src/engine/types';
import { engine, fresh } from '../helpers';

describe('Migrationen', () => {
  const steps: Migration[] = Array.from({ length: FORMAT - 1 }, (_, i) => ({
    from: i + 1,
    migrate: (s) => ({ ...(s as object), seen: [...((s as { seen?: number[] }).seen ?? []), i + 1] }),
  }));

  it('läuft von jedem älteren Format Schritt für Schritt bis zum aktuellen und setzt die Nummer', () => {
    expect(migrate({ format: 1 }, steps)).toEqual({ format: FORMAT, seen: steps.map((m) => m.from) });
  });

  it('aktuelles Format und Eingaben ohne Format bleiben unverändert (prüft das Schema)', () => {
    const now = { format: FORMAT, x: 1 };
    expect(migrate(now, steps)).toBe(now);
    expect(migrate('kaputt', steps)).toBe('kaputt');
    expect(migrate(null, steps)).toBe(null);
  });

  it('neueres Format: eigener Fehler mit Hinweis zum Neuladen', () => {
    expect(() => migrate({ format: FORMAT + 1 }, steps)).toThrow(NewerFormatError);
    expect(() => migrate({ format: FORMAT + 1 }, steps)).toThrow(/neu laden/);
  });

  it('fehlender Schritt: Fehler statt Endlosschleife', () => {
    expect(() => migrate({ format: 1 }, [])).toThrow(/Format 1/);
  });

  it('Format 2 → 3 (5e): Plätze ohne Farbe bleiben, wie sie sind', () => {
    const s = fresh();
    const parsed = engine.parseState({ ...structuredClone(s), format: 2 });
    expect(parsed.format).toBe(3);
    expect(parsed.seats).toEqual(s.seats);
  });
});
