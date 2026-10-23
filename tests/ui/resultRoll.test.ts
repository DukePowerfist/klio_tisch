// Ergebnisfenster (5t, 10.6): welche Zeilen der Expedition nach einem Wurf einblenden.

import { describe, expect, it } from 'vitest';
import { OwnRolls, rolledRows } from '../../src/ui/resultRoll';

describe('rolledRows', () => {
  it('fremder Wurf: nur geänderte Zeilen; erstes Ergebnis: alle', () => {
    expect(rolledRows([1, 2, 3, 4], [1, 9, 3, 4], null)).toEqual([1]);
    expect(rolledRows(null, [1, 2, 3, 4], null)).toEqual([0, 1, 2, 3]);
  });

  it('eigener Wurf mit gleichem Ergebnis: die gewürfelte Zeile trotzdem; „Alles neu“ alle', () => {
    expect(rolledRows([1, 2, 3, 4], [1, 2, 3, 4], 2)).toEqual([2]);
    expect(rolledRows([1, 2, 3, 4], [5, 2, 3, 4], 2)).toEqual([0, 2]);
    expect(rolledRows([1, 2, 3, 4], [1, 2, 3, 4], 'all')).toEqual([0, 1, 2, 3]);
  });
});

describe('OwnRolls', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('angenommen: das eigene Ereignis nimmt den Wurf, der Reihe nach', async () => {
    const q = new OwnRolls();
    q.sent(2, Promise.resolve({ ok: true }));
    q.sent('all', Promise.resolve({ ok: true }));
    expect(q.take()).toBe(2);
    expect(q.take()).toBe('all');
    await tick();
    expect(q.take()).toBe(null);
  });

  it('abgelehnter Wurf einer Zeile fällt heraus; der nächste Wurf aller Zeilen bekommt „alle“ (5x)', async () => {
    const q = new OwnRolls();
    q.sent(2, Promise.resolve({ ok: false }));
    await tick();
    q.sent('all', Promise.resolve({ ok: true }));
    expect(q.take()).toBe('all');
  });

  it('abgelehnt nach Wert: ein früherer gleicher, schon genommener Wurf stört nicht', async () => {
    const q = new OwnRolls();
    let reject!: (r: { ok: boolean }) => void;
    q.sent(1, Promise.resolve({ ok: true }));
    expect(q.take()).toBe(1); // Ereignis vor der Antwort
    q.sent(1, new Promise((r) => (reject = r)));
    q.sent(3, Promise.resolve({ ok: true }));
    reject({ ok: false });
    await tick();
    expect(q.take()).toBe(3);
    expect(q.take()).toBe(null);
  });
});
