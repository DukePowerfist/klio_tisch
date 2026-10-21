// Expedition und Orakel (nur SL würfelt, alle sehen das Ergebnis, 13.1).

import { pick } from '../../../engine/rng';
import { RANKS, type Rng } from '../../../engine/types';
import type { KlioEventOf } from '../events';
import { ORACLE_SUITS } from '../state';

/** Alle vier Tabellen neu oder nur eine (die übrigen bleiben). */
export function rollExpedition(current: readonly number[] | null, table: number | undefined, rng: Rng): KlioEventOf<'expeditionRolled'> {
  let next: number[];
  if (current && table !== undefined) {
    next = [...current];
    next[table] = rng.int(13);
  } else {
    next = [0, 1, 2, 3].map(() => rng.int(13));
  }
  return { type: 'expeditionRolled', expedition: next };
}

/** Zwei Begriffe; nie zweimal dieselbe Karte (wie bisher). */
export function drawOracle(rng: Rng): KlioEventOf<'oracleDrawn'> {
  const one = () => ({ suit: pick(ORACLE_SUITS, rng), rank: pick(RANKS, rng) });
  const a = one();
  let b = one();
  while (a.suit === b.suit && a.rank === b.rank) b = one();
  return { type: 'oracleDrawn', oracle: [a, b] };
}
