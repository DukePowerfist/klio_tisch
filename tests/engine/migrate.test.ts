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

  it('Engine und Regelwerk mit einem Schritt zur selben Nummer: beide laufen, die Nummer steigt einmal (5r)', () => {
    const tag = (name: string): Migration => ({ from: FORMAT - 1, migrate: (s) => ({ ...(s as object), [name]: true }) });
    expect(migrate({ format: FORMAT - 1 }, [tag('engine'), tag('regelwerk')])).toEqual({ format: FORMAT, engine: true, regelwerk: true });
  });

  it('fehlender Schritt: Fehler statt Endlosschleife', () => {
    expect(() => migrate({ format: 1 }, [])).toThrow(/Format 1/);
  });

  it('Format 2 → 3 (5e): Plätze ohne Farbe bleiben, wie sie sind', () => {
    const s = fresh();
    const parsed = engine.parseState({ ...structuredClone(s), format: 2 });
    expect(parsed.format).toBe(FORMAT);
    expect(parsed.seats).toEqual(s.seats);
  });

  it('Format 3 → 4 (5n): alte Stände bekommen eine brennende Laterne', () => {
    const { lamp: _, ...old } = structuredClone(fresh());
    const parsed = engine.parseState({ ...old, format: 3 });
    expect(parsed.format).toBe(4);
    expect(parsed.lamp).toBe(true);
    expect(() => engine.parseState({ ...structuredClone(fresh()), format: 5 })).toThrow(NewerFormatError);
  });
});

describe('Stand prüfen: jede Karte genau einmal (5r)', () => {
  const broken = (change: (s: ReturnType<typeof fresh>) => void) => {
    const s = structuredClone(fresh());
    change(s);
    return () => engine.parseState(s);
  };

  it('ein heiler Stand geht durch', () => {
    expect(() => engine.parseState(fresh())).not.toThrow();
  });

  it('doppelte, fehlende und unbekannte Karten werden abgelehnt', () => {
    expect(broken((s) => s.zones['discard']!.push(s.zones['deck']!.at(-1)!))).toThrow(/2-mal/);
    expect(broken((s) => s.zones['deck']!.pop())).toThrow(/fehlt/);
    expect(broken((s) => s.zones['discard']!.push('H1' as never))).toThrow();
  });

  it('unbekannte Zone wird abgelehnt', () => {
    expect(broken((s) => (s.zones['damage'] = []))).toThrow(/unbekannte Zone damage/);
  });

  it('freie Karten und ihre Lage müssen zusammenpassen', () => {
    expect(broken((s) => s.free.push(s.zones['deck']!.pop()!))).toThrow(/ohne Lage/);
    expect(broken((s) => (s.freePos[s.zones['deck']!.at(-1)!] = { anchor: 'center', x: 0.5, y: 0.5 }))).toThrow(/nicht frei liegt/);
  });
});
