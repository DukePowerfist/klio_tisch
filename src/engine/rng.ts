// Zufall (ARCHITEKTUR.md 6.3): wird übergeben, nie direkt Math.random().
// Host: kryptografisch. Tests: feste Startzahl, damit Ergebnisse wiederholbar sind.

import type { Rng } from './types';

/** Kryptografischer Zufall für den Host, ohne Verzerrung (Verwerfungsverfahren). */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return {
    int(n) {
      if (!Number.isSafeInteger(n) || n <= 0 || n > 2 ** 32) throw new RangeError(`int(${n})`);
      const limit = 2 ** 32 - (2 ** 32 % n);
      for (;;) {
        crypto.getRandomValues(buf);
        const v = buf[0]!;
        if (v < limit) return v % n;
      }
    },
  };
}

/** Wiederholbarer Zufall für Tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  return {
    int(n) {
      if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`int(${n})`);
      return Math.floor(next() * n);
    },
  };
}

/** Fisher-Yates, gibt eine neue Liste zurück (A26: ohne Wiederholungszwang). */
export function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function pick<T>(list: readonly T[], rng: Rng): T {
  if (list.length === 0) throw new RangeError('pick aus leerer Liste');
  return list[rng.int(list.length)]!;
}
