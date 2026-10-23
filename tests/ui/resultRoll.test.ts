// Ergebnisfenster (5t, 10.6): welche Zeilen der Expedition nach einem Wurf einblenden.

import { describe, expect, it } from 'vitest';
import { rolledRows } from '../../src/ui/resultRoll';

describe('rolledRows', () => {
  it('fremder Wurf: nur geänderte Zeilen; erstes Ergebnis: alle', () => {
    expect(rolledRows([1, 2, 3, 4], [1, 9, 3, 4], false, null)).toEqual([1]);
    expect(rolledRows(null, [1, 2, 3, 4], false, null)).toEqual([0, 1, 2, 3]);
  });

  it('eigener Wurf mit gleichem Ergebnis: die gewürfelte Zeile trotzdem; „Alles neu“ alle vier', () => {
    expect(rolledRows([1, 2, 3, 4], [1, 2, 3, 4], true, [2])).toEqual([2]);
    expect(rolledRows([1, 2, 3, 4], [1, 2, 3, 4], true, [0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
  });

  it('fremder Wurf wertet den eigenen Merker nicht aus (etwa nach einem abgelehnten eigenen Befehl)', () => {
    expect(rolledRows([1, 2, 3, 4], [1, 2, 3, 4], false, [2])).toEqual([]);
    expect(rolledRows([1, 2, 3, 4], [5, 2, 3, 4], false, [2])).toEqual([0]);
  });
});
