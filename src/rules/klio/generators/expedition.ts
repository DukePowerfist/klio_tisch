// Expedition und Orakel (nur SL würfelt, alle sehen das Ergebnis, 13.1).

import type { Rng } from '../../../engine/types';
import type { KlioEventOf } from '../events';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
const ORACLE_SUITS = ['H', 'S', 'C'] as const;

/** Alle vier Tabellen neu oder nur eine (die übrigen bleiben). */
export function rollExpedition(current: readonly number[] | null, table: number | undefined, rng: Rng): KlioEventOf<'expeditionRolled'> {
  const next = current && table !== undefined ? [...current] : [0, 1, 2, 3].map(() => rng.int(13));
  if (current && table !== undefined) next[table] = rng.int(13);
  return { type: 'expeditionRolled', expedition: next };
}

/** Zwei Begriffe; nie zweimal dieselbe Karte (wie bisher). */
export function drawOracle(rng: Rng): KlioEventOf<'oracleDrawn'> {
  const one = () => ({ suit: ORACLE_SUITS[rng.int(3)]!, rank: RANKS[rng.int(13)]! });
  const a = one();
  let b = one();
  while (a.suit === b.suit && a.rank === b.rank) b = one();
  return { type: 'oracleDrawn', oracle: [a, b] };
}
